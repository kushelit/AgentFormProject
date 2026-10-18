"use client";

/* eslint-disable max-len */

import React, { useEffect, useState } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { db, functions } from "@/lib/firebase/firebase";
import { Button } from "@/components/Button/Button";
import type { PortalPrefillValues } from "@/lib/portalCredentials/prefill";

export type PortalCredentialsStatus = { has: boolean; updatedAtMs?: number };
export type PortalCredentialsStatusMap = Record<string, PortalCredentialsStatus>;

// מודאל הזנת פרטי כניסה לפורטל - משותף לדף portal-credentials ולכרטיסי הטעינה האוטומטית.
// השמירה והטעינה עוברות דרך הפונקציות בשרת, שמאפשרות רק לסוכן המחובר לגשת לפרטים של עצמו.
export default function PortalCredentialsModal({
  company,
  statusMap,
  agentId,
  onClose,
  onSaved,
  prefill,
}: {
  company: { companyName: string; portalId: string };
  statusMap: PortalCredentialsStatusMap;
  agentId: string;
  onClose: () => void;
  onSaved: () => void;
  // ערכים מוצעים מנתוני הרישום - רק לפורטל שעוד אין לו פרטים שמורים
  prefill?: PortalPrefillValues;
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

  const usePrefill = !!prefill && !statusMap[portalId]?.has;

  const [username, setUsername] = useState(usePrefill ? prefill?.username || "" : "");
  const [password, setPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState(usePrefill ? prefill?.phoneNumber || "" : "");
  const [licenseNumber, setLicenseNumber] = useState(usePrefill ? prefill?.licenseNumber || "" : "");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [altshulerLoginType, setAltshulerLoginType] = useState<"company" | "agent">(
    usePrefill && prefill?.loginType ? prefill.loginType : "company"
  );


const [loadingCreds, setLoadingCreds] = useState(false);

const [skipCodesInput, setSkipCodesInput] = useState("");
const [savingSkipCodes, setSavingSkipCodes] = useState(false);
const [accountingNumber, setAccountingNumber] = useState("");
const [hekefTaxId, setHekefTaxId] = useState("");

// פורטלים עם ריבוי-סוכנים בכניסה אחת - כרגע רק מיטב, ניתן להרחיב בעתיד
const isMultiAgentPortal = isMeitav;

useEffect(() => {
  const loadSkipCodes = async () => {
    if (!isMultiAgentPortal || !agentId) return;
    try {
      const snap = await getDoc(doc(db, "portalAgentCodeIncludeList", `${agentId}_${portalId}`));
      const codes: string[] = snap.exists() ? (snap.data()?.includeCodes || []) : [];
      setSkipCodesInput(codes.join(", "));
    } catch {
      // ignore
    }
  };
  loadSkipCodes();
}, [portalId, agentId, isMultiAgentPortal]);


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
      // הסיסמה השמורה מוצגת ככוכביות; לחיצה על העין חושפת אותה
      if (data.password) setPassword(data.password);
      if (data.phoneNumber) setPhoneNumber(data.phoneNumber);
      if (data.licenseNumber) setLicenseNumber(data.licenseNumber);
      if (data.loginType) setAltshulerLoginType(data.loginType);
      if (data.accountingNumber) setAccountingNumber(data.accountingNumber);
      if (data.hekefTaxId) setHekefTaxId(data.hekefTaxId);
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
      } else if (isMenora) {
        payload.phoneNumber = phoneNumber;
        if (accountingNumber.trim()) payload.accountingNumber = accountingNumber.trim();
      } else if (isMeitav || isAnalyst || isYalin) {
        payload.phoneNumber = phoneNumber;
      } else {
        payload.password = password;
        if (isClal && hekefTaxId.trim()) payload.hekefTaxId = hekefTaxId.trim();
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


  const onSaveSkipCodes = async () => {
  if (!agentId) return;
  const codes = skipCodesInput
    .split(/[\n,]+/)
    .map(c => c.trim())
    .filter(Boolean);

  setSavingSkipCodes(true);
  try {
    await setDoc(doc(db, "portalAgentCodeIncludeList", `${agentId}_${portalId}`), {
      agentId,
      portalId,
      includeCodes: codes,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    alert("✅ רשימת הדילוג נשמרה");
  } catch (e: any) {
    alert(`שגיאה בשמירת רשימת הדילוג: ${String(e?.message || e)}`);
  } finally {
    setSavingSkipCodes(false);
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

        {usePrefill && (
          <div className="text-xs text-indigo-800 mb-3 border border-indigo-200 rounded p-2 bg-indigo-50">
            ✨ מילאנו מראש מנתוני הרישום שלך. יש לבדוק, להשלים את מה שחסר וללחוץ <b>שמור</b>.
          </div>
        )}

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
{isMenora && (
          <div className="mb-3">
            <label className="block font-semibold mb-1">
              מספר הנהלת חשבונות (בית סוכן — אופציונלי):
            </label>
            <input
              className="select-input w-full"
              value={accountingNumber}
              onChange={(e) => setAccountingNumber(e.target.value)}
              autoComplete="off"
              placeholder="השאירי ריק אם מזדהים כסוכן רגיל"
              inputMode="numeric"
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
{isClal && (
          <div className="mb-3">
            <label className="block font-semibold mb-1">
              ח.פ / ע.מ לדוח עמלות היקף (אופציונלי):
            </label>
            <input
              className="select-input w-full"
              value={hekefTaxId}
              onChange={(e) => setHekefTaxId(e.target.value.replace(/\D/g, ""))}
              autoComplete="off"
              placeholder="רק אם בדוח ההיקף מופיעות כמה שורות"
              inputMode="numeric"
            />
            <div className="text-xs text-gray-500 mt-1">
              כשבדוח ההיקף של כלל יש כמה שורות, תורד השורה של המספר הזה. ריק — הדוח יורד רק אם יש שורה אחת.
            </div>
          </div>
        )}
{isMultiAgentPortal && (
  <div className="mb-3 border-t pt-3">
   <label className="block font-semibold mb-1">
  מספרי סוכן להורדה (השאר ריק כדי להוריד מכל המספרים):
</label>
    <textarea
      rows={2}
      className="select-input w-full"
      placeholder="הזן מספרי סוכן מופרדים בפסיק או שורה חדשה, לדוגמה: 2-2094, 2-2095"
      value={skipCodesInput}
      onChange={(e) => setSkipCodesInput(e.target.value)}
    />
    <div className="flex justify-end mt-2">
      <Button
        text={savingSkipCodes ? "⏳ שומר..." : "שמור רשימה "}
        type="secondary"
        onClick={onSaveSkipCodes}
        disabled={savingSkipCodes}
      />
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
