"use client";

import { useState } from "react";
import { parseCurrentStateFromMeslekaZip } from "@/lib/pension/parseCurrentStateFromMeslekaZip";
import { mergeCurrentStateWithPdf } from "../../lib/pension/mergeCurrentStateWithPdf";
import type { CurrentStateRow, MeslekaPdfReturnRow } from "@/lib/pension/types";

export default function TestMeslekaPage() {
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [result, setResult] = useState<CurrentStateRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRun = async () => {
    if (!zipFile || !pdfFile) {
      alert("תבחרי גם ZIP וגם PDF");
      return;
    }

    try {
      setLoading(true);

      const xmlRows = await parseCurrentStateFromMeslekaZip(zipFile);
      console.log("XML ROWS", xmlRows);

      const formData = new FormData();
      formData.append("file", pdfFile);

      const pdfRes = await fetch("/api/mesleka/parse-pdf", {
        method: "POST",
        body: formData,
      });

      const pdfJson: { rows?: MeslekaPdfReturnRow[]; error?: string } = await pdfRes.json();

      if (!pdfRes.ok) {
        throw new Error(pdfJson?.error || "PDF parse failed");
      }

      const pdfRows = pdfJson.rows ?? [];
      console.log("PDF ROWS", pdfRows);

      const finalRows = mergeCurrentStateWithPdf(xmlRows, pdfRows);
      console.log("FINAL ROWS", finalRows);

      setResult(finalRows);
    } catch (err) {
      console.error("MESLEKA TEST ERROR", err);

      const message =
        err instanceof Error ? `${err.name}: ${err.message}` : "שגיאה";

      alert(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 20 }} dir="rtl">
      <h1>בדיקת מסלקה</h1>

      <div>
        <p>בחרי ZIP:</p>
        <input
          type="file"
          accept=".zip"
          onChange={(e) => setZipFile(e.target.files?.[0] || null)}
        />
      </div>

      <div style={{ marginTop: 10 }}>
        <p>בחרי PDF:</p>
        <input
          type="file"
          accept=".pdf"
          onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
        />
      </div>

      <button
        style={{ marginTop: 20 }}
        onClick={handleRun}
        disabled={loading}
      >
        {loading ? "מריץ..." : "הרץ"}
      </button>

      <pre
        style={{
          marginTop: 20,
          background: "#eee",
          padding: 10,
          whiteSpace: "pre-wrap",
          direction: "ltr",
          textAlign: "left",
        }}
      >
        {JSON.stringify(result, null, 2)}
      </pre>
    </div>
  );
}