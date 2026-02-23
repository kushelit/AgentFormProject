// scripts/portalRunner/src/firestoreRun.ts
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

/* =========================================================
   Template+Month Lock (prevent rerun after success)
   Collection: portalImportLocks
   DocId: {agentId}_{templateId}_{ym}
   ym is from resolvedWindow (what you chose in portal UI)
========================================================= */

type LockResult =
  | { ok: true }
  | { ok: false; reason: "already_done" | "busy"; existingRunId?: string };

function lockDocId(agentId: string, templateId: string, ym: string) {
  return `${agentId}_${templateId}_${ym}`; // ym = YYYY-MM
}

/**
 * Acquire lock for agentId+templateId+ym.
 * - state=done: block rerun (your stage-1 requirement)
 * - state=running (not expired): block parallel run
 * - state=error/expired: allow takeover (retry)
 */
export async function acquireTemplateMonthLock(params: {
  agentId: string;
  templateId: string;
  ym: string; // YYYY-MM
  runId: string;
  runnerId: string;
  ttlMinutes?: number; // default 30
}): Promise<LockResult> {
  const db = admin.firestore();
  const ttlMinutes = params.ttlMinutes ?? 30;

  const ref = db
    .collection("portalImportLocks")
    .doc(lockDocId(params.agentId, params.templateId, params.ym));

  const now = admin.firestore.Timestamp.now();
  const expiresAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + ttlMinutes * 60 * 1000);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);

    if (snap.exists) {
      const d = snap.data() as any;
      const state = String(d.state || "");
      const existingRunId = String(d.runId || "");
      const existingExpiresAt = d.expiresAt as admin.firestore.Timestamp | undefined;

      const isExpired = existingExpiresAt ? existingExpiresAt.toMillis() < now.toMillis() : true;

      // ✅ Block rerun after success
      if (state === "done") {
        return { ok: false as const, reason: "already_done" as const, existingRunId };
      }

      // Block parallel run if not expired
      if (state === "running" && !isExpired && existingRunId && existingRunId !== params.runId) {
        return { ok: false as const, reason: "busy" as const, existingRunId };
      }

      // expired / error / same run => takeover
      tx.set(
        ref,
        {
          agentId: params.agentId,
          templateId: params.templateId,
          ym: params.ym,
          state: "running",
          runId: params.runId,
          runnerId: params.runnerId,
          claimedAt: now,
          updatedAt: now,
          expiresAt,
        },
        { merge: true }
      );

      return { ok: true as const };
    }

    // create new lock
    tx.set(ref, {
      agentId: params.agentId,
      templateId: params.templateId,
      ym: params.ym,
      state: "running",
      runId: params.runId,
      runnerId: params.runnerId,
      claimedAt: now,
      updatedAt: now,
      expiresAt,
    });

    return { ok: true as const };
  });
}

export async function markTemplateMonthLockDone(params: {
  agentId: string;
  templateId: string;
  ym: string;
  runId: string;
}) {
  const db = admin.firestore();
  const ref = db
    .collection("portalImportLocks")
    .doc(lockDocId(params.agentId, params.templateId, params.ym));

  await ref.set(
    {
      state: "done",
      runId: params.runId,
      doneAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function markTemplateMonthLockError(params: {
  agentId: string;
  templateId: string;
  ym: string;
  runId: string;
  message: string;
}) {
  const db = admin.firestore();
  const ref = db
    .collection("portalImportLocks")
    .doc(lockDocId(params.agentId, params.templateId, params.ym));

  await ref.set(
    {
      state: "error",
      runId: params.runId,
      error: { message: params.message },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      // intentionally NOT setting "done" so retry is allowed
    },
    { merge: true }
  );
}