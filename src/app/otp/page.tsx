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
  setDoc,
  updateDoc,
  where,
  Timestamp,
} from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";

import ProtectedClient from "@/components/ProtectedClient";
import { auth, db } from "@/lib/firebase/firebase";
import {
  requestPushToken,
  attachForegroundPushListener,
} from "@/lib/firebase/pushNotifications";

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

function getCompanyName(run: PortalImportRun) {
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
  const [user, setUser] = useState<User | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [runs, setRuns] = useState<ActiveRun[]>([]);
  const [otpCode, setOtpCode] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");

  const [isEnablingPush, setIsEnablingPush] = useState(false);
  const [pushInfo, setPushInfo] = useState("");
  const [pushError, setPushError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setUid(u?.uid || null);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    let unsub: null | (() => void) = null;

    attachForegroundPushListener((payload) => {
      console.log("Foreground push payload:", payload);
    }).then((cleanup) => {
      if (typeof cleanup === "function") {
        unsub = cleanup;
      }
    });

    return () => {
      if (unsub) unsub();
    };
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

  async function enablePush() {
    if (!uid) return;

    setIsEnablingPush(true);
    setPushError("");
    setPushInfo("");

    try {
      const res = await requestPushToken();

      if (!res.ok) {
        if (res.reason === "permission_denied") {
          setPushError("לא ניתנה הרשאה להתראות.");
          return;
        }
        if (res.reason === "unsupported") {
          setPushError("המכשיר או הדפדפן לא תומכים בהתראות ווב.");
          return;
        }
        setPushError("לא התקבל token למכשיר הזה.");
        return;
      }

const token = res.token;
if (!token) {
  setPushError("לא התקבל token למכשיר הזה.");
  return;
}

await setDoc(
  doc(db, "users", uid, "pushTokens", token),
  {
    token,
    platform: "web",
    userAgent: navigator.userAgent,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
  },
  { merge: true }
);

      setPushInfo("התראות הופעלו בהצלחה במכשיר הזה.");
    } catch (e: any) {
      setPushError(e?.message || "הפעלת התראות נכשלה.");
    } finally {
      setIsEnablingPush(false);
    }
  }

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
      setInfo("הקוד נשלח. הריצה ממשיכה.");
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
      setError(e?.message || "ביטול נכשל.");
    } finally {
      setIsSaving(false);
    }
  }

  if (!authReady) {
    return <div className="p-6 text-center">טוען...</div>;
  }

  if (!uid) {
    return <div className="p-6 text-center">יש להתחבר</div>;
  }

  //return
  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="mx-auto max-w-sm">
        <div className="mb-5 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Magic OTP</h1>
          <div className="mt-3 text-xs text-gray-500">
            מחובר כ: <b>{user?.email || uid}</b>
          </div>
        </div>

        <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-gray-800">התראות למכשיר הזה</div>
          <p className="mt-1 text-xs text-gray-500">
            לחצי פעם אחת כדי לאפשר התראות כשנדרש קוד OTP.
          </p>

          <button
            type="button"
            onClick={enablePush}
            disabled={isEnablingPush}
            className="mt-3 w-full rounded-2xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            אפשר התראות
          </button>

          {!!pushInfo && (
            <div className="mt-3 rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-700">
              {pushInfo}
            </div>
          )}

          {!!pushError && (
            <div className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {pushError}
            </div>
          )}
        </div>

        {!activeRun ? (
          <div className="bg-white p-6 rounded-xl shadow text-center">
            אין כרגע בקשת קוד
          </div>
        ) : (
          <div className="bg-white p-6 rounded-xl shadow">
            <div className="mb-3 text-sm text-gray-500">חברה</div>
            <div className="text-xl font-bold mb-4">
              {getCompanyName(activeRun.data)}
            </div>

            {!!activeRun.data.monthLabel && (
              <div className="mb-3 rounded-2xl bg-gray-50 p-3">
                <div className="text-xs text-gray-500">חודש</div>
                <div className="font-medium text-gray-900">{activeRun.data.monthLabel}</div>
              </div>
            )}

            {!!activeRun.data.step && (
              <div className="mb-3 rounded-2xl bg-gray-50 p-3">
                <div className="text-xs text-gray-500">שלב</div>
                <div className="font-medium text-gray-900">{activeRun.data.step}</div>
              </div>
            )}

            <div className="mb-3 rounded-2xl bg-gray-50 p-3">
              <div className="text-xs text-gray-500">Run ID</div>
              <div className="font-medium text-gray-900 break-all">{activeRun.id}</div>
            </div>

            {!!activeRun.data.updatedAt && (
              <div className="mb-4 text-xs text-gray-400">
                עודכן לאחרונה: {formatTs(activeRun.data.updatedAt)}
              </div>
            )}

            <div className="text-sm mb-2">קוד אימות</div>

            <input
              value={otpCode}
              onChange={(e) => {
                setOtpCode(e.target.value.replace(/\D/g, ""));
                setError("");
                setInfo("");
              }}
              className="w-full border p-3 text-center text-xl rounded"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="------"
            />

            <button
              onClick={submitOtp}
              disabled={isSaving}
              className="w-full bg-black text-white mt-4 p-3 rounded disabled:opacity-50"
            >
              שלח קוד
            </button>

            <button
              onClick={abortRun}
              disabled={isSaving}
              className="w-full border mt-3 p-3 rounded disabled:opacity-50"
            >
              בטל
            </button>

            {!!info && <div className="text-green-600 mt-3">{info}</div>}
            {!!error && <div className="text-red-600 mt-3">{error}</div>}
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