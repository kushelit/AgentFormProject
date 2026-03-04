import { useEffect, useMemo, useState, useCallback } from "react";
import type { Firestore } from "firebase/firestore";
import { doc, onSnapshot, updateDoc, serverTimestamp } from "firebase/firestore";

export type PortalRunDoc = {
  runId: string;
  status?:
    | "queued"
    | "running"
    | "otp_required"
    | "logged_in"
    | "file_uploaded"
    | "done"
    | "skipped" // הוזף כדי לתמוך במקרים של כפילויות
    | "error"
    | string;
  step?: string;
  monthLabel?: string;
  otp?: {
    state?: "none" | "required" | "manual";
    mode?: "firestore" | "manual";
    value?: string;
    hint?: string;
  };
  error?: { step?: string; message?: string };
  download?: { storagePath?: string; bucket?: string; filename?: string };
  updatedAt?: any;
};

// הגדרת הטיפוס של פונקציית הסיום
type OnFinishedCallback = (status: string) => void;

export function usePortalRun(
  db: Firestore, 
  runId?: string, 
  onFinished?: OnFinishedCallback // הוספת הפרמטר כרשות
) {
  const [run, setRun] = useState<PortalRunDoc | null>(null);
  const [loading, setLoading] = useState<boolean>(!!runId);

  useEffect(() => {
    if (!runId) {
      setRun(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const ref = doc(db, "portalImportRuns", runId);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        setLoading(false);
        const data = snap.data() as PortalRunDoc;
        setRun(data || null);

        // ✅ בדיקה אם הסטטוס סופי - ואם כן הפעלת ה-callback
if (data && data.status && ["done", "skipped", "error", "success"].includes(data.status)) {          if (onFinished) {
            onFinished(data.status);
          }
        }
      },
      (err) => {
        console.error("PortalRun Snapshot Error:", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [db, runId, onFinished]); // הוספת onFinished למערך התלות

  // 📊 חישוב אחוז התקדמות ויזואלי (progress)
  const progress = useMemo(() => {
    if (!run?.status) return 0;
    const s = run.status;
    if (s === "queued") return 10;
    if (s === "running") return 30;
    if (s === "otp_required") return 50;
    if (s === "logged_in") return 70;
    if (s === "file_uploaded") return 90;
if (s === "done" || s === "skipped" || s === "success") return 100;
    return 0;
  }, [run?.status]);

  const otpMode = useMemo(() => {
    return String(run?.otp?.mode || "firestore").toLowerCase();
  }, [run?.otp?.mode]);

  const needsOtp = useMemo(() => {
    return (
      run?.status === "otp_required" &&
      run?.otp?.state === "required" &&
      otpMode !== "manual"
    );
  }, [run?.status, run?.otp?.state, otpMode]);

  const isManualOtp = useMemo(() => {
    return run?.status === "otp_required" && otpMode === "manual";
  }, [run?.status, otpMode]);

  const isDone = useMemo(() => run?.status === "done" || run?.status === "skipped", [run?.status]);
  const isError = useMemo(() => run?.status === "error", [run?.status]);

  const submitOtp = useCallback(
    async (otpValue: string) => {
      if (!runId) return;
      const ref = doc(db, "portalImportRuns", runId);
      await updateDoc(ref, {
        otp: {
          state: "required",
          value: String(otpValue || "").trim(),
          mode: "firestore",
        },
        updatedAt: serverTimestamp(),
      } as any);
    },
    [db, runId]
  );

  const clearOtp = useCallback(async () => {
    if (!runId) return;
    const ref = doc(db, "portalImportRuns", runId);
    await updateDoc(ref, {
      otp: {
        state: "none",
        value: "",
        mode: "firestore",
      },
      updatedAt: serverTimestamp(),
    } as any);
  }, [db, runId]);

  return {
    run,
    loading,
    progress, // ✅ עכשיו זה מוחזר
    needsOtp,
    isManualOtp,
    isDone,
    isError,
    submitOtp,
    clearOtp,
  };
}