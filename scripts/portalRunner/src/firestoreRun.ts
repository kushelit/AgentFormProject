import admin from "firebase-admin";
import type { RunDoc } from "./types";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function claimRun(runId: string, runnerId: string): Promise<boolean> {
  const db = admin.firestore();
  const ref = db.collection("portalImportRuns").doc(runId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;

    const d = snap.data() as any;
    if (d.status !== "queued") return false;

    tx.set(
      ref,
      {
        status: "running",
        runner: { id: runnerId, claimedAt: admin.firestore.FieldValue.serverTimestamp() },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return true;
  });
}

export async function setStatus(runId: string, patch: Partial<RunDoc> & Record<string, any>) {
  const db = admin.firestore();
  await db
    .collection("portalImportRuns")
    .doc(runId)
    .set({ ...patch, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
}

export async function pollOtp(runId: string, timeoutMs = 3 * 60 * 1000): Promise<string> {
  const db = admin.firestore();
  const ref = db.collection("portalImportRuns").doc(runId);
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const snap = await ref.get();
    const d = snap.data() as any;
    const otp = String(d?.otp?.value || "").trim();
    if (otp) return otp;
    await sleep(1000);
  }
  throw new Error("OTP timeout");
}

export async function clearOtp(runId: string) {
  const db = admin.firestore();
  const ref = db.collection("portalImportRuns").doc(runId);

  await ref.set(
    {
      otp: { state: "none", value: admin.firestore.FieldValue.delete() },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}
