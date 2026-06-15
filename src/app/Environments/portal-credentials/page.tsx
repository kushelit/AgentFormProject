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

// ─── Modal ────────────────────────────────────────────────────────────────────
function PortalModal({
  company,
  statusMap,
  agentId,
  onClose,
  onSaved,
}: {
  company: CompanyRow;
  statusMap: StatusMap;
  agentId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const portalId = company.portalId;

  const isMenora = portalId === "menora";
  const isMor = portalId === "mor";
  const isMeitav = portalId === "meitav";
  const isAnalyst = portalId === "analyst";
  const isAltshuler = portalId === "altshuler";
  const isYalin = portalId === "yalin";
  const isInfinity = portalId === "infinity";
  const isClal = portalId === "clal";
  const isAyalon = portalId === "ayalon";
  const isHachshara = portalId === "hachshara";
  const isHarel = portalId === "harel";
  const isMigdal = portalId === "migdal";
  const isFenix = portalId === "fenix";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [altshulerLoginType, setAltshulerLoginType] = useState<"company" | "agent">("company");


const [loadingCreds, setLoadingCreds] = useState(false);

useEffect(() => {
  const load = async () => {
    const st = statusMap[portalId];
    if (!st?.has) return;

    setLoadingCreds(true);
    try {
      const fn = httpsCallable(functions, "getPortalCredentialsDecrypted");
      const res: any = await fn({ portalId });
      const data = res?.data || {};

      if (data.username) setUsername(data.username);
      if (data.phoneNumber) setPhoneNumber(data.phoneNumber);
      if (data.licenseNumber) setLicenseNumber(data.licenseNumber);
      if (data.loginType) setAltshulerLoginType(data.loginType);
    } catch {
      // ignore
    } finally {
      setLoadingCreds(false);
    }
  };
  load();
}, [portalId]);


  const canSave =
    !!agentId &&
    !!username &&
    (isMor
      ? !!licenseNumber && !!phoneNumber
      : isAltshuler
      ? !!licenseNumber
      : isMenora || isMeitav || isAnalyst || isYalin
      ? !!phoneNumber
      : !!password) &&
    !saving;

  const onSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const saveCreds = httpsCallable(functions, "savePortalCredentials");
      const payload: any = { agentId, portalId, username };

      if (isMor) {
        payload.licenseNumber = licenseNumber;
        payload.phoneNumber = phoneNumber;
      } else if (isAltshuler) {
        payload.licenseNumber = licenseNumber;
        payload.loginType = altshulerLoginType;
      } else if (isMenora || isMeitav || isAnalyst || isYalin) {
        payload.phoneNumber = phoneNumber;
      } else {
        payload.password = password;
      }

      await saveCreds(payload);
      onSaved();
      alert("✅ נשמר בהצלחה");
      onClose();
    } catch (e: any) {
      alert(`שגיאה בשמירה: ${String(e?.message || e)}`);
    } finally {
      setSaving(false);
    }
  };

  // סגירה בלחיצה על הרקע
  const onBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const st = statusMap[portalId];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onBackdropClick}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 text-right relative">
        {/* כותרת */}
        <button
          onClick={onClose}
          className="absolute left-4 top-4 text-gray-400 hover:text-gray-600 text-xl leading-none"
        >
          ✕
        </button>

        <h2 className="text-xl font-bold mb-1">
          🔐 {company.companyName}
        </h2>
        <div className="text-xs text-gray-400 mb-1">({portalId})</div>
        <div className="text-sm mb-4">
          סטטוס: <b>{st?.has ? "✅ שמור" : "❌ לא שמור"}</b>
          {st?.updatedAtMs && (
            <span className="text-gray-400 mr-2 text-xs">
              עודכן: {new Date(st.updatedAtMs).toLocaleString("he-IL")}
            </span>
          )}
        </div>

        {/* הסבר לפי פורטל */}
        <div className="text-xs text-gray-500 mb-4 border rounded p-2 bg-gray-50">
          {isMenora && "מנורה: שם משתמש + טלפון/SAPN (ללא סיסמה) ← OTP בזמן הרצה."}
          {isMor && "מור: תעודת זהות + מספר רישיון + טלפון (ללא סיסמה) ← OTP בזמן הרצה."}
          {isMeitav && "מיטב: תעודת זהות + טלפון (ללא סיסמה) ← OTP בזמן הרצה."}
          {isAnalyst && "אנליסט: תעודת זהות + טלפון (ללא סיסמה) ← OTP בזמן הרצה."}
          {isAltshuler && "אלטשולר: תעודת זהות + מספר ח.פ / רישיון (ללא סיסמה וללא טלפון)."}
          {isYalin && "יאלין: תעודת זהות + טלפון (ללא סיסמה) ← OTP בזמן הרצה."}
          {isInfinity && "אינפיניטי: כניסה באמצעות תעודת זהות + OTP בלבד."}
          {!isMenora && !isMor && !isMeitav && !isAnalyst && !isAltshuler && !isYalin && !isInfinity &&
            "פורטל זה משתמש בשם משתמש + סיסמה."}
        </div>

        {/* שדות */}
        <div className="mb-3">
          <label className="block font-semibold mb-1">
            {isMor || isMeitav || isAnalyst || isAltshuler || isYalin || isInfinity || isClal || isFenix
              ? "תעודת זהות:"
              : "שם משתמש:"}
          </label>
          <input
            className="select-input w-full"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="off"
            placeholder={
              isMor ? "תעודת זהות לפורטל מור"
              : isMeitav ? "תעודת זהות לפורטל מיטב"
              : isMenora ? "שם משתמש לפורטל מנורה"
              : isAnalyst ? "תעודת זהות לפורטל אנליסט"
              : isAltshuler ? "תעודת זהות לפורטל אלטשולר"
              : isClal ? "תעודת זהות לפורטל כלל"
              : isAyalon ? "שם משתמש לפורטל איילון"
              : isInfinity ? "תעודת זהות לפורטל אינפיניטי"
              : isHachshara ? "שם משתמש לפורטל הכשרה"
              : isHarel ? "שם משתמש לפורטל הראל"
              : isYalin ? "תעודת זהות לפורטל יאלין"
              : isMigdal ? "שם משתמש לפורטל מגדל"
              : isFenix ? "תעודת זהות לפורטל הפניקס"
              : "שם משתמש / ת״ז"
            }
          />
        </div>

        {isAltshuler && (
          <div className="mb-3">
            <label className="block font-semibold mb-1">סוג כניסה:</label>
            <select
              className="select-input w-full"
              value={altshulerLoginType}
              onChange={(e) => setAltshulerLoginType(e.target.value as "company" | "agent")}
            >
              <option value="company">ח.פ חברה</option>
              <option value="agent">רישיון סוכן</option>
            </select>
          </div>
        )}

        {(isMor || isAltshuler) && (
          <div className="mb-3">
            <label className="block font-semibold mb-1">
              {isMor
                ? "מספר רישיון:"
                : altshulerLoginType === "agent"
                ? "מספר רישיון סוכן:"
                : "מספר ח.פ:"}
            </label>
            <input
              className="select-input w-full"
              value={licenseNumber}
              onChange={(e) => setLicenseNumber(e.target.value)}
              autoComplete="off"
              placeholder={
                isMor
                  ? "מספר רישיון לפורטל מור"
                  : altshulerLoginType === "agent"
                  ? "מספר רישיון סוכן"
                  : "מספר ח.פ"
              }
            />
          </div>
        )}

        {(isMenora || isMor || isMeitav || isAnalyst || isYalin) && (
          <div className="mb-3">
           <label className="block font-semibold mb-1">טלפון:</label>
            <input
              className="select-input w-full"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
             autoComplete="off"
              placeholder={
                isMor ? "מספר טלפון להזדהות בפורטל מור"
                : isMeitav ? "מספר טלפון להזדהות בפורטל מיטב"
                : isAnalyst ? "מספר טלפון להזדהות בפורטל אנליסט"
                : isYalin ? "מספר טלפון להזדהות בפורטל יאלין"
                : "מספר טלפון להזדהות במנורה"
              }
              inputMode="tel"
            />
          </div>
        )}

        {!isMenora && !isMor && !isMeitav && !isAnalyst && !isAltshuler && !isYalin && (
          <div className="mb-3">
            <label className="block font-semibold mb-1">סיסמה:</label>
            <div className="relative">
              <input
                className="select-input w-full pl-10"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="סיסמה לפורטל"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <Button text="ביטול" type="secondary" onClick={onClose} />
          <Button
            text={saving ? "⏳ שומר..." : "שמור"}
            type="primary"
            onClick={onSave}
            disabled={!canSave}
          />
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
        <PortalModal
          company={modalCompany}
          statusMap={statusMap}
          agentId={agentId}
          onClose={() => setModalCompany(null)}
          onSaved={refreshStatus}
        />
      )}

      <h1 className="text-2xl font-bold">🔐 חיבור לפורטלים</h1>
      <p className="mt-2 text-gray-600">
        לחצו על <b>חבר</b> או <b>ערוך</b> ליד כל פורטל כדי להזין את פרטי הגישה.
      </p>

      <div className="mt-4 text-sm text-gray-700">
        סוכן: <b>{detail?.name || user.email}</b>
      </div>

      {/* Pairing */}
      <div className="mt-4 border rounded p-3 bg-white">
        <div className="font-semibold mb-2">🖥️ חיבור Runner למחשב</div>
        <div className="text-sm text-gray-600">
          קוד חיבור חד-פעמי (10 דקות). מדביקים אותו ב-Runner בפעם הראשונה על מחשב חדש.
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
      {/* טסט זמני - למחוק אחרי */}
<div className="mt-4 border rounded p-3 bg-yellow-50">
  <div className="font-semibold mb-2">🧪 טסט שליחת WhatsApp</div>
  <Button
    text="שלח מנה טסט"
    type="primary"
    onClick={async () => {
      try {
        const fn = httpsCallable(functions, "sendReengagementBatch");
        const result: any = await fn({});
        alert(JSON.stringify(result.data, null, 2));
      } catch (e: any) {
        alert(`שגיאה: ${e.message}`);
      }
    }}
  />
</div>
    </div>
  );
}