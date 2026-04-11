"use client";

import React, { useMemo } from "react";
import type { Firestore } from "firebase/firestore";
import { usePortalRun } from "@/lib/portalRuns/usePortalRun";

type Props = {
  db: Firestore;
  runId: string;
  runKind?: "portal" | "self_update" | "";
  onFinished?: (status: string) => void;
};

type QueueJobLike = {
  status?: string;
  templateId?: string;
  templateName?: string;
  result?: {
    type?: string;
    reason?: string;
    message?: string;
  };
  error?: {
    message?: string;
  };
};

function safeStr(v: any) {
  return String(v ?? "").trim();
}

function prettifyTemplateName(templateId: string) {
  const map: Record<string, string> = {
    ayalon_insurance: "איילון",
    analyst_insurance: "אנליסט",
    altshuler_insurance: "אלטשולר",
    meitav_insurance: "מיטב",
    mor_insurance: "מור",
    clal_briut: "כלל בריאות",
    clal_gemel: "כלל גמל",
    clal_pensia: "כלל פנסיה",
    clal_life: "כלל חיים",
    fenix_insurance: "הפניקס נפרעים",
    fenix_gemel: "הפניקס גמל והשתלמות",
    menura_new_nifraim: "מנורה נפרעים",
    menura_new_zviraim:"מנורה צבירה",
    migdal_insurance:  "מגדל משולמים לסוכן",
    migdal_gemel: "מגדל גמל והשתלמות",
    migdal_life: "עמלה מצבירה/דמי ניהול לביטוח חיים לבעלים",
  };

  return map[templateId] || templateId || "דוח";
}

function isEmptyJob(job: QueueJobLike) {
  const status = safeStr(job?.status);
  const resultType = safeStr(job?.result?.type);
  const resultReason = safeStr(job?.result?.reason);

  return (
    status === "skipped" &&
    (
      resultType === "empty_report" ||
      resultReason === "parse_file_empty" ||
      resultReason === "standardize_empty" ||
      resultReason === "filter_month_empty"
    )
  );
}

export default function PortalRunStatus({
  db,
  runId,
  runKind = "portal",
  onFinished,
}: Props) {
  const { run, loading, progress } = usePortalRun(db, runId, onFinished);

  const status = String(run?.status || "");
  const step = String(run?.step || "");
  const monthLabel = String((run as any)?.monthLabel || "");

  const otpMode = String((run as any)?.otp?.mode || "firestore");
  const otpHint = String((run as any)?.otp?.hint || "");
  const isSelfUpdate = runKind === "self_update";

  const result = (run as any)?.result || null;
  const resultMessage = safeStr(result?.message);
  const resultType = safeStr(result?.type);
  const resultReason = safeStr(result?.reason);

  const queueJobsObj = ((run as any)?.queue?.jobs || {}) as Record<string, QueueJobLike>;
  const queueJobs = Object.entries(queueJobsObj).map(([jobId, job]) => ({
    jobId,
    ...job,
  }));

  const hasJobs = queueJobs.length > 0;

  const jobsSummary = useMemo(() => {
    let successCount = 0;
    let emptyCount = 0;
    let skippedOtherCount = 0;
    let errorCount = 0;
    let processingCount = 0;
    let queuedCount = 0;
    let otpCount = 0;

    for (const job of queueJobs) {
      const s = safeStr(job.status);

      if (s === "success" || s === "done") {
        successCount += 1;
      } else if (isEmptyJob(job)) {
        emptyCount += 1;
      } else if (s === "skipped") {
        skippedOtherCount += 1;
      } else if (s === "error" || s === "failed") {
        errorCount += 1;
      } else if (s === "otp_required") {
        otpCount += 1;
      } else if (s === "processing" || s === "running" || s === "logged_in" || s === "file_uploaded") {
        processingCount += 1;
      } else if (s === "queued") {
        queuedCount += 1;
      }
    }

    return {
      successCount,
      emptyCount,
      skippedOtherCount,
      errorCount,
      processingCount,
      queuedCount,
      otpCount,
      total: queueJobs.length,
    };
  }, [queueJobs]);

  const isRunLevelEmptyResult =
    status === "skipped" &&
    (
      resultType === "empty_report" ||
      resultReason === "parse_file_empty" ||
      resultReason === "standardize_empty" ||
      resultReason === "filter_month_empty"
    );

  const derivedStatusMode = useMemo(() => {
    if (isSelfUpdate) return "self_update";
    if (status === "error" || status === "failed") return "error";

    if (hasJobs) {
      if (jobsSummary.errorCount > 0) return "error";
      if (jobsSummary.processingCount > 0 || jobsSummary.otpCount > 0 || jobsSummary.queuedCount > 0) {
        return "running";
      }
      if (jobsSummary.successCount > 0 && jobsSummary.emptyCount > 0) {
        return "partial_success";
      }
      if (jobsSummary.successCount > 0 && jobsSummary.emptyCount === 0 && jobsSummary.skippedOtherCount === 0) {
        return "success";
      }
      if (
        jobsSummary.emptyCount > 0 &&
        jobsSummary.successCount === 0 &&
        jobsSummary.skippedOtherCount === 0
      ) {
        return "empty";
      }
      if (jobsSummary.successCount > 0 || jobsSummary.emptyCount > 0 || jobsSummary.skippedOtherCount > 0) {
        return "success";
      }
    }

    if (isRunLevelEmptyResult) return "empty";
    if (status === "success" || status === "done") return "success";
    if (status === "queued" || status === "running" || status === "logged_in" || status === "file_uploaded") {
      return "running";
    }
    if (status === "otp_required") return "otp";
    if (status === "skipped") return "skipped";

    return "default";
  }, [isSelfUpdate, status, hasJobs, jobsSummary, isRunLevelEmptyResult]);

  const isDone =
    derivedStatusMode === "success" ||
    derivedStatusMode === "partial_success" ||
    derivedStatusMode === "empty" ||
    derivedStatusMode === "skipped" ||
    status === "done";

  const isError = derivedStatusMode === "error";
  const isOtpManual = !isSelfUpdate && status === "otp_required" && otpMode === "manual";
  const isSuccessLike =
    derivedStatusMode === "success" ||
    derivedStatusMode === "partial_success" ||
    derivedStatusMode === "empty" ||
    status === "success" ||
    status === "done";

  const statusLabel = useMemo(() => {
    if (!status) return "—";

    if (isSelfUpdate) {
      if (status === "queued") return "ממתין שהבוט יתחיל את העדכון…";
      if (status === "running" && step === "downloading_update") return "מוריד את קובץ העדכון…";
      if (status === "running") return "מבצע עדכון גרסה…";
      if (status === "done" && step === "update_downloaded") return "✅ קובץ העדכון ירד וההתקנה הופעלה";
      if (status === "done") return "✅ עדכון הגרסה הושלם";
      if (status === "failed") return "❌ העדכון בוטל";
      if (status === "error") return "❌ עדכון הגרסה נכשל";
      return status;
    }

    if (hasJobs) {
      if (derivedStatusMode === "error") return "❌ הריצה הסתיימה עם שגיאה";
      if (derivedStatusMode === "running") return "מריץ אוטומציה…";
      if (derivedStatusMode === "partial_success") return "✅ הריצה הושלמה חלקית";
      if (derivedStatusMode === "empty") return "ℹ️ הריצה הסתיימה ללא נתונים";
      if (derivedStatusMode === "success") return "✅ נתונים נטענו בהצלחה";
    }

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
    if (status === "skipped") {
      if (isRunLevelEmptyResult) return "ℹ️ הדוח נקלט אך לא נמצאו נתונים";
      return "⏭️ דולג";
    }
    if (status === "error") return "❌ שגיאה";
    if (status === "success") return "✅ נתונים נטענו בהצלחה";

    return status;
  }, [
    status,
    otpMode,
    isSelfUpdate,
    step,
    hasJobs,
    derivedStatusMode,
    isRunLevelEmptyResult,
  ]);

  const summaryLine = useMemo(() => {
    if (!hasJobs) return "";

    const parts: string[] = [];

    if (jobsSummary.successCount > 0) {
      parts.push(
        jobsSummary.successCount === 1
          ? "דוח 1 נטען"
          : `${jobsSummary.successCount} דוחות נטענו`
      );
    }

    if (jobsSummary.emptyCount > 0) {
      parts.push(
        jobsSummary.emptyCount === 1
          ? "דוח 1 ללא נתונים"
          : `${jobsSummary.emptyCount} דוחות ללא נתונים`
      );
    }

    if (jobsSummary.errorCount > 0) {
      parts.push(
        jobsSummary.errorCount === 1
          ? "דוח 1 עם שגיאה"
          : `${jobsSummary.errorCount} דוחות עם שגיאה`
      );
    }

    if (jobsSummary.processingCount > 0) {
      parts.push(
        jobsSummary.processingCount === 1
          ? "דוח 1 בתהליך"
          : `${jobsSummary.processingCount} דוחות בתהליך`
      );
    }

    if (jobsSummary.queuedCount > 0) {
      parts.push(
        jobsSummary.queuedCount === 1
          ? "דוח 1 ממתין"
          : `${jobsSummary.queuedCount} דוחות ממתינים`
      );
    }

    return parts.join(" • ");
  }, [hasJobs, jobsSummary]);

  return (
    <div className="mt-3 p-4 border rounded-xl bg-gray-50 text-right shadow-inner">
      <div className="flex justify-between items-center mb-3">
        <div className="font-bold text-gray-700 text-sm">
          {isSelfUpdate ? "סטטוס עדכון גרסה" : "סטטוס משיכה אוטומטית"}
        </div>
        <div className="text-[10px] font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
          {progress}%
        </div>
      </div>

      <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden mb-4 shadow-sm">
        <div
          className={`h-full transition-all duration-1000 ease-out ${
            isError ? "bg-red-500" : isSuccessLike ? "bg-green-500" : "bg-blue-600"
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
              {otpHint && (
                <div className="text-xs mt-2 font-mono bg-white/50 p-1 rounded">
                  {otpHint}
                </div>
              )}
            </div>
          )}

          <div className="text-sm text-gray-700 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-gray-400">סטטוס:</span>
              <span
                className={`font-bold ${
                  isError
                    ? "text-red-600"
                    : derivedStatusMode === "empty"
                    ? "text-amber-700"
                    : "text-blue-900"
                }`}
              >
                {statusLabel}
              </span>
            </div>

            {!isSelfUpdate && monthLabel && (
              <div className="flex items-center gap-2">
                <span className="text-gray-400">חודש:</span>
                <span className="font-bold text-gray-800">{monthLabel}</span>
              </div>
            )}

            {summaryLine && (
              <div className="flex items-center gap-2">
                <span className="text-gray-400">סיכום:</span>
                <span className="font-medium text-gray-700">{summaryLine}</span>
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

          {!isError && isRunLevelEmptyResult && resultMessage && (
            <div className="mt-3 p-2 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-800">
              <b>אין נתונים:</b> {resultMessage}
            </div>
          )}

          {hasJobs && (
            <div className="mt-3 space-y-2">
              <div className="text-xs font-bold text-gray-600">פירוט דוחות בריצה</div>

              <div className="space-y-2">
                {queueJobs.map((job) => {
                  const jobStatus = safeStr(job.status);
const jobName =
  safeStr(job.templateName) ||
  prettifyTemplateName(safeStr(job.templateId));                  const jobMessage = safeStr(job.result?.message);
                  const jobError = safeStr(job.error?.message);

                  const empty = isEmptyJob(job);

                  let jobLabel = jobStatus;
                  let jobClass = "bg-gray-50 border-gray-200 text-gray-700";

                  if (jobStatus === "success" || jobStatus === "done") {
                    jobLabel = "נטען בהצלחה";
                    jobClass = "bg-green-50 border-green-100 text-green-700";
                  } else if (empty) {
                    jobLabel = "אין נתונים";
                    jobClass = "bg-amber-50 border-amber-100 text-amber-800";
                  } else if (jobStatus === "skipped") {
                    jobLabel = "דולג";
                    jobClass = "bg-gray-100 border-gray-200 text-gray-700";
                  } else if (jobStatus === "error" || jobStatus === "failed") {
                    jobLabel = "שגיאה";
                    jobClass = "bg-red-50 border-red-100 text-red-700";
                  } else if (jobStatus === "queued") {
                    jobLabel = "ממתין";
                    jobClass = "bg-blue-50 border-blue-100 text-blue-700";
                  } else if (
                    jobStatus === "processing" ||
                    jobStatus === "running" ||
                    jobStatus === "logged_in" ||
                    jobStatus === "file_uploaded"
                  ) {
                    jobLabel = "בתהליך";
                    jobClass = "bg-blue-50 border-blue-100 text-blue-700";
                  } else if (jobStatus === "otp_required") {
                    jobLabel = "ממתין ל-OTP";
                    jobClass = "bg-yellow-50 border-yellow-100 text-yellow-800";
                  }

                  return (
                    <div
                      key={job.jobId}
                      className={`p-2 rounded-lg border text-xs ${jobClass}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-bold">{jobName}</div>
                        <div>{jobLabel}</div>
                      </div>

                      {jobMessage && (
                        <div className="mt-1 opacity-90">
                          {jobMessage}
                        </div>
                      )}

                      {!jobMessage && jobError && (
                        <div className="mt-1 opacity-90">
                          {jobError}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {isSelfUpdate && status === "done" && (
            <div className="mt-3 p-2 bg-green-50 border border-green-100 rounded-lg text-xs text-green-700">
              ✅ קובץ העדכון ירד וההתקנה הופעלה במחשב.
            </div>
          )}

          {!isSelfUpdate && isDone && (run as any)?.download?.filename && (
            <div className="mt-3 p-2 bg-green-50 border border-green-100 rounded-lg text-xs text-green-700">
              ✅ הקובץ התקבל: <b>{(run as any).download.filename}</b>
            </div>
          )}
        </>
      )}
    </div>
  );
}