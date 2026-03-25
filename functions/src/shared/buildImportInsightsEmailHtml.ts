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

function esc(v: any) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function monthsLabel(reportMonths: string[]) {
  if (!reportMonths.length) return "-";
  if (reportMonths.length === 1) return reportMonths[0];
  return `${reportMonths[0]} — ${reportMonths[reportMonths.length - 1]}`;
}

function deltaColor(num: number) {
  if (num > 0) return "#15803d";
  if (num < 0) return "#b91c1c";
  return "#475569";
}

export function buildImportInsightsEmailHtml(params: {
  insights: ImportInsights;
  appUrl?: string;
}) {
  const { insights, appUrl } = params;

  const zeroRowsHtml = insights.zeroCommissionPoliciesTop.length
    ? insights.zeroCommissionPoliciesTop
        .map(
          (row) => `
            <tr>
              <td style="padding:8px;border-bottom:1px solid #eee;">${esc(row.policyNumberKey)}</td>
              <td style="padding:8px;border-bottom:1px solid #eee;">${esc(row.fullName)}</td>
              <td style="padding:8px;border-bottom:1px solid #eee;">${esc(row.product)}</td>
              <td style="padding:8px;border-bottom:1px solid #eee;">${fmtCurrency(row.totalPremiumAmount)}</td>
            </tr>
          `
        )
        .join("")
    : `
      <tr>
        <td colspan="4" style="padding:12px;text-align:center;color:#666;">
          לא נמצאו פוליסות עם 0 עמלה
        </td>
      </tr>
    `;

  const droppedRowsHtml = insights.droppedPoliciesTop.length
    ? insights.droppedPoliciesTop
        .map(
          (row) => `
            <tr>
              <td style="padding:8px;border-bottom:1px solid #eee;">${esc(row.policyNumberKey)}</td>
              <td style="padding:8px;border-bottom:1px solid #eee;">${esc(row.fullName)}</td>
              <td style="padding:8px;border-bottom:1px solid #eee;">${esc(row.product)}</td>
              <td style="padding:8px;border-bottom:1px solid #eee;">${fmtCurrency(row.previousCommissionAmount)}</td>
            </tr>
          `
        )
        .join("")
    : `
      <tr>
        <td colspan="4" style="padding:12px;text-align:center;color:#666;">
          לא נמצאו פוליסות שירדו לעמלה 0 לעומת חודש קודם
        </td>
      </tr>
    `;

  const newRowsHtml = insights.newPoliciesTop.length
    ? insights.newPoliciesTop
        .map(
          (row) => `
            <tr>
              <td style="padding:8px;border-bottom:1px solid #eee;">${esc(row.policyNumberKey)}</td>
              <td style="padding:8px;border-bottom:1px solid #eee;">${esc(row.fullName)}</td>
              <td style="padding:8px;border-bottom:1px solid #eee;">${esc(row.product)}</td>
              <td style="padding:8px;border-bottom:1px solid #eee;">${fmtCurrency(row.currentCommissionAmount)}</td>
            </tr>
          `
        )
        .join("")
    : `
      <tr>
        <td colspan="4" style="padding:12px;text-align:center;color:#666;">
          לא נמצאו פוליסות חדשות לעומת חודש קודם
        </td>
      </tr>
    `;

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
    <title>סיכום טעינת עמלות</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f6fb;font-family:Arial,sans-serif;color:#1f2937;">
    <div style="max-width:860px;margin:0 auto;padding:24px;">
      <div style="background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e5e7eb;">
        
        <div style="background:#1e3a8a;color:#fff;padding:24px 28px;">
          <div style="font-size:24px;font-weight:800;margin-bottom:8px;">
            סיכום טעינת עמלות
          </div>
          <div style="font-size:15px;opacity:0.95;">
            ${esc(insights.company)} | ${esc(monthsLabel(insights.reportMonths))}
          </div>
        </div>

        <div style="padding:24px 28px;">
          <div style="font-size:16px;margin-bottom:18px;">
            שלום ${esc(insights.agentName || "")}, טעינת העמלות הסתיימה בהצלחה.
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:22px;">
            <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:14px;padding:16px;">
              <div style="font-size:13px;color:#64748b;margin-bottom:6px;">חברה</div>
              <div style="font-size:18px;font-weight:700;">${esc(insights.company)}</div>
            </div>

            <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:14px;padding:16px;">
              <div style="font-size:13px;color:#64748b;margin-bottom:6px;">חודשים</div>
              <div style="font-size:18px;font-weight:700;">${esc(monthsLabel(insights.reportMonths))}</div>
            </div>

            <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:14px;padding:16px;">
              <div style="font-size:13px;color:#64748b;margin-bottom:6px;">מספר פוליסות</div>
              <div style="font-size:22px;font-weight:800;">${fmtNumber(insights.totalPolicies)}</div>
            </div>

            <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:14px;padding:16px;">
              <div style="font-size:13px;color:#64748b;margin-bottom:6px;">מספר לקוחות</div>
              <div style="font-size:22px;font-weight:800;">${fmtNumber(insights.totalCustomers)}</div>
            </div>

            <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:14px;padding:16px;">
              <div style="font-size:13px;color:#64748b;margin-bottom:6px;">סה"כ עמלות</div>
              <div style="font-size:24px;font-weight:800;color:#1d4ed8;">${fmtCurrency(insights.totalCommissionAmount)}</div>
            </div>

            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:14px;padding:16px;">
              <div style="font-size:13px;color:#64748b;margin-bottom:6px;">סה"כ פרמיה</div>
              <div style="font-size:24px;font-weight:800;color:#15803d;">${fmtCurrency(insights.totalPremiumAmount)}</div>
            </div>
          </div>

          <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:14px;padding:18px;margin-bottom:22px;">
            <div style="font-size:18px;font-weight:800;margin-bottom:12px;">השוואה לחודש קודם</div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;">
              <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px;">
                <div style="font-size:12px;color:#64748b;margin-bottom:4px;">חודש קודם</div>
                <div style="font-size:18px;font-weight:700;">${esc(insights.previousMonth || "-")}</div>
              </div>

              <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px;">
                <div style="font-size:12px;color:#64748b;margin-bottom:4px;">שינוי בעמלות</div>
                <div style="font-size:18px;font-weight:800;color:${deltaColor(insights.deltaCommissionAmount)};">
                  ${fmtCurrency(insights.deltaCommissionAmount)}
                </div>
                <div style="font-size:13px;color:${deltaColor(insights.deltaCommissionPercent)};">
                  ${fmtPercent(insights.deltaCommissionPercent)}
                </div>
              </div>

              <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px;">
                <div style="font-size:12px;color:#64748b;margin-bottom:4px;">פוליסות חדשות</div>
                <div style="font-size:22px;font-weight:800;">${fmtNumber(insights.newPoliciesCount)}</div>
              </div>

              <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px;">
                <div style="font-size:12px;color:#64748b;margin-bottom:4px;">פוליסות שירדו לעמלה 0</div>
                <div style="font-size:22px;font-weight:800;">${fmtNumber(insights.droppedPoliciesCount)}</div>
              </div>
            </div>
          </div>

          <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:14px;padding:18px;margin-bottom:22px;">
            <div style="font-size:18px;font-weight:800;color:#9a3412;margin-bottom:8px;">
              פוליסות עם 0 עמלה
            </div>
            <div style="font-size:15px;color:#7c2d12;">
              זוהו <strong>${fmtNumber(insights.zeroCommissionPoliciesCount)}</strong> פוליסות עם 0 עמלה.
            </div>
          </div>

          <div style="margin-top:8px;">
            <div style="font-size:18px;font-weight:800;margin-bottom:12px;">
              דוגמאות לפוליסות עם 0 עמלה
            </div>

            <div style="border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;margin-bottom:22px;">
              <table style="width:100%;border-collapse:collapse;font-size:14px;">
                <thead style="background:#f8fafc;">
                  <tr>
                    <th style="padding:10px;text-align:right;border-bottom:1px solid #e5e7eb;">פוליסה</th>
                    <th style="padding:10px;text-align:right;border-bottom:1px solid #e5e7eb;">שם לקוח</th>
                    <th style="padding:10px;text-align:right;border-bottom:1px solid #e5e7eb;">מוצר</th>
                    <th style="padding:10px;text-align:right;border-bottom:1px solid #e5e7eb;">פרמיה</th>
                  </tr>
                </thead>
                <tbody>
                  ${zeroRowsHtml}
                </tbody>
              </table>
            </div>

            <div style="font-size:18px;font-weight:800;margin-bottom:12px;">
              פוליסות שקיבלו עמלה בחודש קודם ולא כעת
            </div>

            <div style="border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;margin-bottom:22px;">
              <table style="width:100%;border-collapse:collapse;font-size:14px;">
                <thead style="background:#f8fafc;">
                  <tr>
                    <th style="padding:10px;text-align:right;border-bottom:1px solid #e5e7eb;">פוליסה</th>
                    <th style="padding:10px;text-align:right;border-bottom:1px solid #e5e7eb;">שם לקוח</th>
                    <th style="padding:10px;text-align:right;border-bottom:1px solid #e5e7eb;">מוצר</th>
                    <th style="padding:10px;text-align:right;border-bottom:1px solid #e5e7eb;">עמלה בחודש קודם</th>
                  </tr>
                </thead>
                <tbody>
                  ${droppedRowsHtml}
                </tbody>
              </table>
            </div>

            <div style="font-size:18px;font-weight:800;margin-bottom:12px;">
              פוליסות חדשות לעומת חודש קודם
            </div>

            <div style="border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
              <table style="width:100%;border-collapse:collapse;font-size:14px;">
                <thead style="background:#f8fafc;">
                  <tr>
                    <th style="padding:10px;text-align:right;border-bottom:1px solid #e5e7eb;">פוליסה</th>
                    <th style="padding:10px;text-align:right;border-bottom:1px solid #e5e7eb;">שם לקוח</th>
                    <th style="padding:10px;text-align:right;border-bottom:1px solid #e5e7eb;">מוצר</th>
                    <th style="padding:10px;text-align:right;border-bottom:1px solid #e5e7eb;">עמלה נוכחית</th>
                  </tr>
                </thead>
                <tbody>
                  ${newRowsHtml}
                </tbody>
              </table>
            </div>
          </div>

          ${ctaHtml}
        </div>
      </div>
    </div>
  </body>
</html>
  `;
}