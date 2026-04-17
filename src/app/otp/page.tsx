"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  Timestamp,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

import ProtectedClient from "@/components/ProtectedClient";
import { auth, db } from "@/lib/firebase/firebase";

type OtpInfo = {
  mode?: string;
  state?: string;
  value?: string;
  providedAt?: Timestamp;
  providedVia?: string;
  abortedAt?: Timestamp;
};

type PortalImportRun = {
  agentId?: string;
  automationClass?: string;
  companyId?: string;
  monthLabel?: string;
  status?: string;
  step?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  otp?: OtpInfo;
  ["otp.mode"]?: string;
};

type ActiveRun = {
  id: string;
  data: PortalImportRun;
};

const COMPANY_BY_ID: Record<string, string> = {
  "4": "כלל",
};

function getCompanyName(run: PortalImportRun) {
  if (run.companyId && COMPANY_BY_ID[run.companyId]) {
    return COMPANY_BY_ID[run.companyId];
  }

  const cls = String(run.automationClass || "").toLowerCase();

  if (cls.includes("clal")) return "כלל";
  if (cls.includes("migdal")) return "מגדל";
  if (cls.includes("fenix") || cls.includes("phoenix")) return "הפניקס";
  if (cls.includes("menora")) return "מנורה";
  if (cls.includes("harel")) return "הראל";
  if (cls.includes("ayalon")) return "איילון";
  if (cls.includes("altshuler")) return "אלטשולר";
  if (cls.includes("analyst")) return "אנליסט";
  if (cls.includes("meitav")) return "מיטב";
  if (cls.includes("mor")) return "מור";

  return "חברה";
}

function getOtpMode(run: PortalImportRun) {
  return String(run?.otp?.mode || run?.["otp.mode"] || "");
}

function isOtpWaiting(run: PortalImportRun) {
  const status = String(run.status || "");
  const otpMode = getOtpMode(run);
  const otpState = String(run.otp?.state || "");

  if (status !== "otp_required" && otpState !== "waiting") return false;

  if (!otpMode) return true;

  return otpMode === "firestore";
}

function formatTs(ts?: Timestamp) {
  if (!ts) return "";
  try {
    return ts.toDate().toLocaleString("he-IL");
  } catch {
    return "";
  }
}

function OtpPageInner() {
  const [uid, setUid] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [runs, setRuns] = useState<ActiveRun[]>([]);
  const [otpCode, setOtpCode] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid || null);
      setAuthReady(true);
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!uid) return;

    const q = query(
      collection(db, "portalImportRuns"),
      where("agentId", "==", uid),
      orderBy("createdAt", "desc"),
      limit(20)
    );

    const unsub = onSnapshot(q, (snap) => {
      const next: ActiveRun[] = snap.docs.map((d) => ({
        id: d.id,
        data: d.data() as PortalImportRun,
      }));
      setRuns(next);
    });

    return () => unsub();
  }, [uid]);

  const activeRun = useMemo(() => {
    return runs.find((r) => isOtpWaiting(r.data)) || null;
  }, [runs]);

  async function submitOtp() {
    if (!activeRun) return;

    const clean = otpCode.replace(/\D/g, "").trim();

    if (!clean) {
      setError("יש להזין קוד.");
      return;
    }

    setIsSaving(true);
    setError("");
    setInfo("");

    try {
      await updateDoc(doc(db, "portalImportRuns", activeRun.id), {
        otp: {
          mode: "firestore",
          state: "provided",
          value: clean,
          providedAt: serverTimestamp(),
          providedVia: "mobile",
        },
        updatedAt: serverTimestamp(),
      });

      setOtpCode("");
      setInfo("הקוד נשלח. הריצה אמורה להמשיך כעת.");
    } catch (e: any) {
      setError(e?.message || "שליחת הקוד נכשלה.");
    } finally {
      setIsSaving(false);
    }
  }

  async function abortRun() {
    if (!activeRun) return;

    setIsSaving(true);
    setError("");
    setInfo("");

    try {
      await updateDoc(doc(db, "portalImportRuns", activeRun.id), {
        otp: {
          mode: "firestore",
          state: "aborted",
          value: "",
          abortedAt: serverTimestamp(),
          providedVia: "mobile",
        },
        updatedAt: serverTimestamp(),
      });

      setOtpCode("");
      setInfo("הריצה בוטלה.");
    } catch (e: any) {
      setError(e?.message || "ביטול הריצה נכשל.");
    } finally {
      setIsSaving(false);
    }
  }

  if (!authReady) {
    return (
      <div dir="rtl" className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-gray-600">טוען...</div>
      </div>
    );
  }

  if (!uid) {
    return (
      <div dir="rtl" className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-3xl border border-gray-200 bg-white p-6 shadow-sm text-center">
          <h1 className="text-2xl font-bold text-gray-900">Magic OTP</h1>
          <p className="mt-3 text-sm text-gray-600">יש להתחבר כדי להשתמש במסך הקודים.</p>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="mx-auto max-w-sm">
        <div className="mb-5 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Magic OTP</h1>
          <p className="mt-1 text-sm text-gray-500">מסך הזנת קוד לריצה אוטומטית</p>
        </div>

        {!activeRun ? (
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="text-center">
              <div className="text-lg font-semibold text-gray-900">אין כרגע בקשת קוד פעילה</div>
              <p className="mt-2 text-sm text-gray-500">
                כשהמערכת תגיע לשלב האימות, הבקשה תופיע כאן.
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <div className="text-sm text-gray-500">חברה</div>
              <div className="text-2xl font-bold text-gray-900">
                {getCompanyName(activeRun.data)}
              </div>
            </div>

            {!!activeRun.data.monthLabel && (
              <div className="mb-3 rounded-2xl bg-gray-50 p-3">
                <div className="text-xs text-gray-500">חודש</div>
                <div className="font-medium text-gray-900">{activeRun.data.monthLabel}</div>
              </div>
            )}

            <div className="mb-3 rounded-2xl bg-gray-50 p-3">
              <div className="text-xs text-gray-500">סטטוס</div>
              <div className="font-medium text-gray-900">ממתין לקוד</div>
            </div>

            {!!activeRun.data.step && (
              <div className="mb-4 rounded-2xl bg-gray-50 p-3">
                <div className="text-xs text-gray-500">שלב</div>
                <div className="font-medium text-gray-900">{activeRun.data.step}</div>
              </div>
            )}

            <label className="mb-2 block text-sm font-medium text-gray-700">
              קוד אימות
            </label>

            <input
              value={otpCode}
              onChange={(e) => {
                setOtpCode(e.target.value.replace(/\D/g, ""));
                setError("");
                setInfo("");
              }}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="הזיני קוד"
              className="w-full rounded-2xl border border-gray-300 px-4 py-4 text-center text-2xl tracking-[0.35em] outline-none focus:border-gray-500"
            />

            <button
              type="button"
              onClick={submitOtp}
              disabled={isSaving}
              className="mt-4 w-full rounded-2xl bg-gray-900 px-4 py-4 text-base font-semibold text-white disabled:opacity-50"
            >
              שלח קוד
            </button>

            <button
              type="button"
              onClick={abortRun}
              disabled={isSaving}
              className="mt-3 w-full rounded-2xl border border-gray-300 bg-white px-4 py-4 text-base font-semibold text-gray-700 disabled:opacity-50"
            >
              בטל ריצה
            </button>

            {!!activeRun.data.updatedAt && (
              <div className="mt-4 text-center text-xs text-gray-400">
                עודכן לאחרונה: {formatTs(activeRun.data.updatedAt)}
              </div>
            )}

            {!!info && (
              <div className="mt-4 rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-700">
                {info}
              </div>
            )}

            {!!error && (
              <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function OtpPage() {
  return (
    <ProtectedClient>
      <OtpPageInner />
    </ProtectedClient>
  );
}