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

  // form
  const [selectedPortalId, setSelectedPortalId] = useState<string>("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [saving, setSaving] = useState(false);

  const agentId = user?.uid || "";

  const portalIds = useMemo(
    () => companies.map((c) => c.portalId).filter(Boolean),
    [companies]
  );

  const [showPassword, setShowPassword] = useState(false);

  const isMenora = selectedPortalId === "menora";
  const isMor = selectedPortalId === "mor";
  const isMeitav = selectedPortalId === "meitav";
  const isAnalyst = selectedPortalId === "analyst";
  const isAltshuler = selectedPortalId === "altshuler";
  const isYalin = selectedPortalId === "yalin";
  const isInfinity = selectedPortalId === "infinity";



  const [pairing, setPairing] = useState<{ code: string; expiresAtMs: number } | null>(null);
  const [pairingLeftSec, setPairingLeftSec] = useState<number>(0);
  const [creatingPairing, setCreatingPairing] = useState(false);

  const [altshulerLoginType, setAltshulerLoginType] = useState<"company" | "agent">("company");

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

      if (!code || !expiresAtMs) {
        throw new Error("Missing code/expiresAtMs");
      }

      setPairing({ code, expiresAtMs });
    } catch (e: any) {
      // console.error(e);
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
              portalId: s(data.portalId).toLowerCase(),
              automationEnabled: !!data.automationEnabled,
            };
          })
          .filter((r) => r.portalId && r.companyName);

        rows.sort((a, b) => a.companyName.localeCompare(b.companyName, "he"));
        setCompanies(rows);

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
        // console.error(e);
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
    setPhoneNumber("");
    setLicenseNumber("");
  };

const canSave =
  !!agentId &&
  !!selectedPortalId &&
  !!username &&
  (
    isMor
      ? (!!licenseNumber && !!phoneNumber)
      : isAltshuler
        ? !!licenseNumber
        : (isMenora || isMeitav || isAnalyst || isYalin)
          ? !!phoneNumber
          : !!password
  ) &&
  !saving;

  const onSave = async () => {
    if (!canSave) return;

    setSaving(true);
    try {
      const saveCreds = httpsCallable(functions, "savePortalCredentials");

      const payload: any = {
        agentId,
        portalId: selectedPortalId,
        username,
      };

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

      await refreshStatus();

      setUsername("");
      setPassword("");
      setPhoneNumber("");
      setLicenseNumber("");

      alert("✅ נשמר בהצלחה");
    } catch (e: any) {
      // console.error(e);
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
        כאן שומרים פרטי התחברות לכל פורטל (מוצפן). לכל פורטל יש דרישות שונות.
        <br />
        <b>מנורה:</b> שם משתמש + טלפון/SAPN (ללא סיסמה).
        <br />
        <b>מור:</b> מספר רישיון + תעודת זהות + טלפון (ללא סיסמה).
        <br />
        <b>מיטב:</b> תעודת זהות + טלפון (ללא סיסמה).
        <br />
      <b>אנליסט:</b> תעודת זהות + טלפון (ללא סיסמה).
        <br />
        <b>אחרים:</b> שם משתמש + סיסמה.
        <br />
<b>אלטשולר:</b> מספר ח.פ + תעודת זהות (ללא סיסמה וללא טלפון).
      </p>

      <div className="mt-4 text-sm text-gray-700">
        סוכן: <b>{detail?.name || user.email}</b>
      </div>

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
                onChange={(e) => onPickCompany(String(e.target.value))}
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
              <label className="block font-semibold mb-1">
{(isMor || isMeitav || isAnalyst || isAltshuler || isYalin || isInfinity) ? "תעודת זהות:" : "שם משתמש:"}
              </label>
              <input
                className="select-input w-full"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={
                  isMor
                    ? "תעודת זהות לפורטל מור"
                    : isMeitav
                      ? "תעודת זהות לפורטל מיטב"
                      : isMenora
                        ? "קוד משתמש / ת״ז לפורטל מנורה"
                        : isAnalyst
                          ? "תעודת זהות לפורטל אנליסט"
                          : isAltshuler
                            ? "תעודת זהות לפורטל אלטשולר"
                            : "לדוגמה: ת״ז / שם משתמש"
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
{isMor ? "מספר רישיון:" : altshulerLoginType === "agent" ? "מספר רישיון סוכן:" : "מספר ח.פ:"}
    </label>
    <input
      className="select-input w-full"
      value={licenseNumber}
      onChange={(e) => setLicenseNumber(e.target.value)}
    placeholder={
  isMor
    ? "מספר רישיון לפורטל מור"
    : altshulerLoginType === "agent"
      ? "מספר רישיון סוכן לפורטל אלטשולר"
      : "מספר ח.פ לפורטל אלטשולר"
}
    />
  </div>
)}

{(isMenora || isMor || isMeitav || isAnalyst || isYalin) && (
                <div className="mb-3">
                <label className="block font-semibold mb-1">
                  {(isMor || isMeitav || isAnalyst) ? "טלפון:" : "טלפון / SAPN:"}
                </label>
                <input
                  className="select-input w-full"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                 placeholder={
  isMor
    ? "מספר טלפון להזדהות בפורטל מור"
    : isMeitav
      ? "מספר טלפון להזדהות בפורטל מיטב"
      : isAnalyst
        ? "מספר טלפון להזדהות בפורטל אנליסט"
        : isYalin
          ? "מספר טלפון להזדהות בפורטל יאלין"
          : "מספר טלפון להזדהות במנורה"
}
                  inputMode="tel"
                />
                <div className="text-xs text-gray-500 mt-1">
                  {isMor
  ? "במור אין סיסמה. יש מספר רישיון + תעודת זהות + טלפון ואז OTP."
  : isMeitav
    ? "במיטב אין סיסמה. יש תעודת זהות + טלפון ואז OTP."
    : isAnalyst
      ? "באנליסט אין סיסמה. יש תעודת זהות + טלפון ואז OTP."
      : isYalin
        ? "ביאלין אין סיסמה. יש תעודת זהות + טלפון ואז OTP."
        : "במנורה אין סיסמה. יש שם משתמש + טלפון ואז OTP."
      
      }
                </div>
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
        placeholder="סיסמה לפורטל"
      />
    <button
        type="button"
        onClick={() => setShowPassword(v => !v)}
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
            <div className="flex justify-end gap-2">
              <Button
                text={saving ? "⏳ שומר..." : "שמור"}
                type="primary"
                onClick={onSave}
                disabled={!canSave}
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