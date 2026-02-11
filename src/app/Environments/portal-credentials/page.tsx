"use client";

/* eslint-disable max-len */

import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { db, functions } from "@/lib/firebase/firebase";
import { useAuth } from "@/lib/firebase/AuthContext";
import { Button } from "@/components/Button/Button";

type CompanyRow = {
  id: string;
  companyName: string;
  portalId: string;
  automationEnabled?: boolean;
};

type StatusMap = Record<string, { has: boolean; updatedAtMs?: number }>;

function s(v: any) {
  return String(v ?? "").trim();
}

export default function PortalCredentialsPage() {
  const { user, detail } = useAuth();

  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [statusMap, setStatusMap] = useState<StatusMap>({});
  const [loading, setLoading] = useState(true);

  // טופס
  const [selectedPortalId, setSelectedPortalId] = useState<string>("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const agentId = user?.uid || "";

  const portalIds = useMemo(
    () => companies.map((c) => c.portalId).filter(Boolean),
    [companies]
  );

  useEffect(() => {
    const run = async () => {
      if (!agentId) {
        setLoading(false);
        return;
      }
  
      setLoading(true);
      try {
        const qy = query(
          collection(db, "company"),
          where("automationEnabled", "==", true)
        );
  
        const snap = await getDocs(qy);
        const rows: CompanyRow[] = snap.docs
          .map((d) => {
            const data: any = d.data() || {};
            return {
              id: d.id,
              companyName: s(data.companyName),
              portalId: s(data.portalId),
              automationEnabled: !!data.automationEnabled,
            };
          })
          .filter((r) => r.portalId && r.companyName);
  
        rows.sort((a, b) => a.companyName.localeCompare(b.companyName, "he"));
        setCompanies(rows);
  
        // ✅ סטטוסים רק אם יש פורטלים
        if (rows.length) {
          const getStatus = httpsCallable(functions, "getPortalCredentialsStatus");
          const res: any = await getStatus({
            agentId,
            portalIds: rows.map((r) => r.portalId),
          });
          setStatusMap(res?.data?.status || {});
        } else {
          setStatusMap({});
        }
      } catch (e) {
        console.error(e);
        setCompanies([]);
        setStatusMap({});
      } finally {
        setLoading(false);
      }
    };
  
    run();
  }, [agentId]);
  

  const refreshStatus = async () => {
    if (!agentId) return;
    if (!portalIds.length) {
      setStatusMap({});
      return;
    }
    const getStatus = httpsCallable(functions, "getPortalCredentialsStatus");
    const res: any = await getStatus({ agentId, portalIds });
    setStatusMap(res?.data?.status || {});
  };
  

  const onPickCompany = (portalId: string) => {
    setSelectedPortalId(portalId);
    setUsername("");
    setPassword("");
  };

  const onSave = async () => {
    if (!agentId || !selectedPortalId || !username || !password) return;

    setSaving(true);
    try {
      const saveCreds = httpsCallable(functions, "savePortalCredentials");
      await saveCreds({
        agentId,
        portalId: selectedPortalId,
        username,
        password,
      });

      await refreshStatus();
      setPassword("");
      alert("✅ נשמר בהצלחה");
    } catch (e: any) {
      console.error(e);
      alert(`שגיאה בשמירה: ${String(e?.message || e)}`);
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="p-6 max-w-3xl mx-auto text-right">
        <h1 className="text-2xl font-bold">חיבור לפורטלים</h1>
        <p className="mt-2 text-gray-600">יש להתחבר כדי לשמור פרטי פורטלים.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto text-right">
      <h1 className="text-2xl font-bold">🔐 חיבור לפורטלים</h1>
      <p className="mt-2 text-gray-600">
        כאן שומרים שם משתמש וסיסמה לכל פורטל (מוצפן). זה מאפשר להריץ הורדה אוטומטית בענן.
      </p>

      <div className="mt-4 text-sm text-gray-700">
        סוכן: <b>{detail?.name || user.email}</b>
      </div>

      {loading ? (
        <div className="mt-6">טוען...</div>
      ) : (
        <>
          <div className="mt-6 border rounded p-3 bg-gray-50">
            <div className="font-semibold mb-2">פורטלים זמינים</div>

            {companies.length === 0 ? (
              <div className="text-gray-600">
                לא נמצאו חברות עם <code>automationEnabled=true</code> ו־<code>portalId</code>.
              </div>
            ) : (
              <div className="grid gap-2">
                {companies.map((c) => {
                  const st = statusMap[c.portalId];
                  const has = !!st?.has;

                  return (
                    <div
                      key={c.id}
                      className="flex items-center justify-between border rounded px-3 py-2 bg-white"
                    >
                      <div className="flex items-center gap-3">
                        <div className="font-semibold">{c.companyName}</div>
                        <div className="text-xs text-gray-500">({c.portalId})</div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div
                          className="text-sm"
                          title={st?.updatedAtMs ? new Date(st.updatedAtMs).toLocaleString("he-IL") : ""}
                        >
                          {has ? "✅ שמור" : "❌ לא שמור"}
                        </div>

                        <Button
                          text={has ? "ערוך" : "חבר"}
                          type="secondary"
                          onClick={() => onPickCompany(c.portalId)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-3 flex justify-end">
              <Button text="רענן סטטוס" type="secondary" onClick={refreshStatus} />
            </div>
          </div>

          <div className="mt-6 border rounded p-4">
            <div className="font-semibold mb-3">שמירה / עדכון פרטי פורטל</div>

            <div className="mb-3">
              <label className="block font-semibold mb-1">בחר פורטל:</label>
              <select
                value={selectedPortalId}
                onChange={(e) => setSelectedPortalId(e.target.value)}
                className="select-input w-full"
              >
                <option value="">בחר פורטל</option>
                {companies.map((c) => (
                  <option key={c.portalId} value={c.portalId}>
                    {c.companyName} ({c.portalId})
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-3">
              <label className="block font-semibold mb-1">שם משתמש:</label>
              <input
                className="select-input w-full"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="לדוגמה: ת״ז / שם משתמש בפורטל"
              />
            </div>

            <div className="mb-3">
              <label className="block font-semibold mb-1">סיסמה:</label>
              <input
                className="select-input w-full"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="סיסמה לפורטל"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                text={saving ? "⏳ שומר..." : "שמור"}
                type="primary"
                onClick={onSave}
                disabled={!selectedPortalId || !username || !password || saving}
              />
            </div>

            {selectedPortalId && (
              <div className="mt-2 text-xs text-gray-500">
                סטטוס נוכחי:{" "}
                <b>{statusMap[selectedPortalId]?.has ? "✅ שמור" : "❌ לא שמור"}</b>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
