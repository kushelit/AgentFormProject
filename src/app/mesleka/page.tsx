"use client";

import { useState } from "react";
import { parseCurrentStateFromMeslekaZip } from "@/lib/pension/parseCurrentStateFromMeslekaZip";
import { parseGemelNetXml, enrichRowsWithReturns } from "@/lib/pension/parseGemelNet";
import type { CurrentStateRow } from "@/lib/pension/types";
import CurrentStateTable from "@/components/pension/CurrentStateTable";
import type { GemelNetEntry, GemelNetMap } from "@/lib/pension/parseGemelNet";


export default function TestMeslekaPage() {
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [result, setResult] = useState<CurrentStateRow[] | null>(null);
  const [matchStats, setMatchStats] = useState<{ matched: number; total: number } | null>(null);
  const [gemelStatus, setGemelStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRun = async () => {
    if (!zipFile) {
      alert("תבחרי קובץ ZIP מהמסלקה");
      return;
    }

    try {
      setLoading(true);
      setGemelStatus(null);

      // 1. ניתוח ZIP מסלקה
      const xmlRows = await parseCurrentStateFromMeslekaZip(zipFile);

      // 2. טעינת נתוני גמל נט מ-Firestore אוטומטית
      let enriched = xmlRows;

      try {
        const res = await fetch("/api/gemelnet/data");

        if (res.ok) {
          const data = await res.json();

          if (data.exists && Array.isArray(data.entries)) {
            // בנה Map מהמערך שחזר מה-API
       const gemelMap: GemelNetMap = new Map(
  data.entries.map((e: GemelNetEntry) => [e.kupahId, e])
);

            enriched = enrichRowsWithReturns(xmlRows, gemelMap);
console.log("pension row:", enriched.find(r => r.productType === "קרן פנסיה")); // ← כאן

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

      // 3. מיון
      const sorted = [...enriched].sort((a, b) => {
        const productCompare = a.productType.localeCompare(b.productType, "he");
        if (productCompare !== 0) return productCompare;
        return (b.accumulation || 0) - (a.accumulation || 0);
      });

      // 4. סטטיסטיקת התאמה
      const matched = sorted.filter((r) => r.gemelNetMatched).length;
      setMatchStats({ matched, total: sorted.length });
      setResult(sorted);

    } catch (err) {
      console.error("ERROR", err);
      alert(err instanceof Error ? `${err.name}: ${err.message}` : "שגיאה");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div dir="rtl" style={{ minHeight: "100vh", background: "#f1f5f9", padding: 32 }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>

        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 28, color: "#0f172a" }}>
            מצב קיים ללקוח — מסלקה פנסיונית
          </h1>
          <p style={{ marginTop: 8, color: "#64748b" }}>
            טעינת ZIP מהמסלקה — תשואות גמל נט נטענות אוטומטית
          </p>
        </div>

        {/* קלט — רק ZIP */}
        <div style={cardStyle}>
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

        {/* סטטוס גמל נט */}
        {gemelStatus && (
          <div style={{
            background: gemelStatus.includes("לא") ? "#fffbeb" : "#f0fdf4",
            border: `1px solid ${gemelStatus.includes("לא") ? "#fcd34d" : "#86efac"}`,
            borderRadius: 10, padding: "10px 16px", marginBottom: 12,
            fontSize: 13, fontWeight: 600,
            color: gemelStatus.includes("לא") ? "#92400e" : "#15803d",
          }}>
            {gemelStatus.includes("לא") ? "⚠️" : "✅"} {gemelStatus}
          </div>
        )}

        {/* סטטוס התאמה */}
        {result && matchStats && (
          <div style={{
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

        {result && <CurrentStateTable rows={result} />}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: "white", borderRadius: 16, padding: 24,
  marginBottom: 24, border: "1px solid #e5e7eb",
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
