"use client";

import { useState } from "react";
import { parseCurrentStateFromMeslekaZip } from "@/lib/pension/parseCurrentStateFromMeslekaZip";
import type { CurrentStateRow } from "@/lib/pension/types";
import CurrentStateTable from "@/components/pension/CurrentStateTable";

export default function TestMeslekaPage() {
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [result, setResult] = useState<CurrentStateRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRun = async () => {
    if (!zipFile) {
      alert("תבחרי קובץ ZIP");
      return;
    }

    try {
      setLoading(true);

      const xmlRows = await parseCurrentStateFromMeslekaZip(zipFile);
      console.log("XML ROWS", xmlRows);

      setResult(xmlRows);
    } catch (err) {
      console.error("MESLEKA XML ERROR", err);

      const message =
        err instanceof Error ? `${err.name}: ${err.message}` : "שגיאה";

      alert(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      dir="rtl"
      style={{
        minHeight: "100vh",
        background: "#f1f5f9",
        padding: 32,
      }}
    >
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 28, color: "#0f172a" }}>
            מצב קיים ללקוח — מסלקה פנסיונית
          </h1>
          <p style={{ marginTop: 8, color: "#64748b" }}>
            טעינת ZIP מהמסלקה והצגת תמונת מצב קיימת לפי המוצרים שנמצאו.
          </p>
        </div>

        <div
          style={{
            background: "white",
            borderRadius: 16,
            padding: 20,
            marginBottom: 24,
            border: "1px solid #e5e7eb",
          }}
        >
          <div style={{ marginBottom: 12, fontWeight: 700 }}>בחרי ZIP:</div>

          <input
            type="file"
            accept=".zip"
            onChange={(e) => setZipFile(e.target.files?.[0] || null)}
          />

          <button
            style={{
              marginRight: 16,
              padding: "10px 18px",
              borderRadius: 10,
              border: "none",
              background: loading ? "#94a3b8" : "#0ea5e9",
              color: "white",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 700,
            }}
            onClick={handleRun}
            disabled={loading}
          >
            {loading ? "טוען..." : "הצג מצב קיים"}
          </button>
        </div>

        {result && <CurrentStateTable rows={result} />}
      </div>
    </div>
  );
}