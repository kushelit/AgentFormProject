"use client";

import { useEffect, useState } from "react";
import { parseCurrentStateFromMeslekaZip } from "@/lib/pension/parseCurrentStateFromMeslekaZip";
import { enrichRowsWithReturns } from "@/lib/pension/parseGemelNet";
import type { CurrentStateRow } from "@/lib/pension/types";
import CurrentStateTable from "@/components/pension/CurrentStateTable";
import type { GemelNetEntry, GemelNetMap } from "@/lib/pension/parseGemelNet";
import { parseHarBituchXlsx } from "@/lib/insurance/parseHarBituch";
import { mergeAllPolicies } from "@/lib/insurance/parsePolicyPdf";
import type { HarBituchRow } from "@/lib/insurance/parseHarBituch";
import InsuranceTable from "@/components/insurance/InsuranceTable";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "@/lib/firebase/firebase";
import { logPolicyUsage, calcCost } from "@/lib/insurance/logPolicyUsage";
import { parsePolicyPdf, type PolicyPdfResult } from "@/lib/insurance/parsePolicyPdf";

export default function TestMeslekaPage() {
  // ─── פנסיה ───────────────────────────────────────────────────
  const [zipFiles, setZipFiles] = useState<File[]>([]);
  const [results, setResults] = useState<{ fileName: string; insuredName: string; rows: CurrentStateRow[] }[]>([]);
  const [gemelStatus, setGemelStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // ─── ביטוח ───────────────────────────────────────────────────
const [harFiles, setHarFiles] = useState<File[]>([]);
  const [policyFiles, setPolicyFiles] = useState<File[]>([]);
const [insuranceGroups, setInsuranceGroups] = useState<{ idNumber: string; rows: HarBituchRow[] }[]>([]);
  const [insuranceLoading, setInsuranceLoading] = useState(false);
  const [hiddenRows, setHiddenRows] = useState<HarBituchRow[]>([]);
  const [pdfQuota, setPdfQuota] = useState<{ used: number; limit: number; remaining: number } | null>(null);

  const [user] = useAuthState(auth);

  // ─── Handler פנסיה ───────────────────────────────────────────
  const handleRun = async () => {
    if (!zipFiles.length) {
      alert("בחר קובץ ZIP מהמסלקה");
      return;
    }

    try {
      setLoading(true);
      setGemelStatus(null);
      setResults([]);

      // טען gemelnet פעם אחת
      let gemelMap: GemelNetMap | null = null;
      try {
        const res = await fetch("/api/gemelnet/data");
        if (res.ok) {
          const data = await res.json();
          if (data.exists && Array.isArray(data.entries)) {
            gemelMap = new Map(
              data.entries.map((e: GemelNetEntry) => [e.kupahId, e])
            );
            const date = (data.gemelUpdatedAt ?? data.pensiaUpdatedAt ?? data.updatedAt)
              ? new Date(data.gemelUpdatedAt ?? data.pensiaUpdatedAt ?? data.updatedAt).toLocaleDateString("he-IL")
              : "לא ידוע";
            setGemelStatus(`נתוני גמל נט מתאריך ${date} — ${data.totalEntries ?? data.entryCount} קופות`);
          } else {
            setGemelStatus("לא נמצאו נתוני גמל נט שמורים — יש לעדכן בהגדרות");
          }
        } else {
          setGemelStatus("לא נמצאו נתוני גמל נט שמורים — יש לעדכן בהגדרות");
        }
      } catch {
        setGemelStatus("לא ניתן לטעון נתוני גמל נט");
      }

      // עבור על כל ZIP
      const allResults: { fileName: string; insuredName: string; rows: CurrentStateRow[] }[] = [];
      for (const file of zipFiles) {
        const xmlRows = await parseCurrentStateFromMeslekaZip(file);
        const enriched = gemelMap ? enrichRowsWithReturns(xmlRows, gemelMap) : xmlRows;

        const sorted = [...enriched].sort((a, b) => {
          const productCompare = a.productType.localeCompare(b.productType, "he");
          if (productCompare !== 0) return productCompare;
          return (b.accumulation || 0) - (a.accumulation || 0);
        });

        const filtered = sorted.filter(r =>
          r.status === "פעיל" || (r.accumulation ?? 0) > 0
        );

        allResults.push({
          fileName: file.name,
          insuredName: filtered[0]?.insuredName ?? file.name,
          rows: filtered,
        });
      }

      setResults(allResults);

    } catch (err) {
      alert(err instanceof Error ? `${err.name}: ${err.message}` : "שגיאה");
    } finally {
      setLoading(false);
    }
  };

  // ─── Handler ביטוח ───────────────────────────────────────────
 const handleInsuranceRun = async () => {
  if (!harFiles.length) {
    alert("בחר קובץ Excel מהר הביטוח");
    return;
  }

  if (!user) {
    alert("נדרש להתחבר למערכת");
    return;
  }

  try {
    setInsuranceLoading(true);

    // ─── עיבוד כל קבצי הר הביטוח ───
    const allHarRows: HarBituchRow[] = [];
    const allHiddenRows: HarBituchRow[] = [];

    for (const file of harFiles) {
      const harResult = await parseHarBituchXlsx(file);
      allHarRows.push(...harResult.lifeAndHealthRows);
      allHiddenRows.push(...harResult.generalRows);
    }

    setHiddenRows(allHiddenRows);

    // ─── עיבוד PDFs ───
    const pdfResults: PolicyPdfResult[] = [];

    for (const file of policyFiles) {
      const result = await parsePolicyPdf(file, user.uid);
      pdfResults.push(result);

      if (result._quota) {
        setPdfQuota(result._quota);
      }

      if (result._usage) {
        await logPolicyUsage({
          agentUid: user.uid,
          agentEmail: user.email ?? "",
          insuredName: result.insuredName,
          policyNumber: result.policyNumber,
          companyName: result.companyName,
          inputTokens: result._usage.input_tokens,
          outputTokens: result._usage.output_tokens,
          estimatedCostUsd: calcCost(result._usage.input_tokens, result._usage.output_tokens),
          model: result._usage.model,
          fileName: file.name,
          parseConfidence: result.parseConfidence,
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // ─── מיזוג PDFs לשורות ───
    let rows = allHarRows;
    if (policyFiles.length > 0) {
      rows = mergeAllPolicies(allHarRows, pdfResults);
    }

const groupMap = new Map<string, HarBituchRow[]>();
for (const row of rows) {
  const key = row.idNumber ?? "לא ידוע";
  if (!groupMap.has(key)) groupMap.set(key, []);
  groupMap.get(key)!.push(row);
}

setInsuranceGroups(
  Array.from(groupMap.entries()).map(([idNumber, rows]) => ({ idNumber, rows }))
);
  } catch (err) {
    alert(err instanceof Error ? err.message : "שגיאה");
  } finally {
    setInsuranceLoading(false);
  }
};


useEffect(() => {
  if (!user) return;
  fetch(`/api/insurance/pdf-quota?agentUid=${user.uid}`)
    .then((r) => r.json())
    .then(setPdfQuota)
    .catch(() => {});
}, [user]);


  return (
    <div dir="rtl" style={{ minHeight: "100vh", background: "#f1f5f9", padding: 32 }}>

  <style>{`
  @media print {
    .no-print { display: none !important; }
    .print-hide { display: none !important; }
    body { background: white !important; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    
    table { 
      page-break-inside: auto;
      font-size: 7px !important;
      width: 100% !important;
    }
    
    th, td {
      padding: 1px 3px !important;
      white-space: nowrap;
      font-size: 6.5px !important;
    }
    
    tr { page-break-inside: avoid; }
    h1, h2 { page-break-after: avoid; }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    
    .insured-section { page-break-inside: avoid; }
  }

  @page {
    size: A4 landscape;
    margin: 3mm;
  }
`}</style>
      {results.length > 0 && (
        <title>{`ניתוח תיק — ${results.map(r => r.insuredName).join(" ו־")}`}</title>
      )}

      <div style={{ maxWidth: 1400, margin: "0 auto" }}>

        {/* ─── כותרת + כפתור הדפסה ─── */}
        <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, color: "#0f172a" }}>ניתוח תיק לקוח</h1>
            <p style={{ marginTop: 8, color: "#64748b", margin: "8px 0 0" }}>
              פנסיה, פיננסים וביטוח — תמונה מלאה
            </p>
          </div>

{(results.length > 0 || insuranceGroups.length > 0) && (
            <button
              onClick={() => window.print()}
              className="no-print"
              style={{
                padding: "10px 24px", borderRadius: 10, border: "none",
                background: "#0f172a", color: "white",
                cursor: "pointer", fontWeight: 700, fontSize: 14,
                display: "flex", alignItems: "center", gap: 8,
              }}
            >
              🖨️ הדפס / שמור PDF
            </button>
          )}
        </div>

        {/* ─── קלט פנסיה ─── */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle} className="no-print">🏦 מסלקה פנסיונית</div>

          <div style={cardStyle} className="no-print">
            <div>
              <div style={labelStyle}>
                📁 קבצי ZIP מהמסלקה הפנסיונית
                <span style={badgeStyle("#fee2e2", "#dc2626")}>חובה</span>
              </div>
        <div>
  <label style={{
    display: "inline-block",
    padding: "8px 16px", borderRadius: 8,
    background: "#f1f5f9", border: "1px solid #e2e8f0",
    cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#0f172a",
  }}>
    ➕ הוסף קובץ ZIP
    <input
      type="file"
      accept=".zip"
      style={{ display: "none" }}
      onChange={(e) => {
        const newFiles = Array.from(e.target.files ?? []);
        setZipFiles(prev => [...prev, ...newFiles]);
        e.target.value = "";
      }}
    />
  </label>

  {zipFiles.length > 0 && (
    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
      {zipFiles.map((f, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={fileOkStyle}>✅ {f.name}</span>
          <span
            onClick={() => setZipFiles(prev => prev.filter((_, idx) => idx !== i))}
            style={{ cursor: "pointer", color: "#dc2626", fontSize: 12, fontWeight: 700 }}
          >✕</span>
        </div>
      ))}
    </div>
  )}
</div>
            </div>

            <button
              style={{
                padding: "12px 28px", borderRadius: 10, border: "none",
                background: loading ? "#94a3b8" : "#0ea5e9",
                color: "white", cursor: loading ? "not-allowed" : "pointer",
                fontWeight: 700, fontSize: 15, alignSelf: "flex-start",
              }}
              onClick={handleRun}
              disabled={loading}
            >
              {loading ? "טוען..." : "הצג מצב קיים"}
            </button>
          </div>

          {/* סטטוס גמל נט */}
          {gemelStatus && (
            <div className="no-print" style={{
              background: gemelStatus.includes("לא") ? "#fffbeb" : "#f0fdf4",
              border: `1px solid ${gemelStatus.includes("לא") ? "#fcd34d" : "#86efac"}`,
              borderRadius: 10, padding: "10px 16px", marginBottom: 12,
              fontSize: 13, fontWeight: 600,
              color: gemelStatus.includes("לא") ? "#92400e" : "#15803d",
            }}>
              {gemelStatus.includes("לא") ? "⚠️" : "✅"} {gemelStatus}
            </div>
          )}

          {/* טבלאות פנסיה — אחת לכל מבוטח */}
          {results.map((r, i) => (
            <div key={i} className="insured-section" style={{ marginBottom: 40 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>
                👤 {r.insuredName}
              </div>
              <CurrentStateTable rows={r.rows} />
            </div>
          ))}
        </div>

        {/* ─── קלט ביטוח ─── */}
        <div style={{ ...sectionStyle, marginTop: 40 }}>
          <div style={sectionTitleStyle} className="no-print">🛡️ תיק ביטוחי</div>

          <div style={cardStyle} className="no-print">
         <div>
  <div style={labelStyle}>
    📊 קבצי Excel מהר הביטוח
    <span style={badgeStyle("#fee2e2", "#dc2626")}>חובה</span>
  </div>

  <label style={{
    display: "inline-block",
    padding: "8px 16px", borderRadius: 8,
    background: "#f1f5f9", border: "1px solid #e2e8f0",
    cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#0f172a",
  }}>
    ➕ הוסף קובץ Excel
    <input
      type="file"
      accept=".xlsx,.xls,.zip"
      style={{ display: "none" }}
      onChange={(e) => {
        const newFiles = Array.from(e.target.files ?? []);
        setHarFiles(prev => [...prev, ...newFiles]);
        e.target.value = "";
      }}
    />
  </label>

  {harFiles.length > 0 && (
    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
      {harFiles.map((f, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={fileOkStyle}>✅ {f.name}</span>
          <span
            onClick={() => setHarFiles(prev => prev.filter((_, idx) => idx !== i))}
            style={{ cursor: "pointer", color: "#dc2626", fontSize: 12, fontWeight: 700 }}
          >✕</span>
        </div>
      ))}
    </div>
  )}
</div>
    <div>
  <div style={labelStyle}>
    📄 עותקי פוליסות PDF
    <span style={badgeStyle("#fef9c3", "#854d0e")}>אופציונלי</span>
  </div>

  <label style={{
    display: "inline-block",
    padding: "8px 16px", borderRadius: 8,
    background: "#f1f5f9", border: "1px solid #e2e8f0",
    cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#0f172a",
  }}>
    ➕ הוסף קובץ PDF
    <input
      type="file"
      accept=".pdf"
      style={{ display: "none" }}
      onChange={(e) => {
        const newFiles = Array.from(e.target.files ?? []);
        setPolicyFiles(prev => [...prev, ...newFiles]);
        e.target.value = "";
      }}
    />
  </label>

  {policyFiles.length > 0 && (
    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
      {policyFiles.map((f, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={fileOkStyle}>✅ {f.name}</span>
          <span
            onClick={() => setPolicyFiles(prev => prev.filter((_, idx) => idx !== i))}
            style={{ cursor: "pointer", color: "#dc2626", fontSize: 12, fontWeight: 700 }}
          >✕</span>
        </div>
      ))}
    </div>
  )}
</div>
     <button
              style={{
                padding: "12px 28px", borderRadius: 10, border: "none",
                background: insuranceLoading ? "#94a3b8" : "#0ea5e9",
                color: "white", cursor: insuranceLoading ? "not-allowed" : "pointer",
                fontWeight: 700, fontSize: 15, alignSelf: "flex-start",
              }}
              onClick={handleInsuranceRun}
              disabled={insuranceLoading}
            >
              {insuranceLoading ? "מנתח..." : "הצג תיק ביטוחי"}
            </button>

            {/* מכסת PDF */}
            {pdfQuota && (
              <div style={{
                background: pdfQuota.remaining === 0 ? "#fee2e2" : "#f0fdf4",
                border: `1px solid ${pdfQuota.remaining === 0 ? "#fca5a5" : "#86efac"}`,
                borderRadius: 10, padding: "10px 16px",
                fontSize: 13, fontWeight: 600,
                color: pdfQuota.remaining === 0 ? "#dc2626" : "#15803d",
              }}>
                {pdfQuota.remaining === 0
                  ? `⛔ הגעת למכסה החודשית (${pdfQuota.limit} פוליסות)`
                  : `📄 פוליסות שנותחו החודש: ${pdfQuota.used}/${pdfQuota.limit} — נותרו ${pdfQuota.remaining}`}
              </div>
            )}
          {insuranceGroups.length > 0 && hiddenRows.length > 0 && (
                <div style={{
                background: "#fffbeb", border: "1px solid #fcd34d",
                borderRadius: 10, padding: "12px 16px", marginBottom: 16,
                fontSize: 13, color: "#92400e",
              }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                  ⚠️ {hiddenRows.length} פוליסות לא מוצגות (רכב / דירה / אחר):
                </div>
                {hiddenRows.map((r) => (
                  <div key={r.policyNumber} style={{ fontSize: 12, marginTop: 2 }}>
                    • {r.companyName} — {r.branchMain} ({r.branchSub}) — פוליסה {r.policyNumber}
                  </div>
                ))}
              </div>
            )}
          </div>
{insuranceGroups.map((group, i) => (
  <div key={i}  className="insured-section" style={{ marginBottom: 40 }}>
    <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>
      👤 ת.ז: {group.idNumber}
    </div>
    <InsuranceTable rows={group.rows} />
  </div>
))}        </div>

      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────

const sectionStyle: React.CSSProperties = { marginBottom: 16 };

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 16,
};

const cardStyle: React.CSSProperties = {
  background: "white", borderRadius: 16, padding: 24,
  marginBottom: 16, border: "1px solid #e5e7eb",
  display: "flex", flexDirection: "column", gap: 20,
};

const labelStyle: React.CSSProperties = {
  fontWeight: 700, marginBottom: 6,
  display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
};

function badgeStyle(bg: string, color: string): React.CSSProperties {
  return {
    background: bg, color, fontSize: 11,
    padding: "2px 8px", borderRadius: 999, fontWeight: 600,
  };
}

const fileOkStyle: React.CSSProperties = {
  fontSize: 12, color: "#16a34a", marginTop: 4,
};