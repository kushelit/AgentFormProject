/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
/* eslint-disable valid-jsdoc */
/* eslint-disable @typescript-eslint/no-explicit-any */

// functions/src/shared/month.ts
import * as XLSX from "xlsx";

export type ParseMonthOpts = {
  templateId?: string;
  date1904?: boolean;
};

export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function sanitizeMonth(v: any): string {
  return String(v || "").replace(/\//g, "-").trim();
}

export function normalizeHeader(s: any) {
  return String(s ?? "")
    .replace(/\u200f|\u200e|\ufeff/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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

export function monthNameToMM(name: any): string {
  const s = normalizeHeader(String(name ?? ""));
  return HEB_MONTHS[s] || "";
}

export function parseReportMonth(value: any, opts: ParseMonthOpts = {}): string {
  const templateId = String(opts.templateId || "").trim();
  const date1904 = !!opts.date1904;

  if (value == null || value === "") return "";

  if (typeof value === "number") {
    // ✅ כאן התיקון: בלי רווחים בתוך {}
    const d = XLSX.SSF.parse_date_code(value, {date1904});
    if (d && d.y && d.m) {
      if (
        (templateId === "migdal_life" || templateId === "migdal_gemel") &&
        d.m === 1 &&
        d.d >= 1 &&
        d.d <= 12
      ) {
        return `${d.y}-${pad2(d.d)}`;
      }
      return `${d.y}-${pad2(d.m)}`;
    }
  }

  if (value instanceof Date && !isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = value.getMonth() + 1;
    const d = value.getDate();

    if (
      (templateId === "migdal_life" || templateId === "migdal_gemel") &&
      m === 1 &&
      d >= 1 &&
      d <= 12
    ) {
      return `${y}-${pad2(d)}`;
    }

    return `${y}-${pad2(m)}`;
  }

  const str = String(value).trim();
  if (!str) return "";

  if (/^\d{4}-\d{2}$/.test(str)) return str;

  {
    const m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${pad2(parseInt(m[2], 10))}`;
  }

  {
    const m = str.match(
      /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/
    );
    if (m) {
      const mm = parseInt(m[2], 10);
      let yy = m[3];

      if (yy.length === 2) {
        const n = parseInt(yy, 10);
        yy = n < 50 ? `20${yy}` : `19${yy}`;
      }

      if (mm >= 1 && mm <= 12) return `${yy}-${pad2(mm)}`;
    }
  }

  {
    const hebToken = (str.match(/[\u0590-\u05FF]{3,}/) || [])[0];
    const mm = monthNameToMM(hebToken);

    if (mm) {
      const year4 = (str.match(/\b(19\d{2}|20\d{2})\b/) || [])[0];
      if (year4) return `${year4}-${mm}`;

      const year2 = (str.match(/\b(\d{2})\b/) || [])[0];
      if (year2) {
        const n = parseInt(year2, 10);
        const yyyy = n < 50 ? `20${year2}` : `19${year2}`;
        return `${yyyy}-${mm}`;
      }
    }
  }

  {
    const year = (str.match(/\b(19\d{2}|20\d{2})\b/) || [])[0];
    if (year) {
      const nums = str.match(/\d{1,2}/g) || [];
      const month = nums
        .map((n) => parseInt(n, 10))
        .find((n) => n >= 1 && n <= 12);

      if (month) return `${year}-${pad2(month)}`;
    }
  }

  return "";
}
