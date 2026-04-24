"use client";

import { Fragment, useState } from "react";
import type { CurrentStateRow } from "@/lib/pension/types";

type Props = {
  rows: CurrentStateRow[];
};

function money(value?: number | null) {
  if (value == null) return "—";

  return (
    value.toLocaleString("he-IL", {
      maximumFractionDigits: 0,
    }) + " ₪"
  );
}

function percent(value?: number | null) {
  if (value == null) return "—";
  return `${Number(value).toFixed(2)}%`;
}

export default function CurrentStateTable({ rows }: Props) {
  const [openPolicy, setOpenPolicy] = useState<string | null>(null);

  const totalAccumulation = rows.reduce(
    (sum, row) => sum + (row.accumulation || 0),
    0
  );

  return (
    <div dir="rtl" style={{ width: "100%" }}>
      <div style={summaryWrapStyle}>
        <div style={cardStyle}>
          <div style={labelStyle}>סה״כ צבירה</div>
          <div style={valueStyle}>{money(totalAccumulation)}</div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>מספר מוצרים</div>
          <div style={valueStyle}>{rows.length}</div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>מבוטח</div>
          <div style={valueStyle}>{rows[0]?.insuredName || "—"}</div>
        </div>
      </div>

      <div style={tableWrapStyle}>
        <table style={tableStyle}>
        <thead>
  <tr>
    <th style={thStyle}>מבוטח</th>
    <th style={thStyle}>מוצר</th>
    <th style={thStyle}>חברה</th>
    <th style={thStyle}>מס׳ פוליסה</th>
    <th style={thStyle}>סטטוס</th>
    <th style={thStyle}>צבירה</th>
    <th style={thStyle}>דמי ניהול הפקדה</th>
    <th style={thStyle}>דמי ניהול מצבירה</th>
    <th style={thStyle}>מסלול</th>
    <th style={thStyle}>קצבה צפויה</th>
    <th style={thStyle}>חיסכון צפוי</th>
    <th style={thStyle}>פירוט</th>
  </tr>
</thead>

          <tbody>
            {rows.map((row) => {
              const isOpen = openPolicy === row.policyNumber;
              const hasTracks = row.tracks.length > 0;

              const totalTrackAccumulation = row.tracks.reduce(
  (sum, track) => sum + (track.trackAccumulation || 0),
  0
);

const weightedTrackReturn =
  totalTrackAccumulation > 0
    ? row.tracks.reduce(
        (sum, track) =>
          sum +
          ((track.netReturn ?? 0) * (track.trackAccumulation || 0)) /
            totalTrackAccumulation,
        0
      )
    : null;

const weightedAnnualCost =
  totalTrackAccumulation > 0
    ? row.tracks.reduce(
        (sum, track) =>
          sum +
          ((track.annualCostPercent ?? 0) * (track.trackAccumulation || 0)) /
            totalTrackAccumulation,
        0
      )
    : null;
              return (
                <Fragment key={row.policyNumber}>
                  <tr style={rowStyle}>
                    <td style={tdStyle}>{row.insuredName}</td>
                    <td style={tdStyle}>{row.productType}</td>
                    <td style={tdStyle}>{row.companyName || "—"}</td>
                    <td style={tdStyle}>{row.policyNumber}</td>
                    <td style={tdStyle}>{row.status || "—"}</td>
                    <td style={{ ...tdStyle, fontWeight: 800 }}>
                      {money(row.accumulation)}
                    </td>
                    <td style={tdStyle}>{percent(row.depositFeePercent)}</td>
                    <td style={tdStyle}>{percent(row.balanceFeePercent)}</td>
                    <td style={tdStyle}>{row.trackDisplay}</td>
                    <td style={tdStyle}>{money(row.expectedPension)}</td>
                    <td style={tdStyle}>{money(row.expectedSavings)}</td>
                    <td style={tdStyle}>
                      {hasTracks ? (
                        <button
                          type="button"
                          onClick={() =>
                            setOpenPolicy(isOpen ? null : row.policyNumber)
                          }
                          style={buttonStyle}
                        >
                          {isOpen ? "סגור" : "פתח"}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>

                  {isOpen && (
                    <tr>
                      <td colSpan={12} style={detailsCellStyle}>
                        <div style={detailsTitleStyle}>
                          פירוט מסלולים — {row.companyName} / {row.productType}
                        </div>
<div style={detailsSummaryStyle}>
  <span>סה״כ במסלולים: {money(totalTrackAccumulation)}</span>
  <span>תשואה משוקללת: {percent(weightedTrackReturn)}</span>
  <span>עלות שנתית משוקללת: {percent(weightedAnnualCost)}</span>
</div>
                        <table style={innerTableStyle}>
                          <thead>
                            <tr style={{ background: "#e0f2fe" }}>
                              <th style={innerThStyle}>מסלול</th>
                              <th style={innerThStyle}>צבירה במסלול</th>
                              <th style={innerThStyle}>אחוז הקצאה</th>
                              <th style={innerThStyle}>תשואה נטו בקובץ</th>
                              <th style={innerThStyle}>עלות שנתית צפויה</th>
                            </tr>
                          </thead>

                          <tbody>
                            {row.tracks.map((track, index) => (
                              <tr key={`${row.policyNumber}-${index}`}>
                                <td style={innerTdStyle}>{track.trackName}</td>
                                <td style={innerTdStyle}>
                                  {money(track.trackAccumulation)}
                                </td>
                                <td style={innerTdStyle}>
                                  {percent(track.allocationPercent)}
                                </td>
                                <td style={innerTdStyle}>
                                  {percent(track.netReturn)}
                                </td>
                                <td style={innerTdStyle}>
                                  {percent(track.annualCostPercent)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
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

const summaryWrapStyle: React.CSSProperties = {
  display: "flex",
  gap: 16,
  marginBottom: 20,
  flexWrap: "wrap",
};

const cardStyle: React.CSSProperties = {
  background: "white",
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: "14px 18px",
  minWidth: 180,
  boxShadow: "0 6px 18px rgba(15, 23, 42, 0.06)",
};

const labelStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 13,
  marginBottom: 6,
};

const valueStyle: React.CSSProperties = {
  color: "#0f172a",
  fontSize: 20,
  fontWeight: 800,
};

const tableWrapStyle: React.CSSProperties = {
  overflowX: "auto",
  borderRadius: 14,
  border: "1px solid #0f172a",
  background: "white",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 1100,
};

const thStyle: React.CSSProperties = {
  padding: "14px 10px",
  textAlign: "right",
  fontSize: 13,
  fontWeight: 800,
  whiteSpace: "nowrap",
  color: "#0f172a",
  background: "#e0f2fe",
  borderBottom: "1px solid #94a3b8",
  borderLeft: "1px solid #cbd5e1",
};

const rowStyle: React.CSSProperties = {
  borderBottom: "1px solid #e5e7eb",
  background: "#ffffff",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 10px",
  textAlign: "right",
  fontSize: 13,
  color: "#0f172a",
  whiteSpace: "nowrap",
  borderLeft: "1px solid #e5e7eb",
};

const detailsCellStyle: React.CSSProperties = {
  background: "#f8fafc",
  padding: 16,
  borderBottom: "1px solid #e5e7eb",
};

const detailsTitleStyle: React.CSSProperties = {
  fontWeight: 800,
  marginBottom: 10,
  color: "#0f172a",
};

const innerTableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  background: "white",
  border: "1px solid #cbd5e1",
};

const innerThStyle: React.CSSProperties = {
  padding: "10px",
  textAlign: "right",
  fontSize: 13,
  color: "#0f172a",
  borderBottom: "1px solid #cbd5e1",
};

const innerTdStyle: React.CSSProperties = {
  padding: "10px",
  textAlign: "right",
  fontSize: 13,
  color: "#0f172a",
  borderBottom: "1px solid #e5e7eb",
};

const buttonStyle: React.CSSProperties = {
  border: "1px solid #0ea5e9",
  background: "white",
  color: "#0284c7",
  borderRadius: 999,
  padding: "6px 12px",
  cursor: "pointer",
  fontWeight: 800,
};

const detailsSummaryStyle: React.CSSProperties = {
  display: "flex",
  gap: 18,
  flexWrap: "wrap",
  marginBottom: 12,
  padding: "10px 12px",
  background: "#eef6ff",
  border: "1px solid #bfdbfe",
  borderRadius: 10,
  fontWeight: 700,
  color: "#0f172a",
};