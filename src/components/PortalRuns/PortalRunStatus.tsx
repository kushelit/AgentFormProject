"use client";

import React, { useMemo } from "react";
import type { Firestore } from "firebase/firestore";
import { usePortalRun } from "@/lib/portalRuns/usePortalRun";

type Props = {
  db: Firestore;
  runId: string;
  // ✅ הוספת Callback כדי להודיע לדף האב שהריצה הסתיימה
  onFinished?: (status: string) => void;
};

export default function PortalRunStatus({ db, runId, onFinished }: Props) {
  // ✅ שליפת הנתונים מה-Hook המעודכן (כולל progress)
  const { run, loading, progress } = usePortalRun(db, runId, onFinished);

  const status = String(run?.status || "");
  const step = String(run?.step || "");
  const monthLabel = String(run?.monthLabel || "");

  const otpMode = String((run as any)?.otp?.mode || "firestore");
  const otpHint = String((run as any)?.otp?.hint || "");

  const isDone = status === "done" || status === "skipped";
  const isError = status === "error" || status === "failed";
  const isOtpManual = status === "otp_required" && otpMode === "manual";
  const isSuccess = status === "success" || status === "done";

  const statusLabel = useMemo(() => {
    if (!status) return "—";
    if (status === "queued") return "ממתין להפעלה…";
    if (status === "running") return "מריץ אוטומציה…";
    if (status === "failed") return "❌ הריצה בוטלה על ידי המשתמש"; 
    if (status === "otp_required") {
      if (otpMode === "manual") return "ממתין להזנת OTP בפורטל…";
      return "ממתין לקוד OTP…";
    }
    if (status === "logged_in") return "מחובר וממשיך…";
    if (status === "file_uploaded") return "הקובץ עלה לשרת…";
if (status === "done") return "✅ משיכת קובץ הושלמה";
    if (status === "skipped") return "⏭️ דולג (כבר קיים במערכת)";
    if (status === "error") return "❌ שגיאה";
    if (status === "success") return "✅ נתונים נטענו בהצלחה";
    return status;
  }, [status, otpMode]);

  return (
    <div className="mt-3 p-4 border rounded-xl bg-gray-50 text-right shadow-inner">
      <div className="flex justify-between items-center mb-3">
        <div className="font-bold text-gray-700 text-sm">סטטוס משיכה אוטומטית</div>
        <div className="text-[10px] font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
          {progress}%
        </div>
      </div>

      {/* 📊 Progress Bar ויזואלי */}
      <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden mb-4 shadow-sm">
        <div 
          className={`h-full transition-all duration-1000 ease-out ${
isError ? 'bg-red-500' : isSuccess ? 'bg-green-500' : 'bg-blue-600'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {loading ? (
        <div className="text-sm text-gray-600 animate-pulse">טוען סטטוס…</div>
      ) : (
        <>
          {isOtpManual && (
            <div className="mb-3 p-3 rounded-lg border border-yellow-200 bg-yellow-50 text-yellow-900 animate-bounce">
              <div className="font-bold text-sm">🔐 נדרשת פעולה בפורטל</div>
              <div className="text-xs mt-1">
                חזרי לחלון הפורטל שנפתח והשלימי את האימות. הריצה תמשיך אוטומטית.
              </div>
              {otpHint && <div className="text-xs mt-2 font-mono bg-white/50 p-1 rounded">{otpHint}</div>}
            </div>
          )}

          <div className="text-sm text-gray-700 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-gray-400">סטטוס:</span>
              <span className={`font-bold ${isError ? 'text-red-600' : 'text-blue-900'}`}>{statusLabel}</span>
            </div>

            {monthLabel && (
              <div className="flex items-center gap-2">
                <span className="text-gray-400">חודש:</span>
                <span className="font-bold text-gray-800">{monthLabel}</span>
              </div>
            )}

            {step && !isDone && !isError && (
              <div className="flex items-center gap-2">
                <span className="text-gray-400">שלב:</span>
                <span className="font-medium text-gray-600 italic">{step}</span>
              </div>
            )}
          </div>

          {isError && (
            <div className="mt-3 p-2 bg-red-50 border border-red-100 rounded-lg text-xs text-red-700">
              <b>שגיאה:</b> {(run as any)?.error?.message || "קרתה תקלה במהלך המשיכה"}
            </div>
          )}

          {isDone && (run as any)?.download?.filename && (
            <div className="mt-3 p-2 bg-green-50 border border-green-100 rounded-lg text-xs text-green-700">
              ✅ הקובץ התקבל: <b>{(run as any).download.filename}</b>
            </div>
          )}
        </>
      )}
    </div>
  );
}