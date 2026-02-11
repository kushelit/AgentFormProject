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
    | "error"
    | string;

  step?: string;
  monthLabel?: string;

  otp?: {
    state?: "none" | "required" | "manual";
    mode?: "firestore" | "manual"; // ✅ חדש (ה-source of truth)
    value?: string;
    hint?: string;
  };

  error?: { step?: string; message?: string };

  download?: { storagePath?: string; bucket?: string; filename?: string };

  updatedAt?: any;
};

export function usePortalRun(db: Firestore, runId?: string) {
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
        setRun((snap.data() as any) || null);
      },
      () => setLoading(false)
    );

    return () => unsub();
  }, [db, runId]);

  const otpMode = useMemo(() => {
    // ✅ ברירת מחדל: firestore
    return String(run?.otp?.mode || "firestore").toLowerCase();
  }, [run?.otp?.mode]);

  // 🔐 האם צריך להציג מודאל OTP במערכת
  const needsOtp = useMemo(() => {
    return (
      run?.status === "otp_required" &&
      run?.otp?.state === "required" &&
      otpMode !== "manual"
    );
  }, [run?.status, run?.otp?.state, otpMode]);

  // 🖥️ האם זה OTP ידני בפורטל (לא מציגים מודל, רק סטטוס/הנחיה)
  const isManualOtp = useMemo(() => {
    return run?.status === "otp_required" && otpMode === "manual";
  }, [run?.status, otpMode]);

  const isDone = useMemo(() => run?.status === "done", [run?.status]);
  const isError = useMemo(() => run?.status === "error", [run?.status]);

  const submitOtp = useCallback(
    async (otpValue: string) => {
      if (!runId) return;

      const ref = doc(db, "portalImportRuns", runId);

      await updateDoc(ref, {
        otp: {
          state: "required",
          value: String(otpValue || "").trim(),
          mode: "firestore", // ✅ כששולחים דרך UI זה תמיד firestore
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
    needsOtp,
    isManualOtp,
    isDone,
    isError,
    submitOtp,
    clearOtp,
  };
}
