// functions/src/shared/import/hekef/clalStatement.ts
// "דף חשבון" חודשי של דוח עמלות היקף של כלל: המספרים ברמת הסוכן שלא נמצאים בשורות הפוליסה —
// זכאות מצטברת, מקדמה (80%), מה שולם בפועל בכל חודש, התחשבנות שנים קודמות (ש"ק), יעדים ומדרגות.
// בכלל הסכום ברמת הפוליסה הוא "על הנייר"; מקדמה שלילית לא מקוזזת באותו חודש — האמת בטבלת התשלומים.

import * as XLSX from "xlsx";
import {normalizeHeader} from "../../month";
import {readHeaderReportMonth} from "../parse/parseNodeFile";

type Row = any[];

const s = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown) => {
  if (typeof v === "number") return v;
  const n = parseFloat(s(v).replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

function sheetRows(wb: XLSX.WorkBook, nameIncludes: string): Row[] {
  const name = wb.SheetNames.find((n) => normalizeHeader(n).includes(normalizeHeader(nameIncludes)));
  if (!name) return [];
  return XLSX.utils.sheet_to_json<Row>(wb.Sheets[name], {header: 1, defval: ""});
}

const isTotalRow = (r: Row) => /^סה/.test(s(r[0]));
const isEmptyRow = (r: Row) => !r || r.every((c) => s(c) === "");

/** מקטע: שורת כותרת (תא ראשון = title), שורת שמות עמודות, ושורות עד שורה ריקה / סה"כ */
function section(rows: Row[], title: string): Record<string, unknown>[] {
  const i = rows.findIndex((r) => normalizeHeader(r[0]) === normalizeHeader(title));
  if (i < 0) return [];
  const headers = (rows[i + 1] || []).map((h) => normalizeHeader(h));
  const out: Record<string, unknown>[] = [];
  for (let j = i + 2; j < rows.length; j++) {
    const r = rows[j];
    if (isEmptyRow(r) || isTotalRow(r)) break;
    const obj: Record<string, unknown> = {};
    headers.forEach((h, k) => {
      if (h) obj[h] = r[k];
    });
    out.push(obj);
  }
  return out;
}

/** ערך מספרי בשורה שהתא הראשון שלה הוא label */
function labelValue(rows: Row[], label: string): number | null {
  const r = rows.find((x) => normalizeHeader(x[0]) === normalizeHeader(label));
  if (!r) return null;
  const v = r.slice(1).find((c) => s(c) !== "");
  return v === undefined ? null : r2(num(v));
}

const pick = (o: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) {
    const v = o[normalizeHeader(k)];
    if (v !== undefined) return v;
  }
  return undefined;
};

function headerInfo(wb: XLSX.WorkBook) {
  const rows = sheetRows(wb, wb.SheetNames[0]).slice(0, 3);
  const text = rows.flat().map(s).join("\n");
  const m = (re: RegExp) => (text.match(re) || [])[1]?.trim() || "";
  return {
    agentName: m(/שם סוכן:\s*([^\n]+)/),
    agentTaxId: m(/ח\.פ סוכן:\s*(\d+)/),
    leadAgentNumber: m(/מספר סוכן מוביל:\s*(\d+)/),
    region: m(/שם מרחב:\s*([^\n]+)/),
    reportRunDate: m(/תאריך הרצת הדוח:\s*([\d/]+)/),
  };
}

export type ClalHekefStatement = ReturnType<typeof parseClalHekefStatement>;

export function parseClalHekefStatement(wb: XLSX.WorkBook) {
  const summary = sheetRows(wb, "סיכום עמלות");
  const advances = sheetRows(wb, "פירוט מקדמות");

  const currentAnnexes = section(summary, "פירוט זכאות למקדמות").map((o) => ({
    annexType: s(pick(o, "סוג נספח")),
    annexNumber: s(pick(o, "מספר נספח")),
    entitlement: r2(num(pick(o, "סה\"כ זכאות"))),
    subAgentOffset: r2(num(pick(o, "קיזוז ס.משנה"))),
    netEntitlement: r2(num(pick(o, "סה\"כ נטו לתשלום"))),
    advance: r2(num(pick(o, "סה\"כ מקדמה לתשלום"))),
  }));

  const priorAnnexes = section(summary, "פירוט זכאות בגין התחשבנות שנים קודמות").map((o) => ({
    annexType: s(pick(o, "סוג נספח")),
    annexNumber: s(pick(o, "מספר נספח")),
    year: s(pick(o, "שנת נספח")),
    entitlement: r2(num(pick(o, "סה\"כ זכאות"))),
    subAgentOffset: r2(num(pick(o, "קיזוז ס.משנה"))),
    netCumulative: r2(num(pick(o, "סה\"כ נטו לתשלום מצטבר"))),
  }));

  // טבלת תשלומים: שורות "MM/YYYY | סכום" ואחריהן שורות סיכום
  const payments: {month: string; amount: number}[] = [];
  const payIdx = advances.findIndex((r) => normalizeHeader(r[0]) === "פירוט תשלום מקדמות");
  if (payIdx >= 0) {
    for (let j = payIdx + 2; j < advances.length; j++) {
      const r = advances[j];
      if (isEmptyRow(r)) break;
      const m = s(r[0]).match(/^(\d{1,2})\/(\d{4})$/);
      if (m) payments.push({month: `${m[2]}-${m[1].padStart(2, "0")}`, amount: r2(num(r[1]))});
    }
  }

  const targets = section(advances, "פירוט יעדים").map((o) => ({
    annexType: s(pick(o, "סוג נספח")),
    description: s(pick(o, "תיאור היעד")),
    annualTarget: r2(num(pick(o, "יעד שנתי"))),
    relativeProduction: r2(num(pick(o, "תפוקה יחסית"))),
    actualProduction: r2(num(pick(o, "תפוקה בפועל"))),
    achievementPct: r2(num(pick(o, "שיעור עמידה ביעד"))),
  }));

  const tiers = section(advances, "פירוט תנאי נספח").map((o) => ({
    annexType: s(pick(o, "סוג נספח")),
    targetProduct: s(pick(o, "מוצר יעד")),
    rewardProduct: s(pick(o, "מוצר תגמול")),
    fromPremium: num(pick(o, "מפרמיה קובעת ליעדים נטו")),
    toPremium: num(pick(o, "עד פרמיה קובעת ליעדים נטו")),
    fromMix: num(pick(o, "מיעד תמהיל")),
    toMix: num(pick(o, "עד יעד תמהיל")),
    rate: num(pick(o, "שיעור עמלה בהסכם")),
    rateNoVat: num(pick(o, "שיעור עמלה בהסכם ללא מע\"מ")),
    fixedCommission: num(pick(o, "עמלת היקף שקלית")),
    advanceRatePct: num(pick(o, "שיעור מקדמה - עמלה אחוזית")),
  }));

  const advanceCalc = section(advances, "פירוט חישוב מקדמות").map((o) => ({
    annexType: s(pick(o, "סוג נספח")),
    targetProduct: s(pick(o, "מוצר יעד")),
    rewardProduct: s(pick(o, "מוצר תגמול")),
    productionPremium: r2(num(pick(o, "פרמיה לתפוקה"))),
    targetPremiumNet: r2(num(pick(o, "פרמיה קובעת ליעדים נטו"))),
    paymentPremiumNet: r2(num(pick(o, "פרמיה קובעת לתשלום נטו"))),
  }));

  const sum = (arr: {[k: string]: any}[], k: string) => r2(arr.reduce((a, x) => a + num(x[k]), 0));
  const totalNetEntitlement = sum(currentAnnexes, "netEntitlement");
  const totalAdvance = sum(currentAnnexes, "advance");

  return {
    month: readHeaderReportMonth(wb),
    header: headerInfo(wb),
    currentYear: {
      annexes: currentAnnexes,
      totalEntitlement: sum(currentAnnexes, "entitlement"),
      totalNetEntitlement,
      totalAdvance,
      // הפער בין הזכאות למקדמה — נשמר עד ההתחשבנות השנתית
      heldUntilSettlement: r2(totalNetEntitlement - totalAdvance),
      paidPreviousMonths: labelValue(summary, "מקדמות ששולמו בחודשים קודמים"),
      payThisMonth: labelValue(summary, "סה\"כ מקדמה לתשלום החודש בגין שנה נוכחית"),
      purchasedPortfoliosOffset: labelValue(advances, "סה\"כ מקדמות אשר שולמו בגין תיקים שנרכשו"),
      soldPortfoliosOffset: labelValue(advances, "סה\"כ מקדמות אשר שולמו בגין תיקים שנמכרו"),
    },
    priorYears: {
      annexes: priorAnnexes,
      paidSoFar: labelValue(summary, "סה\"כ שולם עד כה בגין התחשבנות שנים קודמות"),
      payThisMonth: labelValue(summary, "סה\"כ יתרה לתשלום החודש בגין התחשבנות שנים קודמות"),
    },
    payments,
    targets,
    tiers,
    advanceCalc,
  };
}
