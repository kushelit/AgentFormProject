"use client";

import { useEffect, useState } from "react";

interface SourceStatus {
  exists: boolean;
  updatedAt?: string;
  entryCount?: number;
  periodFrom?: string;
  periodTo?: string;
}

interface StatusData {
  gemel: SourceStatus;
  pensia: SourceStatus;
}

export default function GemelNetAdmin() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [uploading, setUploading] = useState<"gemel" | "pensia" | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => { fetchStatus(); }, []);

  const fetchStatus = () => {
    fetch("/api/gemelnet/update")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ gemel: { exists: false }, pensia: { exists: false } }));
  };

  const handleUpload = async (type: "gemel" | "pensia", file: File) => {
    setUploading(type);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/gemelnet/update?type=${type}`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) { setMessage({ type: "error", text: data.error ?? "שגיאה" }); return; }
      setMessage({ type: "success", text: `✅ ${type === "gemel" ? "גמל נט" : "פנסיה נט"} — עודכנו ${data.entryCount} רשומות` });
      fetchStatus();
    } catch { setMessage({ type: "error", text: "שגיאת רשת" }); }
    finally { setUploading(null); }
  };

  const fmt = (iso?: string) => iso ? new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
  const fmtPeriod = (f?: string, t?: string) => (f && t) ? `${t.slice(4)}/${t.slice(0,4)} – ${f.slice(4)}/${f.slice(0,4)}` : "—";

  const renderSource = (label: string, icon: string, type: "gemel" | "pensia", src?: SourceStatus, hint?: string) => (
    <div style={{ flex: 1, minWidth: 260, border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14 }}>{label}</div>
          {hint && <div style={{ fontSize: 11, color: "#94a3b8" }}>{hint}</div>}
        </div>
      </div>

      <div style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 12px", fontSize: 13 }}>
        {!status ? <div style={{ color: "#94a3b8" }}>טוען...</div>
          : src?.exists ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div><span style={{ color: "#64748b", marginLeft: 6 }}>עדכון אחרון:</span><span style={{ fontWeight: 700 }}>{fmt(src.updatedAt)}</span></div>
              <div><span style={{ color: "#64748b", marginLeft: 6 }}>תקופה:</span><span style={{ fontWeight: 700 }}>{fmtPeriod(src.periodFrom, src.periodTo)}</span></div>
              <div><span style={{ color: "#64748b", marginLeft: 6 }}>רשומות:</span><span style={{ fontWeight: 700 }}>{src.entryCount?.toLocaleString()}</span></div>
            </div>
          ) : <div style={{ color: "#f59e0b", fontWeight: 600 }}>⚠️ אין נתונים — יש להעלות קובץ XML</div>
        }
      </div>

      <label style={{ display: "inline-block", padding: "8px 14px", background: uploading !== null ? "#94a3b8" : "#0ea5e9", color: "white", borderRadius: 8, cursor: uploading !== null ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 13 }}>
        {uploading === type ? "מעלה..." : `📁 העלה XML מ${label}`}
        <input type="file" accept=".xml" disabled={uploading !== null} style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(type, f); e.target.value = ""; }} />
      </label>
    </div>
  );

  return (
    <div dir="rtl" style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 16, padding: 20 }}>
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 16 }}>📊 עדכון נתוני תשואות</div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {renderSource("גמל נט", "💰", "gemel", status?.gemel, "גמל, השתלמות, גמל להשקעה")}
        {renderSource("פנסיה נט", "🏦", "pensia", status?.pensia, "קרנות פנסיה — מסלולי השקעה")}
      </div>
      {message && (
        <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: 8, background: message.type === "success" ? "#f0fdf4" : "#fef2f2", border: `1px solid ${message.type === "success" ? "#86efac" : "#fca5a5"}`, color: message.type === "success" ? "#15803d" : "#dc2626", fontWeight: 600, fontSize: 13 }}>
          {message.text}
        </div>
      )}
    </div>
  );
}