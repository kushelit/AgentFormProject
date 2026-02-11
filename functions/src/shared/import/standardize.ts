// functions/src/shared/import/standardize.ts
import {normalizeHeader, parseReportMonth, sanitizeMonth} from "../month";
import {BaseRow, CommissionTemplate, Mapping, StandardizedRow} from "./types";

const VAT_DEFAULT = 0.17;

function roundTo2(num: number) {
  return Math.round(num * 100) / 100;
}

function toNum(v: any): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  let s = String(v).trim();
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[,\s]/g, "");
  const n = parseFloat(s);
  return (neg ? -1 : 1) * (isNaN(n) ? 0 : n);
}

function pick(row: any, keys: string[]) {
  for (const k of keys) {
    if (k in row) return row[k];
    const nk = normalizeHeader(k);
    if (nk in row) return row[nk];
  }
  return undefined;
}


function toPadded9(v: any): string {
  const digits = String(v ?? "").replace(/\D/g, "");
  return digits ? digits.padStart(9, "0").slice(-9) : "";
}

function normalizeProduct(v: any): string {
  const s = String(v ?? "").trim();
  return s.replace(/\s+/g, " ").replace(/\u200f|\u200e/g, "");
}

function normalizeFullName(first?: any, last?: any) {
  return [String(first ?? "").trim(), String(last ?? "").trim()]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/\u200f|\u200e/g, "");
}

// Hebrew month name -> "01".."12"
const HEB_MONTHS: Record<string, string> = {
  ינואר: "01",
  פברואר: "02",
  מרץ: "03",
  אפריל: "04",
  מאי: "05",
  יוני: "06",
  יולי: "07",
  אוגוסט: "08",
  ספטמבר: "09",
  אוקטובר: "10",
  נובמבר: "11",
  דצמבר: "12",
  ינו: "01",
  פבר: "02",
  אפר: "04",
  יונ: "06",
  יול: "07",
  אוג: "08",
  ספט: "09",
  אוק: "10",
  נוב: "11",
  דצמ: "12",
};

function monthNameToMM(name: any): string {
  const s = normalizeHeader(String(name ?? ""));
  return HEB_MONTHS[s] || "";
}

// overrides כמו אצלך
const commissionOverrides: Record<string, (row: any) => number> = {
  ayalon_insurance: (row) =>
    toNum(pick(row, ["סך עמלת סוכן"])) +
    toNum(pick(row, ["סך דמי גביה", "סך דמי גבייה"])),

  menura_new_nifraim: (row) =>
    toNum(pick(row, ["סוכן-סכום עמלה", "סוכן - סכום עמלה"])) +
    toNum(
      pick(row, [
        "סוכן-דמי גביה",
        "סוכן - דמי גביה",
        "סוכן-דמי גבייה",
        "סוכן - דמי גבייה",
      ])
    ),
};

/**
 * הופך שורה גולמית לשורה סטנדרטית לפי mapping + חריגים.
 * זה אמור להיות “מקור אמת” משותף לידני ול-worker.
 */
export function standardizeRowWithTemplate(params: {
  rawRow: any;
  template: CommissionTemplate;
  base: BaseRow;
  fallbackReportMonth?: string;
  date1904?: boolean;
}): StandardizedRow {
  const {rawRow, template, base, fallbackReportMonth, date1904} = params;

  const result: any = {...base};

  // 1) מיפוי בסיסי
  const mapping: Mapping = template.fields || {};
  for (const [excelCol, systemField] of Object.entries(mapping)) {
    const key = normalizeHeader(excelCol);
    const value = rawRow[key] ?? rawRow[excelCol];

    if (systemField === "validMonth" || systemField === "reportMonth") {
      let parsed = parseReportMonth(value, {
        templateId: template.templateId,
        date1904,
      });

      if (!parsed && systemField === "reportMonth" && fallbackReportMonth) {
        parsed = fallbackReportMonth;
      }
      result[systemField] = parsed || value;
      continue;
    }

    if (systemField === "commissionAmount") {
      const override = commissionOverrides[template.templateId];
      let commission = override ? override(rawRow) : toNum(value);

      if (template.commissionIncludesVAT) {
        commission = commission / (1 + VAT_DEFAULT);
      }
      result.commissionAmount = roundTo2(commission);
      continue;
    }

    if (systemField === "premium") {
      if (template.templateId === "fenix_insurance") {
        const sector = String(pick(rawRow, ["ענף"]) ?? "").trim();
        const accRaw = pick(rawRow, ["צבירה", "סכום צבירה"]);
        const premRaw = pick(rawRow, ["פרמיה", "סכום פרמיה"]);
        result.premium = toNum(sector === "פיננסים וזמן פרישה" ? (accRaw ?? premRaw) : premRaw);
      } else {
        result.premium = toNum(value);
      }
      continue;
    }

    if (systemField === "product") {
      const p = normalizeProduct(value);
      if (p) result.product = p;
      continue;
    }

    if (systemField === "customerId" || systemField === "IDCustomer") {
      const raw = String(value ?? "").trim();
      result.customerIdRaw = raw;
      result.customerId = toPadded9(value);
      continue;
    }

    if (systemField === "policyNumber") {
      result.policyNumber = String(value ?? "").trim();
      continue;
    }

    // default
    result[systemField] = value;
  }

  // 2) fullName חריגים
  if (template.templateId === "mor_insurance") {
    if (result.fullName) {
      result.fullName = normalizeFullName(result.fullName, "");
    } else {
      const first = rawRow[normalizeHeader("שם פרטי")] ?? rawRow["שם פרטי"];
      const last = rawRow[normalizeHeader("שם משפחה")] ?? rawRow["שם משפחה"];
      const full = normalizeFullName(first, last);
      if (full) result.fullName = full;
    }
  } else if (template.templateId === "clal_pensia") {
    if (result.fullName) {
      result.fullName = normalizeFullName(result.fullName, "");
    } else {
      const first =
        rawRow[normalizeHeader("שם פרטי עמית")] ?? rawRow["שם פרטי עמית"];
      const last =
        rawRow[normalizeHeader("שם משפחה עמית")] ?? rawRow["שם משפחה עמית"];
      const full = normalizeFullName(first, last);
      if (full) result.fullName = full;
    }

    if (!result.policyNumber && result.customerId) {
      result.policyNumber = String(result.customerId).trim();
    }
  }

  // 3) Altshuler override: reportMonth = year + hebMonth
  if (template.templateId === "altshuler_insurance") {
    const rawMonth = rawRow[normalizeHeader("חודש")] ?? rawRow["חודש"];
    const rawYear = rawRow[normalizeHeader("שנה")] ?? rawRow["שנה"];

    const mm = monthNameToMM(rawMonth);
    let yyyy = String(rawYear ?? "").trim();

    if (/^\d{2}$/.test(yyyy)) {
      const yy = parseInt(yyyy, 10);
      yyyy = yy < 50 ? `20${yyyy}` : `19${yyyy}`;
    }

    if (mm && /^\d{4}$/.test(yyyy)) {
      result.reportMonth = `${yyyy}-${mm}`;
    }
  }

  // 4) fallbackProduct
  if (!result.product || !String(result.product).trim()) {
    if (template.fallbackProduct) {
      result.product = normalizeProduct(template.fallbackProduct);
    }
  }

  // 5) normalize months
  if (result.reportMonth) result.reportMonth = sanitizeMonth(result.reportMonth);
  if (result.validMonth) result.validMonth = sanitizeMonth(result.validMonth);

  // 6) normalize ids
  if (result.customerId) result.customerId = toPadded9(result.customerId);

  return result as StandardizedRow;
}

export function standardizeRows(params: {
  rawRows: any[];
  template: CommissionTemplate;
  base: BaseRow;
  fallbackReportMonth?: string;
  date1904?: boolean;
}) {
  const {rawRows, template, base, fallbackReportMonth, date1904} = params;

  // agentCode column exists if mapping maps something to agentCode
  const mapping = template.fields || {};
  const agentCodeExcelColRaw =
    Object.entries(mapping).find(([, sys]) => sys === "agentCode")?.[0] || "";
  const agentCodeKey = normalizeHeader(agentCodeExcelColRaw);

  const standardized: StandardizedRow[] = rawRows
    .filter((r) => {
      if (!agentCodeKey) return true;
      const val = r[agentCodeKey] ?? r[agentCodeExcelColRaw];
      return val && String(val).trim() !== "";
    })
    .map((r) =>
      standardizeRowWithTemplate({
        rawRow: r,
        template,
        base,
        fallbackReportMonth,
        date1904,
      })
    );

  const monthsInFile = Array.from(
    new Set(standardized.map((r) => sanitizeMonth(r.reportMonth)).filter(Boolean))
  ).sort();

  const agentCodes = Array.from(
    new Set(
      standardized
        .map((r) => String(r.agentCode ?? "").trim())
        .filter(Boolean)
    )
  );

  return {standardized, monthsInFile, agentCodes};
}
