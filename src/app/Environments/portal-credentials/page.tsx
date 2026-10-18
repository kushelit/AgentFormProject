"use client";

/* eslint-disable max-len */

import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where, doc, getDoc, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { db, functions } from "@/lib/firebase/firebase";
import { useAuth } from "@/lib/firebase/AuthContext";
import { Button } from "@/components/Button/Button";
import PortalCredentialsModal, { type PortalCredentialsStatusMap as StatusMap } from "@/components/PortalCredentials/PortalCredentialsModal";
import { getPortalPrefill } from "@/lib/portalCredentials/prefill";

type CompanyRow = {
  id: string;
  companyName: string;
  portalId: string;
  automationEnabled?: boolean;
};

function s(v: any) {
  return String(v ?? "").trim();
}

// ─── Help video wizard (4 סרטונים ברצף: התקנה → סיסמאות → הורדה → צפייה בנתונים) ──
type HelpVideo = { key: string; title: string; url: string };

function HelpVideoWizard({
  videos,
  onClose,
}: {
  videos: HelpVideo[];
  onClose: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);

  const current = videos[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === videos.length - 1;

  const onBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onBackdropClick}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl text-right relative overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-400 font-bold mb-0.5">
              שלב {stepIndex + 1} מתוך {videos.length}
            </div>
            <h2 className="text-lg font-bold text-gray-800">{current.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <div className="bg-black flex items-center justify-center">
          <video
            key={current.url}
            src={current.url}
            controls
            preload="metadata"
            className="w-full max-h-[60vh]"
          />
        </div>

        <div className="p-4 flex items-center justify-between gap-3">
          <div className="flex gap-1.5">
            {videos.map((v, i) => (
              <span
                key={v.key}
                className={`h-2 w-2 rounded-full ${
                  i === stepIndex ? "bg-blue-600" : "bg-gray-200"
                }`}
              />
            ))}
          </div>

          <div className="flex gap-2">
            <Button
              text="הקודם"
              type="secondary"
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
              disabled={isFirst}
            />
            {isLast ? (
              <Button text="סיימתי" type="primary" onClick={onClose} />
            ) : (
              <Button
                text="הבא"
                type="primary"
                onClick={() => setStepIndex((i) => Math.min(videos.length - 1, i + 1))}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PortalCredentialsPage() {
  const { user, detail } = useAuth();

  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [statusMap, setStatusMap] = useState<StatusMap>({});
  const [loading, setLoading] = useState(true);

  const [modalCompany, setModalCompany] = useState<CompanyRow | null>(null);

  const [pairing, setPairing] = useState<{ code: string; expiresAtMs: number } | null>(null);
  const [pairingLeftSec, setPairingLeftSec] = useState<number>(0);
  const [creatingPairing, setCreatingPairing] = useState(false);

  const agentId = user?.uid || "";

  const [isAgencyHouse, setIsAgencyHouse] = useState(false);
  const [agencyHouseTaxId, setAgencyHouseTaxId] = useState("");
  const [loadingAgencyHouse, setLoadingAgencyHouse] = useState(true);
  const [savingAgencyHouse, setSavingAgencyHouse] = useState(false);
  // נתוני הרישום (ת"ז + טלפון) - למילוי מראש של פורטלים שעוד אין להם פרטים
  const [agentProfile, setAgentProfile] = useState<{ idNumber?: string; phone?: string } | null>(null);

  // ── קישור התקנת ה-Runner (נוסף כדי לרכז "התקן → צמד" באותו מסך) ──
  const [installerUrl, setInstallerUrl] = useState<string>("");

  useEffect(() => {
    const fetchRunnerConfig = async () => {
      try {
        const snap = await getDoc(doc(db, "portalRunnerConfig", "global"));
        if (!snap.exists()) return;
        const data: any = snap.data() || {};
        setInstallerUrl(String(data.installerUrl || "").trim());
      } catch {
        // ignore
      }
    };
    fetchRunnerConfig();
  }, []);

  // ── 4 סרטוני הדרכה, נגישים ברצף ממסך אחד (התקנה → סיסמאות → הורדה → צפייה בנתונים) ──
  const [helpVideos, setHelpVideos] = useState<HelpVideo[]>([]);
  const [showHelpWizard, setShowHelpWizard] = useState(false);

  useEffect(() => {
    const fetchHelpVideos = async () => {
      try {
        const snap = await getDoc(doc(db, "helpVideos", "global"));
        if (!snap.exists()) return;
        const data: any = snap.data() || {};
        const list: HelpVideo[] = Array.isArray(data.videos) ? data.videos : [];
        setHelpVideos(
          list
            .map((v) => ({
              key: String(v?.key || "").trim(),
              title: String(v?.title || "").trim(),
              url: String(v?.url || "").trim(),
            }))
            .filter((v) => v.key && v.url)
        );
      } catch {
        // ignore
      }
    };
    fetchHelpVideos();
  }, []);

  useEffect(() => {
    const loadAgencyHouse = async () => {
      if (!agentId) { setLoadingAgencyHouse(false); return; }
      setLoadingAgencyHouse(true);
      try {
        const snap = await getDoc(doc(db, "users", agentId));
        const data: any = snap.exists() ? snap.data() : {};
        setIsAgencyHouse(!!data.isAgencyHouse);
        setAgencyHouseTaxId(String(data.agencyHouseTaxId || ""));
        setAgentProfile({ idNumber: String(data.idNumber || ""), phone: String(data.phone || "") });
      } catch {
        // ignore
      } finally {
        setLoadingAgencyHouse(false);
      }
    };
    loadAgencyHouse();
  }, [agentId]);

  const onSaveAgencyHouse = async () => {
    if (!agentId) return;
    setSavingAgencyHouse(true);
    try {
      await setDoc(doc(db, "users", agentId), {
        isAgencyHouse,
        agencyHouseTaxId: isAgencyHouse ? agencyHouseTaxId.trim() : "",
      }, { merge: true });
      alert("✅ נשמר בהצלחה");
    } catch (e: any) {
      alert(`שגיאה בשמירה: ${String(e?.message || e)}`);
    } finally {
      setSavingAgencyHouse(false);
    }
  };

  const portalIds = useMemo(
    () => companies.map((c) => c.portalId).filter(Boolean),
    [companies]
  );

  useEffect(() => {
    if (!pairing?.expiresAtMs) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((pairing.expiresAtMs - Date.now()) / 1000));
      setPairingLeftSec(left);
      if (left <= 0) setPairing(null);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [pairing?.expiresAtMs]);

  const onCreatePairingCode = async () => {
    if (creatingPairing) return;
    setCreatingPairing(true);
    try {
      const fn = httpsCallable(functions, "createRunnerPairingCode");
      const res: any = await fn({});
      const code = s(res?.data?.code);
      const expiresAtMs = Number(res?.data?.expiresAtMs || 0);
      if (!code || !expiresAtMs) throw new Error("Missing code/expiresAtMs");
      setPairing({ code, expiresAtMs });
    } catch (e: any) {
      alert(`שגיאה ביצירת קוד חיבור: ${String(e?.message || e)}`);
    } finally {
      setCreatingPairing(false);
    }
  };

  const onCopyPairing = async () => {
    if (!pairing?.code) return;
    try {
      await navigator.clipboard.writeText(pairing.code);
      alert("✅ הקוד הועתק");
    } catch {
      alert(`העתקה נכשלה. הקוד הוא:\n${pairing.code}`);
    }
  };

  useEffect(() => {
    const run = async () => {
      if (!agentId) { setLoading(false); return; }
      setLoading(true);
      try {
        const qy = query(collection(db, "company"), where("automationEnabled", "==", true));
        const snap = await getDocs(qy);
        const rows: CompanyRow[] = snap.docs
          .map((d) => {
            const data: any = d.data() || {};
            return {
              id: d.id,
              companyName: s(data.companyName),
              portalId: s(data.portalId).toLowerCase(),
              automationEnabled: !!data.automationEnabled,
            };
          })
          .filter((r) => r.portalId && r.companyName);
        rows.sort((a, b) => a.companyName.localeCompare(b.companyName, "he"));
        setCompanies(rows);

        if (rows.length) {
          const getStatus = httpsCallable(functions, "getPortalCredentialsStatus");
          const res: any = await getStatus({ agentId, portalIds: rows.map((r) => r.portalId) });
          setStatusMap(res?.data?.status || {});
        } else {
          setStatusMap({});
        }
      } catch {
        setCompanies([]);
        setStatusMap({});
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [agentId]);

  const refreshStatus = async () => {
    if (!agentId || !portalIds.length) { setStatusMap({}); return; }
    const getStatus = httpsCallable(functions, "getPortalCredentialsStatus");
    const res: any = await getStatus({ agentId, portalIds });
    setStatusMap(res?.data?.status || {});
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
      {/* Modal */}
      {modalCompany && (
        <PortalCredentialsModal
          company={modalCompany}
          statusMap={statusMap}
          agentId={agentId}
          onClose={() => setModalCompany(null)}
          onSaved={refreshStatus}
          prefill={agentProfile ? getPortalPrefill(modalCompany.portalId, agentProfile)?.values : undefined}
        />
      )}

      {showHelpWizard && (
        <HelpVideoWizard videos={helpVideos} onClose={() => setShowHelpWizard(false)} />
      )}

      <h1 className="text-2xl font-bold">🔐 חיבור לפורטלים</h1>
      <p className="mt-2 text-gray-600">
        לחצו על <b>חבר</b> או <b>ערוך</b> ליד כל פורטל כדי להזין את פרטי הגישה.
      </p>

      {helpVideos.length > 0 && (
        <button
          onClick={() => setShowHelpWizard(true)}
          className="mt-3 inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 border border-indigo-200 px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-100"
        >
          📺 מדריך מלא: התקנה → סיסמאות → הורדה → צפייה בנתונים ({helpVideos.length} שלבים)
        </button>
      )}

      <div className="mt-4 text-sm text-gray-700">
        סוכן: <b>{detail?.name || user.email}</b>
      </div>
      <div className="mt-4 border rounded p-3 bg-white">
        <div className="font-semibold mb-2">🏢 בית סוכן</div>
        <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
          <input
            type="checkbox"
            checked={isAgencyHouse}
            onChange={(e) => {
              setIsAgencyHouse(e.target.checked);
              if (!e.target.checked) setAgencyHouseTaxId("");
            }}
            disabled={loadingAgencyHouse}
          />
          הורדת דוחות כבית סוכן (ריבוי סוכנים תחת הכניסה שלי, בכל הפורטלים)
        </label>

        {isAgencyHouse && (
          <input
            className="select-input w-full mt-2"
            value={agencyHouseTaxId}
            onChange={(e) => setAgencyHouseTaxId(e.target.value)}
            autoComplete="off"
            placeholder="מספר ח.פ של החברה"
            inputMode="numeric"
          />
        )}

        <div className="mt-3 flex justify-end">
          <Button
            text={savingAgencyHouse ? "⏳ שומר..." : "שמור"}
            type="primary"
            onClick={onSaveAgencyHouse}
            disabled={savingAgencyHouse || loadingAgencyHouse}
          />
        </div>
      </div>

      {/* Pairing */}
      <div className="mt-4 border rounded p-3 bg-white">
        <div className="font-semibold mb-2">🖥️ חיבור Runner למחשב</div>

        <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg">
          <div className="text-sm font-bold text-blue-900 mb-1">
            שלב 1: הורדה והתקנה
          </div>
          <div className="text-xs text-blue-700 mb-2">
            יש להוריד ולהתקין את הבוט על המחשב הזה (גם אם כבר הותקן בעבר על מחשב אחר).
          </div>
          {installerUrl ? (
            <a
              href={installerUrl}
              className="inline-block bg-blue-600 text-white px-4 py-2 text-sm font-bold rounded-lg hover:bg-blue-700 shadow-md"
            >
              הורד והתקן
            </a>
          ) : (
            <div className="text-xs text-gray-500">קישור ההתקנה עדיין לא הוגדר במערכת.</div>
          )}
        </div>

        <div className="text-sm text-gray-600">
          שלב 2: קוד חיבור חד-פעמי (10 דקות). מדביקים אותו ב-Runner אחרי ההתקנה.
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Button
            text={creatingPairing ? "⏳ יוצר..." : "צור קוד חיבור"}
            type="primary"
            onClick={onCreatePairingCode}
            disabled={creatingPairing}
          />
          {pairing?.code && (
            <Button text="העתק" type="secondary" onClick={onCopyPairing} />
          )}
        </div>
        {pairing?.code && (
          <div className="mt-3 border rounded p-3 bg-gray-50">
            <div className="text-sm text-gray-700">קוד:</div>
            <div className="text-2xl font-bold tracking-widest">{pairing.code}</div>
            <div className="text-xs text-gray-500 mt-1">
              תוקף נשאר: <b>{pairingLeftSec}</b> שניות
            </div>
          </div>
        )}
      </div>

      {/* Company list */}
      {loading ? (
        <div className="mt-6">טוען...</div>
      ) : (
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
                const prefillReady = !has && !!agentProfile && !!getPortalPrefill(c.portalId, agentProfile)?.complete;
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
                        {has ? "✅ שמור" : prefillReady ? "✨ מוכן לאישור" : "❌ לא שמור"}
                      </div>
                      <Button
                        text={has ? "ערוך" : prefillReady ? "בדוק ואשר" : "חבר"}
                        type="secondary"
                        onClick={() => setModalCompany(c)}
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
      )}
    </div>
  );
}
