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
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [result, setResult] = useState<CurrentStateRow[] | null>(null);
  const [matchStats, setMatchStats] = useState<{ matched: number; total: number } | null>(null);
  const [gemelStatus, setGemelStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // ─── ביטוח ───────────────────────────────────────────────────
  const [harFile, setHarFile] = useState<File | null>(null);
  const [policyFiles, setPolicyFiles] = useState<File[]>([]);
  const [insuranceRows, setInsuranceRows] = useState<HarBituchRow[] | null>(null);
  const [insuranceLoading, setInsuranceLoading] = useState(false);
  const [hiddenRows, setHiddenRows] = useState<HarBituchRow[]>([]);

  const [user] = useAuthState(auth);

  const [pdfQuota, setPdfQuota] = useState<{ used: number; limit: number; remaining: number } | null>(null);

  // ─── Handler פנסיה ───────────────────────────────────────────


  const handleRun = async () => {
    if (!zipFile) {
      alert("בחר קובץ ZIP מהמסלקה");
      return;
    }

    try {
      setLoading(true);
      setGemelStatus(null);

      const xmlRows = await parseCurrentStateFromMeslekaZip(zipFile);
      let enriched = xmlRows;

      try {
        const res = await fetch("/api/gemelnet/data");
        if (res.ok) {
          const data = await res.json();
          if (data.exists && Array.isArray(data.entries)) {
            const gemelMap: GemelNetMap = new Map(
              data.entries.map((e: GemelNetEntry) => [e.kupahId, e])
            );
            enriched = enrichRowsWithReturns(xmlRows, gemelMap);

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

      const sorted = [...enriched].sort((a, b) => {
        const productCompare = a.productType.localeCompare(b.productType, "he");
        if (productCompare !== 0) return productCompare;
        return (b.accumulation || 0) - (a.accumulation || 0);
      });

      const filtered = sorted.filter(r =>
        r.status === "פעיל" || (r.accumulation ?? 0) > 0
      );
      setMatchStats({ matched: filtered.filter((r) => r.gemelNetMatched).length, total: filtered.length });
      setResult(filtered);

    } catch (err) {
      alert(err instanceof Error ? `${err.name}: ${err.message}` : "שגיאה");
    } finally {
      setLoading(false);
    }
  };

  // ─── Handler ביטוח ───────────────────────────────────────────
  const handleInsuranceRun = async () => {
    if (!harFile) {
      alert("בחר קובץ Excel מהר הביטוח");
      return;
    }
    try {
      setInsuranceLoading(true);

      const harResult = await parseHarBituchXlsx(harFile);

      const pdfResults: PolicyPdfResult[] = [];

  if (!user) {
  alert("נדרש להתחבר למערכת");
  return;
}

      for (const file of policyFiles) {
        const result = await parsePolicyPdf(file , user.uid);
      pdfResults.push(result);

      if (result._quota) {
  setPdfQuota(result._quota);
}

        if (user && result._usage) {
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
      }

      let rows = harResult.lifeAndHealthRows;
      setHiddenRows(harResult.generalRows);

      if (policyFiles.length > 0) {
        rows = mergeAllPolicies(rows, pdfResults);
      }

      setInsuranceRows(rows);
    } catch (err) {
      alert(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setInsuranceLoading(false);
    }
  };

  return (
    <div dir="rtl" style={{ minHeight: "100vh", background: "#f1f5f9", padding: 32 }}>

      {/* ─── CSS הדפסה ─── */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          tr { page-break-inside: avoid; }
          h1, h2 { page-break-after: avoid; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
{(result || insuranceRows) && (
  <title>
    {`ניתוח תיק — ${result?.[0]?.insuredName ?? "לקוח"}`}
  </title>
)}
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>

        {/* ─── כותרת + כפתור הדפסה ─── */}
        <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, color: "#0f172a" }}>
              ניתוח תיק לקוח
            </h1>
            <p style={{ marginTop: 8, color: "#64748b", margin: "8px 0 0" }}>
              פנסיה, פיננסים וביטוח — תמונה מלאה
            </p>
          </div>

          {/* כפתור הדפסה — מוצג רק כשיש נתונים, נעלם בהדפסה */}
          {(result || insuranceRows) && (
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

          {/* כרטיס קלט — נעלם בהדפסה */}
          <div style={cardStyle} className="no-print">
            <div>
              <div style={labelStyle}>
                📁 קובץ ZIP מהמסלקה הפנסיונית
                <span style={badgeStyle("#fee2e2", "#dc2626")}>חובה</span>
              </div>
              <input type="file" accept=".zip"
                onChange={(e) => setZipFile(e.target.files?.[0] || null)} />
              {zipFile && <div style={fileOkStyle}>✅ {zipFile.name}</div>}
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

          {/* הודעות סטטוס — נעלמות בהדפסה */}
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

          {result && matchStats && (
            <div className="no-print" style={{
              background: matchStats.matched > 0 ? "#f0fdf4" : "#fffbeb",
              border: `1px solid ${matchStats.matched > 0 ? "#86efac" : "#fcd34d"}`,
              borderRadius: 10, padding: "12px 16px", marginBottom: 16,
              fontWeight: 600,
              color: matchStats.matched > 0 ? "#15803d" : "#92400e",
            }}>
              {matchStats.matched > 0
                ? `✅ תשואות גמל נט שולבו ב-${matchStats.matched} מתוך ${matchStats.total} מוצרים`
                : `⚠️ לא נמצאו התאמות — קרן פנסיה לא מכוסה בגמל נט`}
            </div>
          )}

          {/* טבלת פנסיה — מוצגת בהדפסה */}
          {result && (
            <>
              {/* כותרת סקציה בהדפסה בלבד */}
              <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 8, display: "none" }}
                className="print-only">
                🏦 מצב פנסיוני קיים
              </div>
              <CurrentStateTable rows={result} />
            </>
          )}
        </div>

        {/* ─── קלט ביטוח ─── */}
        <div style={{ ...sectionStyle, marginTop: 40 }}>
          <div style={sectionTitleStyle} className="no-print">🛡️ תיק ביטוחי</div>

          {/* כרטיס קלט — נעלם בהדפסה */}
          <div style={cardStyle} className="no-print">
            <div>
              <div style={labelStyle}>
                📊 קובץ Excel מהר הביטוח
                <span style={badgeStyle("#fee2e2", "#dc2626")}>חובה</span>
              </div>
              <input type="file" accept=".xlsx,.xls,.zip"
                onChange={(e) => setHarFile(e.target.files?.[0] || null)} />
              {harFile && <div style={fileOkStyle}>✅ {harFile.name}</div>}
            </div>

            <div>
              <div style={labelStyle}>
                📄 עותקי פוליסות PDF
                <span style={badgeStyle("#fef9c3", "#854d0e")}>אופציונלי</span>
              </div>
              <input type="file" accept=".pdf" multiple
                onChange={(e) => setPolicyFiles(Array.from(e.target.files ?? []))} />
              {policyFiles.length > 0 && (
                <div style={fileOkStyle}>✅ {policyFiles.length} קבצים</div>
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
  {/* ─── מכסת PDF ─── */}
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

            {insuranceRows && hiddenRows.length > 0 && (
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

          {/* טבלת ביטוח — מוצגת בהדפסה */}
          {insuranceRows && <InsuranceTable rows={insuranceRows} />}
        </div>

      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────

const sectionStyle: React.CSSProperties = {
  marginBottom: 16,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 18, fontWeight: 800, color: "#0f172a",
  marginBottom: 16,
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
