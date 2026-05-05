"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  companyName?: string;
  monthLabel?: string;
  status?: string;
  step?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  otp?: OtpInfo;
  ["otp.mode"]?: string;

  batchId?: string;
  batchOrder?: number;
  batchTotal?: number;
};

type ActiveRun = {
  id: string;
  data: PortalImportRun;
};

function getCompanyName(run: PortalImportRun) {
  if (String(run.companyName || "").trim()) {
    return String(run.companyName).trim();
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
  const status = String(run.status || "").trim();
  const otpMode = getOtpMode(run) || "firestore";
  const otpState = String(run.otp?.state || "").trim();

  if (status !== "otp_required") return false;
  if (otpMode !== "firestore") return false;

  return !["provided", "aborted", "received"].includes(otpState);
}

function isFinalStatus(status?: string) {
  const s = String(status || "");
  return ["success", "done", "error", "failed", "skipped"].includes(s);
}

function isSuccessStatus(status?: string) {
  const s = String(status || "");
  return s === "success" || s === "done";
}

function isErrorStatus(status?: string) {
  const s = String(status || "");
  return s === "error" || s === "failed";
}

function isInProgressStatus(status?: string) {
  const s = String(status || "");
  return ["running", "otp_required", "logged_in", "file_uploaded"].includes(s);
}

function formatTs(ts?: Timestamp) {
  if (!ts) return "";
  try {
    return ts.toDate().toLocaleString("he-IL");
  } catch {
    return "";
  }
}

function OtpBoxes({
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const digits = value.padEnd(6, " ").slice(0, 6).split("");

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        dir="ltr"
        style={{ direction: "ltr", textAlign: "left" }}
        value={value}
        disabled={disabled}
        inputMode="numeric"
        autoComplete="one-time-code"
        enterKeyHint="done"
        onChange={(e) => {
          const next = e.target.value.replace(/\D/g, "").slice(0, 6);
          onChange(next);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.length >= 4) {
            onSubmit();
          }
        }}
        className="absolute inset-0 h-full w-full opacity-0"
      />

      <div
        dir="ltr"
        className="grid grid-cols-6 gap-2"
        onClick={() => inputRef.current?.focus()}
      >
        {digits.map((digit, idx) => {
          const isActive = idx === Math.min(value.length, 5);
          return (
            <div
              key={idx}
              className={`flex h-14 items-center justify-center rounded-2xl border text-2xl font-bold shadow-sm transition ${
                isActive
                  ? "border-gray-900 bg-white ring-2 ring-gray-200"
                  : "border-gray-200 bg-white"
              } ${disabled ? "opacity-60" : ""}`}
            >
              {digit === " " ? "" : digit}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BatchInfoCard({
  total,
  done,
  error,
  currentCompanyName,
  nextCompanyName,
}: {
  total: number;
  done: number;
  error: number;
  remaining: number;
  currentCompanyName?: string;
  currentStep?: string;
  nextCompanyName?: string;
}) {
  return (
    <div className="mb-3 rounded-2xl border border-blue-100 bg-white px-4 py-3 text-center shadow-sm">
      <div className="text-xs font-bold text-gray-500">
        ריצת Batch
      </div>

      <div className="mt-1 text-sm text-gray-800">
        <span className="font-black">{done}/{total}</span> הושלמו
        {error > 0 && (
          <span className="text-red-600"> · {error} שגיאות</span>
        )}
      </div>

      {currentCompanyName && (
        <div className="mt-2 text-base font-black text-blue-800">
          עכשיו: {currentCompanyName}
        </div>
      )}

      {nextCompanyName && (
        <div className="mt-1 text-xs text-gray-500">
          הבא בתור: <span className="font-bold">{nextCompanyName}</span>
        </div>
      )}
    </div>
  );
}

function BatchQueueList({
  runs,
  currentRunId,
}: {
  runs: ActiveRun[];
  currentRunId?: string;
}) {
  if (!runs.length) return null;

  function getItemState(run: ActiveRun) {
    const status = String(run.data.status || "");

    if (run.id === currentRunId) return "current";
    if (isSuccessStatus(status)) return "done";
    if (isErrorStatus(status)) return "error";
    if (isFinalStatus(status)) return "done";
    if (status === "queued") return "queued";
    if (isInProgressStatus(status)) return "current";
    return "queued";
  }

  function getStateLabel(state: string) {
    if (state === "current") return "כעת";
    if (state === "done") return "הושלם";
    if (state === "error") return "שגיאה";
    return "ממתין";
  }

  function getStateClasses(state: string) {
    if (state === "current") {
      return "border-blue-200 bg-blue-50 text-blue-900";
    }
    if (state === "done") {
      return "border-green-200 bg-green-50 text-green-900";
    }
    if (state === "error") {
      return "border-red-200 bg-red-50 text-red-900";
    }
    return "border-gray-200 bg-gray-50 text-gray-700";
  }

  function getBadgeClasses(state: string) {
    if (state === "current") {
      return "bg-blue-100 text-blue-700";
    }
    if (state === "done") {
      return "bg-green-100 text-green-700";
    }
    if (state === "error") {
      return "bg-red-100 text-red-700";
    }
    return "bg-gray-200 text-gray-700";
  }

  return (
    <div className="mb-4 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 text-sm font-bold text-gray-900">רשימת החברות בתור</div>

      <div className="space-y-2">
        {runs.map((run, index) => {
          const state = getItemState(run);
          const companyName = getCompanyName(run.data);
          const step = String(run.data.step || "").trim();

          return (
            <div
              key={run.id}
              className={`rounded-2xl border p-3 ${getStateClasses(state)}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-gray-500">#{index + 1}</div>
                  <div className="text-base font-bold">{companyName}</div>
                  {!!run.data.monthLabel && (
                    <div className="text-xs text-gray-500">{run.data.monthLabel}</div>
                  )}
                  {!!step && state === "current" && (
                    <div className="mt-1 text-xs font-medium text-blue-700">
                      {step}
                    </div>
                  )}
                </div>

                <div
                  className={`rounded-full px-3 py-1 text-xs font-bold ${getBadgeClasses(state)}`}
                >
                  {getStateLabel(state)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


function OtpPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const runIdFromUrl = searchParams.get("runId");

  const [user, setUser] = useState<User | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [runs, setRuns] = useState<ActiveRun[]>([]);
  const [batchRuns, setBatchRuns] = useState<ActiveRun[]>([]);
  const [hasPushToken, setHasPushToken] = useState(false);
  const [dismissedRunId, setDismissedRunId] = useState<string | null>(null);

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
      // console.log("Foreground push payload:", payload);
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

    const unsub = onSnapshot(
      collection(db, "users", uid, "pushTokens"),
      (snap) => {
        setHasPushToken(!snap.empty);
      }
    );

    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!uid) return;

    const q = query(
      collection(db, "portalImportRuns"),
      where("agentId", "==", uid),
      where("status", "==", "otp_required"),
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
    const filteredRuns = runs.filter((r) => r.id !== dismissedRunId);

    if (runIdFromUrl) {
     const byUrl = filteredRuns.find((r) => r.id === runIdFromUrl);
  return byUrl && isOtpWaiting(byUrl.data) ? byUrl : null;
    }

    return filteredRuns.find((r) => isOtpWaiting(r.data)) || null;
  }, [runs, runIdFromUrl, dismissedRunId]);

  useEffect(() => {
    const batchId = String(activeRun?.data?.batchId || "").trim();
    if (!batchId) {
      setBatchRuns([]);
      return;
    }

    const q = query(
      collection(db, "portalImportRuns"),
      where("batchId", "==", batchId),
      orderBy("batchOrder", "asc")
    );

    const unsub = onSnapshot(q, (snap) => {
      const next: ActiveRun[] = snap.docs.map((d) => ({
        id: d.id,
        data: d.data() as PortalImportRun,
      }));
      setBatchRuns(next);
    });

    return () => unsub();
  }, [activeRun?.data?.batchId]);

  const batchInfo = useMemo(() => {
    if (!activeRun) return null;
    const batchId = String(activeRun.data.batchId || "").trim();
    if (!batchId || !batchRuns.length) return null;

    const total = batchRuns.length;
    const done = batchRuns.filter((r) => isSuccessStatus(r.data.status)).length;
    const errorCount = batchRuns.filter((r) => isErrorStatus(r.data.status)).length;
    const currentIndex = batchRuns.findIndex((r) => r.id === activeRun.id);

    let nextRun: ActiveRun | null = null;
    if (currentIndex >= 0) {
      nextRun =
        batchRuns
          .slice(currentIndex + 1)
          .find((r) => !isFinalStatus(r.data.status)) || null;
    }

    const remaining = Math.max(total - done - errorCount, 0);

    return {
  total,
  done,
  error: errorCount,
  remaining,
  currentRunId: activeRun.id,
  currentCompanyName: getCompanyName(activeRun.data),
  currentStep: String(activeRun.data.step || "").trim(),
  nextCompanyName: nextRun ? getCompanyName(nextRun.data) : "",
};
  }, [activeRun, batchRuns]);

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
      setHasPushToken(true);
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
      setInfo("הקוד נשלח בהצלחה.");
      setDismissedRunId(activeRun.id);
      router.replace("/otp");
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
      setDismissedRunId(activeRun.id);
      router.replace("/otp");
    } catch (e: any) {
      setError(e?.message || "ביטול נכשל.");
    } finally {
      setIsSaving(false);
    }
  }

  if (!authReady) {
    return (
      <div dir="rtl" className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-gray-600">טוען...</div>
      </div>
    );
  }

  if (!uid) {
    return (
      <div dir="rtl" className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-sm border border-gray-200">
          <h1 className="text-2xl font-bold text-gray-900">Magic OTP</h1>
          <p className="mt-3 text-sm text-gray-600">יש להתחבר כדי להשתמש במסך הקודים.</p>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="text-xs text-gray-400 text-center mb-2">
  uid: {uid} | runs: {runs.length}
</div>
      <div className="mx-auto max-w-sm">
       <div className="mb-4 text-center">
  <div className="text-2xl font-black text-gray-900">קוד אימות</div>
  <div className="mt-1 text-sm text-gray-500">
    נדרש רק כשהפורטל מבקש קוד
  </div>
</div>
        {!hasPushToken && (
          <div className="mb-4 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-gray-800">התראות למכשיר הזה</div>
            <p className="mt-1 text-xs text-gray-500">
              לחצי פעם אחת כדי לקבל התראה כשנדרש קוד OTP.
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
        )}

        {batchInfo && (
          <BatchInfoCard
            total={batchInfo.total}
            done={batchInfo.done}
            error={batchInfo.error}
            remaining={batchInfo.remaining}
            currentCompanyName={batchInfo.currentCompanyName}
            currentStep={batchInfo.currentStep}
            nextCompanyName={batchInfo.nextCompanyName}
          />
        )}
        {!activeRun ? (
          <div className="rounded-3xl border border-gray-200 bg-white p-6 text-center shadow-sm">
            <div className="text-lg font-semibold text-gray-900">אין כרגע בקשת קוד</div>
            <p className="mt-2 text-sm text-gray-500">כשתגיע בקשה חדשה, היא תופיע כאן.</p>
            {!!info && (
              <div className="mt-4 rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-700">
                {info}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <div className="text-xs font-medium text-gray-500">חברה</div>
              <div className="mt-1 text-2xl font-bold text-gray-900">
                {getCompanyName(activeRun.data)}
              </div>
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

            {!!runIdFromUrl && (
              <div className="mb-3 rounded-2xl bg-blue-50 p-3 text-sm text-blue-700">
                נפתחה הבקשה המדויקת מההתראה.
              </div>
            )}

            {!!activeRun.data.updatedAt && (
              <div className="mb-4 text-xs text-gray-400">
                עודכן לאחרונה: {formatTs(activeRun.data.updatedAt)}
              </div>
            )}

            <div className="mb-2 text-sm font-medium text-gray-700">קוד אימות</div>

            <OtpBoxes
              value={otpCode}
              onChange={(next) => {
                setOtpCode(next);
                setError("");
                setInfo("");
              }}
              onSubmit={submitOtp}
              disabled={isSaving}
            />

            <button
              onClick={submitOtp}
              disabled={isSaving || otpCode.length === 0}
              className="mt-4 w-full rounded-2xl bg-gray-900 px-4 py-4 text-base font-semibold text-white disabled:opacity-50"
            >
              שלח קוד
            </button>

            <button
              onClick={abortRun}
              disabled={isSaving}
              className="mt-3 w-full rounded-2xl border border-gray-300 bg-white px-4 py-4 text-base font-semibold text-gray-700 disabled:opacity-50"
            >
              בטל
            </button>

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