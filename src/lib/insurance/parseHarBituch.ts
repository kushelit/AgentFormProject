/**
 * parseHarBituch.ts
 * ─────────────────────────────────────────────────────────────
 * מנתח קובץ Excel מהר הביטוח (הופק מאתר משרד האוצר)
 * תומך בפורמט XLSX בלבד
 *
 * שימוש:
 *   const rows = await parseHarBituchXlsx(file);
 */

// ─── Types ────────────────────────────────────────────────────

export type InsuranceBranch =
  | "ביטוח חיים"
  | "ביטוח בריאות"
  | "ביטוח סיעודי"
  | "ביטוח תאונות אישיות"
  | "ביטוח רכב"
  | "ביטוח דירה"
  | "אחר";

export type InsuranceClassification = "אישי" | "קבוצתי קופת חולים" | "קבוצתי מעסיק" | null;

export type PremiumType = "חודשית" | "שנתית" | "רבעונית" | null;

export interface HarBituchRow {
  // מזהים
  idNumber: string | null;           // תעודת זהות
  policyNumber: string;              // מספר פוליסה

  // סיווג
  branchMain: string;               // ענף ראשי (כפי שמופיע בקובץ)
  branchSub: string;                // ענף משני
  productType: InsuranceBranch;     // מנורמל לסוג מוצר
  isLifeOrHealth: boolean;          // האם ביטוח חיים/בריאות/סיעוד (לא אלמנטרי)

  // חברה
  companyName: string;

  // תקופה
  coveragePeriod: string | null;    // "01/05/2022 - 30/04/2057"
  coverageStart: Date | null;
  coverageEnd: Date | null;
  isRenewing: boolean;              // "מתחדש"
isLifelong: boolean; 
  // פרמיה
  premium: number | null;
  premiumType: PremiumType;
  premiumMonthly: number | null;    // מחושב תמיד לחודשי

  // סיווג
  classification: InsuranceClassification;

  // ענפים משניים (כל הכיסויים בפוליסה)
  subBranches: string[];            // ["ייעוץ ובדיקות", "מחלות קשות", ...]

  // מידע נוסף
  additionalInfo: string | null;    // "פרטים נוספים" מהקובץ

  // מידע מועשר (יתמלא מה-PDF לאחר מכן)
  coverageAmount: number | null;
  exclusions: string | null;
  irrevocableBeneficiary: string | null;
  smokerStatus: "מעשן" | "לא מעשן" | null;
  discountPercent: number | null;
  discountExpiryDate: string | null;
  futurePremiums: Array<{ date: string; premium: number }> | null;
  medicalAddition: string | null;       // תוספת חיתומית
  occupationalAddition: string | null;  // תוספת מקצועית
  pdfEnriched: boolean;
}

export interface HarBituchParseResult {
  extractedAt: string;              // תאריך הפקת הקובץ
  idNumber: string | null;
  rows: HarBituchRow[];
  lifeAndHealthRows: HarBituchRow[];  // רק חיים/בריאות/סיעוד
  generalRows: HarBituchRow[];        // רק אלמנטרי
}

// ─── Extract XLSX from ZIP if needed ─────────────────────────

async function extractXlsxFromZipOrFile(file: File): Promise<ArrayBuffer> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    return file.arrayBuffer();
  }

  if (name.endsWith(".zip")) {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(file);

    const xlsxEntry = Object.values(zip.files).find(
      (f) => !f.dir && (f.name.toLowerCase().endsWith(".xlsx") || f.name.toLowerCase().endsWith(".xls"))
    );

    if (!xlsxEntry) {
      throw new Error("לא נמצא קובץ Excel בתוך ה-ZIP");
    }

    return xlsxEntry.async("arraybuffer");
  }

  throw new Error("פורמט קובץ לא נתמך — יש להעלות XLSX או ZIP");
}

// ─── Branch Normalization ──────────────────────────────────────

function normalizeBranch(main: string, sub: string): InsuranceBranch {
  if (main.includes("חיים") || sub.includes("מוות") || sub.includes("חיים")) return "ביטוח חיים";
  if (main.includes("סיעוד") || sub.includes("סיעוד")) return "ביטוח סיעודי";
  if (main.includes("בריאות") || sub.includes("בריאות") || sub.includes("תרופות") || sub.includes("ניתוח")) return "ביטוח בריאות";
  if (main.includes("תאונות") || sub.includes("תאונות")) return "ביטוח תאונות אישיות";
  if (main.includes("רכב") || sub.includes("רכב") || sub.includes("חובה") || sub.includes("מקיף")) return "ביטוח רכב";
  if (main.includes("דירה") || sub.includes("מבנה") || sub.includes("תכולה")) return "ביטוח דירה";
  return "אחר";
}

function isLifeOrHealth(branch: InsuranceBranch): boolean {
  return ["ביטוח חיים", "ביטוח בריאות", "ביטוח סיעודי", "ביטוח תאונות אישיות"].includes(branch);
}

// ─── Premium Normalization ────────────────────────────────────

function normalizePremiumType(raw: string | null): PremiumType {
  if (!raw) return null;
  if (raw.includes("חודש")) return "חודשית";
  if (raw.includes("שנת")) return "שנתית";
  if (raw.includes("רבע")) return "רבעונית";
  return null;
}

function toMonthlyPremium(amount: number | null, type: PremiumType): number | null {
  if (amount == null) return null;
  if (type === "חודשית") return amount;
  if (type === "שנתית") return Math.round((amount / 12) * 100) / 100;
  if (type === "רבעונית") return Math.round((amount / 3) * 100) / 100;
  return amount;
}

// ─── Date Parsing ─────────────────────────────────────────────

function parseCoveragePeriod(raw: string | null): {
  start: Date | null;
  end: Date | null;
  isRenewing: boolean;
  isLifelong: boolean; 
} {
  if (!raw) return { start: null, end: null, isRenewing: false, isLifelong: false };
  if (raw.trim() === "מתחדש") return { start: null, end: null, isRenewing: true, isLifelong: false };
  if (raw.trim() === "לכל החיים") return { start: null, end: null, isRenewing: false, isLifelong: true };

  const parts = raw.split(" - ").map((s) => s.trim());
  const parseDate = (s: string): Date | null => {
    const [day, month, year] = s.split("/").map(Number);
    if (!day || !month || !year) return null;
    return new Date(year, month - 1, day);
  };

  return {
    start: parts[0] ? parseDate(parts[0]) : null,
    end: parts[1] ? parseDate(parts[1]) : null,
    isRenewing: false,
    isLifelong: false,
  };
}

// ─── Classification ───────────────────────────────────────────

function normalizeClassification(raw: string | null): InsuranceClassification {
  if (!raw) return null;
  if (raw.includes("קופת חולים")) return "קבוצתי קופת חולים";
  if (raw.includes("מעסיק")) return "קבוצתי מעסיק";
  if (raw.includes("אישי")) return "אישי";
  return null;
}

// ─── Main Parser (Browser — uses SheetJS) ────────────────────

export async function parseHarBituchXlsx(file: File): Promise<HarBituchParseResult> {
  const XLSX = await import("xlsx");

  const buffer = await extractXlsxFromZipOrFile(file);
  const wb = XLSX.read(buffer, { type: "array", cellDates: true, dateNF: "dd/mm/yyyy" });

  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  if (ws["!ref"]) {
    const ref = XLSX.utils.decode_range(ws["!ref"]);
    ref.e.r = Math.max(ref.e.r, 9999);
    ws["!ref"] = XLSX.utils.encode_range(ref);
  }

  // console.log("ws ref:", ws["!ref"]);
  // console.log("ws keys:", Object.keys(ws).slice(0, 20));

  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1:K20");
  const rawRows: any[][] = [];

  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: any[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (!cell) { row.push(null); continue; }

      // מספרים גדולים — שמור ערך גולמי
      if (cell.t === "n" && Math.abs(cell.v) > 1e10) {
        row.push(String(cell.v));
      } else {
        row.push(XLSX.utils.format_cell(cell));
      }
    }
    rawRows.push(row);
  }

  // console.log("rawRows length:", rawRows.length);

  let extractedAt = "";
  let headerRowIdx = -1;
  let idNumber: string | null = null;

  for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
    const row = rawRows[i] as any[];
    // console.log(`raw row ${i}:`, row);

    if (!row || row.length === 0) continue;

    const rowStr = row.join(" ");

    if (rowStr.includes("הר הביטוח") && !extractedAt) {
      const dateCell = row.find((c: any) => c && /\d{2}\/\d{2}\/\d{4}/.test(String(c)));
      if (dateCell) extractedAt = String(dateCell);
    }

    if (row.includes("תעודת זהות") || row.includes("ענף ראשי") || row.includes("סוג מוצר")) {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx === -1) {
    throw new Error("לא נמצאה שורת כותרות בקובץ הר הביטוח");
  }

  const headers = (rawRows[headerRowIdx] as any[]).map((h: any) => String(h ?? "").trim());
  // console.log("headers:", headers);
  // console.log("headerRowIdx:", headerRowIdx);
  // console.log("first data row:", rawRows[headerRowIdx + 1]);

  const col = (name: string) => headers.indexOf(name);

  const rows: HarBituchRow[] = [];
  let emptyRowCount = 0;

  for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i] as any[];
    if (!row || row.length === 0) continue;

    const get = (name: string): string | null => {
      const idx = col(name);
      if (idx === -1) return null;
      const val = row[idx];
      if (val == null || val === "") return null;
      const str = String(val).trim();

      // תיקון notation מדעי
      if (/^-?\d+\.?\d*[eE][+\-]\d+$/.test(str)) {
        return Math.round(Number(str)).toString();
      }

      return str;
    };

    const getNum = (name: string): number | null => {
      const v = get(name);
      if (!v) return null;
      const n = parseFloat(v.replace(/,/g, ""));
      return Number.isFinite(n) ? n : null;
    };

    const main = get("ענף ראשי");
    const sub = get("ענף (משני)");

    if (!main && !sub && !get("מספר פוליסה") && !get("חברה")) {
      emptyRowCount = (emptyRowCount ?? 0) + 1;
      if (emptyRowCount >= 3) break;
      continue;
    } else {
      emptyRowCount = 0;
    }

    // if (i < headerRowIdx + 20) {
    //   console.log(`row ${i}: main="${main}" sub="${sub}" policy="${get("מספר פוליסה")}"`);
    // }

    if (!main && !sub) continue;
    if ((main && main.startsWith("תחום")) || (sub && sub.startsWith("תחום"))) continue;

    const policyNumber = get("מספר פוליסה");
    if (!policyNumber) continue;

    const rowId = get("תעודת זהות");
    if (rowId && !idNumber) idNumber = rowId;

    const premiumRaw = getNum("פרמיה בש\"ח");
    const premiumTypeStr = get("סוג פרמיה");
    const premiumType = normalizePremiumType(premiumTypeStr);
    const premiumMonthly = toMonthlyPremium(premiumRaw, premiumType);

    const periodRaw = get("תקופת ביטוח");
const { start, end, isRenewing, isLifelong } = parseCoveragePeriod(periodRaw);

    const branchMain = main ?? "";
    const branchSub = sub ?? "";
    const productType = normalizeBranch(branchMain, branchSub);

    rows.push({
      idNumber: rowId,
      policyNumber,
      branchMain,
      branchSub,
      subBranches: sub ? [sub] : [],
      productType,
      isLifeOrHealth: isLifeOrHealth(productType),
      companyName: get("חברה") ?? "",
      coveragePeriod: periodRaw,
      coverageStart: start,
      coverageEnd: end,
      isRenewing,
      isLifelong,
      premium: premiumRaw,
      premiumType,
      premiumMonthly,
      classification: normalizeClassification(get("סיווג תכנית")),
      additionalInfo: get("פרטים נוספים"),
      // שדות שיתמלאו מה-PDF
      coverageAmount: null,
      exclusions: null,
      irrevocableBeneficiary: null,
      smokerStatus: null,
      discountPercent: null,
      discountExpiryDate: null,
      futurePremiums: null,
      medicalAddition: null,
      occupationalAddition: null,
      pdfEnriched: false,
    });
  }

  // ─── Deduplicate by policyNumber ─────────────────────────────
  // פוליסה אחת יכולה להופיע בכמה שורות (כיסוי אחר לכל שורה)
  // מאחדים: סוכמים פרמיות, אוספים ענפים משניים
  const deduped = new Map<string, HarBituchRow>();

  for (const row of rows) {
    const existing = deduped.get(row.policyNumber);
    if (!existing) {
      deduped.set(row.policyNumber, { ...row });
    } else {
      // צבור פרמיה
      if (row.premiumMonthly != null) {
        existing.premiumMonthly = (existing.premiumMonthly ?? 0) + row.premiumMonthly;
      }
      if (row.premium != null) {
        existing.premium = (existing.premium ?? 0) + row.premium;
      }
      // אסוף ענפים משניים
      if (row.branchSub && !existing.subBranches.includes(row.branchSub)) {
        existing.subBranches.push(row.branchSub);
      }
    }
  }

  const uniqueRows = Array.from(deduped.values());

  return {
    extractedAt,
    idNumber,
    rows: uniqueRows,
    lifeAndHealthRows: uniqueRows.filter((r) => r.isLifeOrHealth),
    generalRows: uniqueRows.filter((r) => !r.isLifeOrHealth),
  };
}