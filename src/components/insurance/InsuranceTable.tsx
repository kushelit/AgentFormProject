"use client";

import { Fragment, useState } from "react";
import type { HarBituchRow } from "@/lib/insurance/parseHarBituch";

type Props = {
  rows: HarBituchRow[];
};

function money(value?: number | null) {
  if (value == null) return "—";
  return value.toLocaleString("he-IL", { maximumFractionDigits: 0 }) + " ₪";
}

function percent(value?: number | null) {
  if (value == null) return "—";
  return `${Number(value).toFixed(0)}%`;
}

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("he-IL", { month: "2-digit", year: "numeric" });
}

function ProductBadge({ type }: { type: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    "ביטוח חיים":           { bg: "#dbeafe", color: "#1e40af" },
    "ביטוח סיעודי":         { bg: "#fce7f3", color: "#9d174d" },
    "ביטוח בריאות":         { bg: "#d1fae5", color: "#065f46" },
    "ביטוח תאונות אישיות": { bg: "#fef3c7", color: "#92400e" },
  };
  const c = colors[type] ?? { bg: "#f1f5f9", color: "#475569" };
  return (
    <span style={{
      background: c.bg, color: c.color,
      borderRadius: 999, padding: "2px 10px",
      fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
    }}>
      {type}
    </span>
  );
}

function DiscountBadge({ percent, expiry }: { percent: number | null; expiry: string | null }) {
  if (!percent) return <span style={{ color: "#94a3b8" }}>—</span>;
  const isExpiringSoon = expiry && new Date(expiry) < new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
  return (
    <span style={{
      background: isExpiringSoon ? "#fee2e2" : "#f0fdf4",
      color: isExpiringSoon ? "#dc2626" : "#16a34a",
      borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700,
    }}>
      {percent}% {expiry ? `עד ${expiry}` : ""}
      {isExpiringSoon ? " ⚠️" : ""}
    </span>
  );
}

export default function InsuranceTable({ rows }: Props) {
  const [openPolicy, setOpenPolicy] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"productType" | "companyName" | "premiumMonthly">("productType");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = (field: typeof sortBy) => {
    if (sortBy === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortDir("asc"); }
  };

  const sortIcon = (field: typeof sortBy) => {
    if (sortBy !== field) return "↕";
    return sortDir === "asc" ? "↑" : "↓";
  };

  const sorted = [...rows].sort((a, b) => {
    let res = 0;
    if (sortBy === "premiumMonthly") {
      res = (a.premiumMonthly ?? 0) - (b.premiumMonthly ?? 0);
    } else {
      res = String(a[sortBy] ?? "").localeCompare(String(b[sortBy] ?? ""), "he");
    }
    return sortDir === "asc" ? res : -res;
  });

  const totalPremium = rows.reduce((s, r) => s + (r.premiumMonthly ?? 0), 0);
  const enrichedCount = rows.filter((r) => r.pdfEnriched).length;

  return (
    <div dir="rtl" style={{ width: "100%", marginTop: 32 }}>

      {/* כותרת סקציה */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a" }}>🛡️ תיק ביטוחי</div>
        {enrichedCount > 0 && (
          <span style={{
            background: "#f0fdf4", color: "#15803d",
            fontSize: 11, fontWeight: 600, padding: "2px 10px", borderRadius: 999,
            border: "1px solid #86efac",
          }}>
            ✅ {enrichedCount} פוליסות מועשרות מ-PDF
          </span>
        )}
      </div>

      {/* כרטיסי סיכום */}
      <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={cardStyle}>
          <div style={labelStyle}>עלות חודשית כוללת</div>
          <div style={valueStyle}>{money(totalPremium)}</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>מספר פוליסות</div>
          <div style={valueStyle}>{rows.length}</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>עלות שנתית</div>
          <div style={valueStyle}>{money(totalPremium * 12)}</div>
        </div>
      </div>

      {/* טבלה */}
      <div style={tableWrapStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={clickableThStyle} onClick={() => handleSort("productType")}>
                סוג {sortIcon("productType")}
              </th>
              <th style={clickableThStyle} onClick={() => handleSort("companyName")}>
                חברה {sortIcon("companyName")}
              </th>
              <th style={thStyle}>מס׳ פוליסה</th>
              <th style={thStyle}>סכום ביטוח</th>
              <th style={thStyle}>החרגות</th>
              <th style={thStyle}>הנחה</th>
              <th style={clickableThStyle} onClick={() => handleSort("premiumMonthly")}>
                פרמיה חודשית {sortIcon("premiumMonthly")}
              </th>
              <th style={thStyle}>תקופה</th>
              <th style={thStyle}>מוטב</th>
              <th style={thStyle}>פירוט</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const isOpen = openPolicy === row.policyNumber;
              const hasFuturePremiums = (row.futurePremiums?.length ?? 0) > 0;
              const hasCoverages = (row as any).coverages?.length > 0;
              const hasDetails = hasFuturePremiums || hasCoverages || row.pdfEnriched;

              return (
                <Fragment key={row.policyNumber}>
                  <tr style={rowStyle}>
                    <td style={tdStyle}>
                      <ProductBadge type={row.productType} />
                    </td>
                    <td style={tdStyle}>{row.companyName || "—"}</td>
                    <td style={{ ...tdStyle, fontSize: 11, color: "#64748b" }}>
                      {row.policyNumber}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>
                      {money(row.coverageAmount)}
                    </td>
                    <td style={tdStyle}>
                      {row.exclusions
                        ? <span style={{ color: "#dc2626", fontSize: 11 }}>{row.exclusions}</span>
                        : <span style={{ color: "#94a3b8" }}>ללא</span>
                      }
                    </td>
                    <td style={tdStyle}>
                      <DiscountBadge
                        percent={row.discountPercent}
                        expiry={row.discountExpiryDate}
                      />
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 800 }}>
                      {money(row.premiumMonthly)}
                    </td>
                    <td style={{ ...tdStyle, fontSize: 11 }}>
                      {row.isRenewing
                        ? "מתחדש"
                        : `${formatDate(row.coverageStart)} – ${formatDate(row.coverageEnd)}`
                      }
                    </td>
                    <td style={{ ...tdStyle, fontSize: 11 }}>
                      {row.irrevocableBeneficiary
                        ? <span style={{ color: "#7c3aed", fontWeight: 600 }}>🔒 {row.irrevocableBeneficiary}</span>
                        : <span style={{ color: "#94a3b8" }}>—</span>
                      }
                    </td>
                    <td style={tdStyle}>
                      {hasDetails ? (
                        <button
                          type="button"
                          onClick={() => setOpenPolicy(isOpen ? null : row.policyNumber)}
                          style={buttonStyle}
                        >
                          {isOpen ? "סגור" : "פתח"}
                        </button>
                      ) : "—"}
                    </td>
                  </tr>

                  {/* פאנל פירוט */}
                  {isOpen && (
                    <tr>
                      <td colSpan={10} style={detailsCellStyle}>
                        <div style={detailsTitleStyle}>
                          פירוט — {row.companyName} / {row.productType} / {row.policyNumber}
                        </div>

                        {/* מידע בסיסי */}
                        <div style={detailsSummaryStyle}>
                          {row.smokerStatus && (
                            <span>🚬 {row.smokerStatus}</span>
                          )}
                          {row.classification && (
                            <span>📋 {row.classification}</span>
                          )}
                          {row.discountPercent && row.discountExpiryDate && (
                            <span>⚠️ הנחה של {row.discountPercent}% פוגה ב-{row.discountExpiryDate}</span>
                          )}
                        </div>

                        {/* טבלת פרמיה עתידית */}
                        {hasFuturePremiums && (
                          <>
                            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>
                              📈 התפתחות פרמיה עתידית
                            </div>
                            <div style={{ overflowX: "auto", marginBottom: 16 }}>
                              <table style={innerTableStyle}>
                                <thead>
                                  <tr style={{ background: "#e0f2fe" }}>
                                    {row.futurePremiums!.map((fp, i) => (
                                      <th key={i} style={innerThStyle}>{fp.date}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr>
                                    {row.futurePremiums!.map((fp, i) => (
                                      <td key={i} style={{
                                        ...innerTdStyle,
                                        fontWeight: i === 0 ? 800 : 400,
                                        color: i === 0 ? "#0f172a" : fp.premium > (row.premiumMonthly ?? 0) * 3 ? "#dc2626" : "#0f172a",
                                      }}>
                                        {money(fp.premium)}
                                      </td>
                                    ))}
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </>
                        )}

                        {/* פירוט כיסויים */}
                        {hasCoverages && (
                          <>
                            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>
                              🛡️ פירוט כיסויים
                            </div>
                            <table style={innerTableStyle}>
                              <thead>
                                <tr style={{ background: "#e0f2fe" }}>
                                  <th style={innerThStyle}>סוג כיסוי</th>
                                  <th style={innerThStyle}>סכום ביטוח</th>
                                  <th style={innerThStyle}>פרמיה</th>
                                  <th style={innerThStyle}>תחילה</th>
                                  <th style={innerThStyle}>תום</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(row as any).coverages.map((c: any, i: number) => (
                                  <tr key={i}>
                                    <td style={innerTdStyle}>{c.coverageName || c.coverageType}</td>
                                    <td style={innerTdStyle}>{money(c.coverageAmount)}</td>
                                    <td style={innerTdStyle}>{money(c.premium)}</td>
                                    <td style={innerTdStyle}>{c.startDate || "—"}</td>
                                    <td style={innerTdStyle}>{c.endDate || "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: "white", border: "1px solid #e5e7eb", borderRadius: 14,
  padding: "14px 18px", minWidth: 160,
  boxShadow: "0 6px 18px rgba(15, 23, 42, 0.06)",
};

const labelStyle: React.CSSProperties = {
  color: "#64748b", fontSize: 13, marginBottom: 6,
};

const valueStyle: React.CSSProperties = {
  color: "#0f172a", fontSize: 20, fontWeight: 800,
};

const tableWrapStyle: React.CSSProperties = {
  overflowX: "auto", borderRadius: 14,
  border: "1px solid #0f172a", background: "white",
};

const tableStyle: React.CSSProperties = {
  width: "100%", borderCollapse: "collapse", minWidth: 900,
};

const thStyle: React.CSSProperties = {
  padding: "10px 8px", textAlign: "right", fontSize: 12,
  fontWeight: 800, whiteSpace: "nowrap", color: "#0f172a",
  background: "#e0f2fe", borderBottom: "1px solid #94a3b8",
  borderLeft: "1px solid #cbd5e1",
};

const clickableThStyle: React.CSSProperties = {
  ...thStyle, cursor: "pointer", userSelect: "none",
};

const rowStyle: React.CSSProperties = {
  borderBottom: "1px solid #e5e7eb", background: "#ffffff",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 8px", textAlign: "right", fontSize: 12,
  color: "#0f172a", whiteSpace: "nowrap", borderLeft: "1px solid #e5e7eb",
};

const detailsCellStyle: React.CSSProperties = {
  background: "#f8fafc", padding: 16, borderBottom: "1px solid #e5e7eb",
};

const detailsTitleStyle: React.CSSProperties = {
  fontWeight: 800, marginBottom: 12, color: "#0f172a", fontSize: 14,
};

const detailsSummaryStyle: React.CSSProperties = {
  display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 16,
  padding: "10px 12px", background: "#eef6ff",
  border: "1px solid #bfdbfe", borderRadius: 10,
  fontWeight: 700, color: "#0f172a", fontSize: 13,
};

const innerTableStyle: React.CSSProperties = {
  width: "100%", borderCollapse: "collapse",
  background: "white", border: "1px solid #cbd5e1",
};

const innerThStyle: React.CSSProperties = {
  padding: "8px 10px", textAlign: "right", fontSize: 12,
  color: "#0f172a", borderBottom: "1px solid #cbd5e1",
  borderLeft: "1px solid #e5e7eb", whiteSpace: "nowrap",
};

const innerTdStyle: React.CSSProperties = {
  padding: "8px 10px", textAlign: "right", fontSize: 12,
  color: "#0f172a", borderBottom: "1px solid #e5e7eb",
  borderLeft: "1px solid #e5e7eb", whiteSpace: "nowrap",
};

const buttonStyle: React.CSSProperties = {
  border: "1px solid #0ea5e9", background: "white", color: "#0284c7",
  borderRadius: 999, padding: "4px 10px", cursor: "pointer",
  fontWeight: 800, fontSize: 12,
};
