/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ImportInsights } from "./buildImportInsights";

function fmtNumber(v: any) {
  const n = Number(v ?? 0);
  return new Intl.NumberFormat("he-IL").format(Number.isFinite(n) ? n : 0);
}

function fmtCurrency(v: any) {
  const n = Number(v ?? 0);
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

function fmtPercent(v: any) {
  const n = Number(v ?? 0);
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function deltaColor(num: number) {
  if (num > 0) return "#15803d";
  if (num < 0) return "#b91c1c";
  return "#475569";
}

function esc(v: any) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export type BatchCompanyResult = {
  companyName: string;
  status: "success" | "error" | "failed" | "skipped";
  insights?: ImportInsights; // קיים רק כש-status === "success"
};

function statusBadge(status: BatchCompanyResult["status"]) {
  switch (status) {
    case "success":
      return `<span style="color:#15803d;font-weight:700;">✅ הושלם</span>`;
    case "skipped":
      return `<span style="color:#64748b;font-weight:700;">⏭️ דולג</span>`;
    default:
      return `<span style="color:#b91c1c;font-weight:700;">❌ שגיאה</span>`;
  }
}

function batchStatusHeadline(status: "success" | "partial" | "error") {
  if (status === "success") return "טעינת העמלות האוטומטית הסתיימה בהצלחה ✅";
  if (status === "partial") return "טעינת העמלות האוטומטית הסתיימה חלקית ⚠️";
  return "טעינת העמלות האוטומטית הסתיימה עם שגיאות ❌";
}

export function buildBatchImportInsightsEmailHtml(params: {
  agentName: string;
  batchStatus: "success" | "partial" | "error";
  monthLabel?: string;
  companies: BatchCompanyResult[];
  appUrl?: string;
}) {
  const { agentName, batchStatus, monthLabel, companies, appUrl } = params;

  const successfulCompanies = companies.filter((c) => c.status === "success" && c.insights);

  const totals = successfulCompanies.reduce(
    (acc, c) => {
      const ins = c.insights!;
      acc.totalPolicies += ins.totalPolicies;
      acc.totalCustomers += ins.totalCustomers;
      acc.totalCommissionAmount += ins.totalCommissionAmount;
      acc.totalPremiumAmount += ins.totalPremiumAmount;
      return acc;
    },
    { totalPolicies: 0, totalCustomers: 0, totalCommissionAmount: 0, totalPremiumAmount: 0 }
  );

  const rowsHtml = companies
    .map((c) => {
      const ins = c.insights;
      const hasPrev = !!ins?.hasPrevMonth;
      const commissionDeltaHtml = hasPrev
        ? `<span style="color:${deltaColor(ins!.deltaCommissionAmount)};font-weight:700;">${fmtCurrency(ins!.deltaCommissionAmount)} (${fmtPercent(ins!.deltaCommissionPercent)})</span>`
        : `<span style="color:#94a3b8;">אין נתוני השוואה</span>`;
      const premiumDeltaHtml =
        hasPrev && typeof ins!.deltaPremiumAmount === "number"
          ? `<span style="color:${deltaColor(ins!.deltaPremiumAmount)};font-weight:700;">${fmtCurrency(ins!.deltaPremiumAmount)}</span>`
          : `<span style="color:#94a3b8;">-</span>`;
      const customersDeltaHtml =
        hasPrev && typeof ins!.deltaCustomersCount === "number"
          ? `<span style="color:${deltaColor(ins!.deltaCustomersCount)};font-weight:700;">${ins!.deltaCustomersCount > 0 ? "+" : ""}${fmtNumber(ins!.deltaCustomersCount)}</span>`
          : `<span style="color:#94a3b8;">-</span>`;

      return `
        <tr>
          <td style="padding:10px;border-bottom:1px solid #eee;font-weight:700;text-align:right;">${esc(c.companyName)}</td>
          <td style="padding:10px;border-bottom:1px solid #eee;text-align:right;">${statusBadge(c.status)}</td>
          <td style="padding:10px;border-bottom:1px solid #eee;text-align:right;">${ins ? fmtNumber(ins.totalPolicies) : "-"}</td>
          <td style="padding:10px;border-bottom:1px solid #eee;text-align:right;">${ins ? fmtCurrency(ins.totalCommissionAmount) : "-"}</td>
          <td style="padding:10px;border-bottom:1px solid #eee;text-align:right;">${ins ? fmtCurrency(ins.totalPremiumAmount) : "-"}</td>
          <td style="padding:10px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;">${ins ? commissionDeltaHtml : "-"}</td>
          <td style="padding:10px;border-bottom:1px solid #eee;text-align:right;">${ins ? premiumDeltaHtml : "-"}</td>
          <td style="padding:10px;border-bottom:1px solid #eee;text-align:right;">${ins ? customersDeltaHtml : "-"}</td>
        </tr>
      `;
    })
    .join("");

  const ctaHtml = appUrl
    ? `
      <div style="margin-top:24px;text-align:center;">
        <a
          href="${esc(appUrl)}"
          style="
            display:inline-block;
            background:#1d4ed8;
            color:#fff;
            text-decoration:none;
            padding:12px 20px;
            border-radius:10px;
            font-weight:700;
          "
        >
          לצפייה במערכת
        </a>
      </div>
    `
    : "";

  return `
<!doctype html>
<html lang="he" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <title>סיכום טעינת עמלות - ריצה אוטומטית</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f6fb;font-family:Arial,sans-serif;color:#1f2937;">
    <div dir="rtl" style="max-width:860px;margin:0 auto;padding:24px;direction:rtl;">
      <div style="background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e5e7eb;">

        <div style="background:#1e3a8a;color:#fff;padding:24px 28px;">
          <div style="font-size:24px;font-weight:800;margin-bottom:8px;">
            סיכום טעינת עמלות אוטומטית
          </div>
          <div style="font-size:15px;opacity:0.95;">
            ${esc(companies.length)} חברות ${monthLabel ? `| ${esc(monthLabel)}` : ""}
          </div>
        </div>

        <div style="padding:24px 28px;">
          <div style="font-size:16px;margin-bottom:6px;">
            שלום ${esc(agentName || "")},
          </div>
          <div style="font-size:16px;margin-bottom:18px;">
            ${batchStatusHeadline(batchStatus)}
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:22px;">
            <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:14px;padding:16px;">
              <div style="font-size:13px;color:#64748b;margin-bottom:6px;">חברות שהושלמו</div>
              <div style="font-size:22px;font-weight:800;">${fmtNumber(successfulCompanies.length)} / ${fmtNumber(companies.length)}</div>
            </div>

            <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:14px;padding:16px;">
              <div style="font-size:13px;color:#64748b;margin-bottom:6px;">סה"כ פוליסות</div>
              <div style="font-size:22px;font-weight:800;">${fmtNumber(totals.totalPolicies)}</div>
            </div>

            <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:14px;padding:16px;">
              <div style="font-size:13px;color:#64748b;margin-bottom:6px;">סה"כ עמלות</div>
              <div style="font-size:24px;font-weight:800;color:#1d4ed8;">${fmtCurrency(totals.totalCommissionAmount)}</div>
            </div>

            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:14px;padding:16px;">
              <div style="font-size:13px;color:#64748b;margin-bottom:6px;">סה"כ פרמיה</div>
              <div style="font-size:24px;font-weight:800;color:#15803d;">${fmtCurrency(totals.totalPremiumAmount)}</div>
            </div>
          </div>

          <div style="font-size:18px;font-weight:800;margin-bottom:12px;">פירוט לפי חברה</div>
          <div style="border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;margin-bottom:8px;overflow-x:auto;">
            <table dir="rtl" style="width:100%;border-collapse:collapse;font-size:14px;direction:rtl;">
              <thead style="background:#f8fafc;"><tr>
                <th style="padding:10px;text-align:right;border-bottom:1px solid #e5e7eb;">חברה</th>
                <th style="padding:10px;text-align:right;border-bottom:1px solid #e5e7eb;">סטטוס</th>
                <th style="padding:10px;text-align:right;border-bottom:1px solid #e5e7eb;">פוליסות</th>
                <th style="padding:10px;text-align:right;border-bottom:1px solid #e5e7eb;">עמלות</th>
                <th style="padding:10px;text-align:right;border-bottom:1px solid #e5e7eb;">פרמיה</th>
                <th style="padding:10px;text-align:right;border-bottom:1px solid #e5e7eb;white-space:nowrap;">שינוי בעמלה מול חודש קודם</th>
                <th style="padding:10px;text-align:right;border-bottom:1px solid #e5e7eb;white-space:nowrap;">שינוי בפרמיה</th>
                <th style="padding:10px;text-align:right;border-bottom:1px solid #e5e7eb;white-space:nowrap;">שינוי בלקוחות</th>
              </tr></thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
          <div style="font-size:12px;color:#94a3b8;margin-bottom:8px;">
            * ההשוואה לחודש קודם מוצגת רק כשקיימים נתונים לחודש הקודם עבור אותה חברה.
          </div>

          ${ctaHtml}
        </div>
      </div>
    </div>
  </body>
</html>
  `;
}