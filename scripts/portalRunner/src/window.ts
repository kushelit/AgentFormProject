// scripts/portalRunner/src/window.ts
import type { ReportWindow } from "./types";

export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function ymFromDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export function prevYm(now: Date) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${pad2(m - 1)}`;
}

// ✅ חדש: חודש נוכחי (זה בעצם ymFromDate, אבל נשאיר שם ברור)
export function currentYm(now: Date) {
  return ymFromDate(now);
}

const heMonths: Record<string, string> = {
  "01": "ינואר",
  "02": "פברואר",
  "03": "מרץ",
  "04": "אפריל",
  "05": "מאי",
  "06": "יוני",
  "07": "יולי",
  "08": "אוגוסט",
  "09": "ספטמבר",
  "10": "אוקטובר",
  "11": "נובמבר",
  "12": "דצמבר",
};

export function labelFromYm(ym: string) {
  const [y, m] = ym.split("-");
  return `${heMonths[m] || m} ${y}`;
}

/**
 * Resolve window:
 * - אם יש requestedWindow => מכבדים
 * - אם אין => חודש נוכחי ✅
 * - אם requestedWindow.kind === 'month' עם ym חסר => חודש נוכחי ✅
 */
export function resolveWindow(now: Date, requested?: ReportWindow): ReportWindow {
  const defaultYm = currentYm(now); // ✅ במקום prevYm(now)

  if (!requested) {
    return { kind: "month", ym: defaultYm, label: labelFromYm(defaultYm) };
  }

  if (requested.kind === "month") {
    const ym = requested.ym?.trim() || defaultYm; // ✅ במקום prevYm(now)
    return { kind: "month", ym, label: requested.label || labelFromYm(ym) };
  }

  // range
  const fromYm = requested.fromYm?.trim();
  const toYm = requested.toYm?.trim();
  if (!fromYm || !toYm) {
    return { kind: "month", ym: defaultYm, label: labelFromYm(defaultYm) };
  }

  return {
    kind: "range",
    fromYm,
    toYm,
    label: requested.label || `${labelFromYm(fromYm)} - ${labelFromYm(toYm)}`,
  };
}