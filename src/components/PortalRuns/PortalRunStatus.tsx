"use client";

import React, { useMemo } from "react";
import type { Firestore } from "firebase/firestore";
import { usePortalRun } from "@/lib/portalRuns/usePortalRun";

type Props = {
  db: Firestore;
  runId: string;
};

export default function PortalRunStatus({ db, runId }: Props) {
  const { run, loading } = usePortalRun(db, runId);

  const status = String(run?.status || "");
  const step = String(run?.step || "");
  const monthLabel = String(run?.monthLabel || "");

  // ✅ SaaS-mode: otp.mode הוא מקור האמת
  const otpMode = String((run as any)?.otp?.mode || "firestore"); // "manual" | "firestore"
  const otpState = String((run as any)?.otp?.state || ""); // "required" | "manual" | "none" (legacy)
  const otpHint = String((run as any)?.otp?.hint || "");

  const isDone = status === "done";
  const isError = status === "error";

  // ✅ manual לפי mode (לא לפי state)
  const isOtpManual = status === "otp_required" && otpMode === "manual";

  const statusLabel = useMemo(() => {
    if (!status) return "—";
    if (status === "queued") return "ממתין להפעלה…";
    if (status === "running") return "מריץ אוטומציה…";

    if (status === "otp_required") {
      // ✅ Manual mode: אין מודאל, רק הודעת סטטוס
      if (otpMode === "manual") return "ממתין להזנת OTP בפורטל…";
      // ✅ Firestore mode: כן מודאל OTP
      return "ממתין לקוד OTP…";
    }

    if (status === "logged_in") return "מחובר וממשיך…";
    if (status === "file_uploaded") return "הקובץ עלה לשרת…";
    if (status === "done") return "✅ הסתיים בהצלחה";
    if (status === "error") return "❌ שגיאה";
    return status;
  }, [status, otpMode]);

  return (
    <div className="mt-3 p-3 border rounded bg-gray-50 text-right">
      <div className="font-semibold mb-2">סטטוס הורדה אוטומטית</div>

      {loading ? (
        <div className="text-sm text-gray-600">טוען סטטוס…</div>
      ) : (
        <>
          {/* ✅ הודעה מודגשת למצב OTP ידני */}
          {isOtpManual && (
            <div className="mb-3 p-3 rounded border bg-yellow-50 text-yellow-900">
              🔐 ממתין להזנת קוד אימות בפורטל החברה...
              <div className="text-xs mt-1 text-yellow-800">
                חזרי לחלון הפורטל שנפתח והשלימי את האימות. הריצה תמשיך אוטומטית.
              </div>
              {otpHint && <div className="text-xs mt-2 text-yellow-800">{otpHint}</div>}
            </div>
          )}

          <div className="text-sm text-gray-700">
            <div>
              סטטוס: <b>{statusLabel}</b>
            </div>

            {monthLabel && (
              <div className="mt-1">
                חודש: <b>{monthLabel}</b>
              </div>
            )}

            {step && (
              <div className="mt-1">
                שלב: <b>{step}</b>
              </div>
            )}

            {/* אופציונלי: דיבאג עדין אם תרצי לראות מה הגיע */}
            {/* <div className="mt-2 text-xs text-gray-500">
              otp.mode: <b>{otpMode}</b> | otp.state: <b>{otpState}</b>
            </div> */}
          </div>

          {isError && (
            <div className="mt-2 text-sm text-red-700">
              שגיאה: {(run as any)?.error?.message || "לא ידוע"}
            </div>
          )}

          {isDone && (run as any)?.download?.filename && (
            <div className="mt-2 text-sm text-green-700">
              קובץ: <b>{(run as any).download.filename}</b>
            </div>
          )}
        </>
      )}
    </div>
  );
}
