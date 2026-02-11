// scripts/portalRunner/src/processRun.ts
import admin from "firebase-admin";
import { providers } from "./providers";
import type { RunDoc, RunnerCtx } from "./types";
import { resolveWindow, labelFromYm } from "./window";
import { initAdmin } from "./firebaseAdmin";
import { claimRun, setStatus, pollOtp, clearOtp } from "./firestoreRun";
import { buildEnv } from "./env";

export async function processRun(runId: string) {
  initAdmin();

  const db = admin.firestore();
  const runnerId = process.env.RUNNER_ID || `cloudrun_${Date.now()}`;

  // 1) claim טרנזקציוני (מונע ריצה כפולה)
  const ok = await claimRun(runId, runnerId);
  if (!ok) {
    console.log("[Runner] skip (not queued/already claimed):", runId);
    return { ok: true, skipped: true };
  }

  try {
    // 2) load run
    const snap = await db.collection("portalImportRuns").doc(runId).get();
    if (!snap.exists) throw new Error("Run not found");
    const run = snap.data() as RunDoc;

    // 3) provider
    const fn = providers[run.automationClass];
    if (!fn) throw new Error(`Unknown automationClass: ${run.automationClass}`);

    // 4) resolve window + monthLabel
    const resolved = resolveWindow(new Date(), run.requestedWindow);
    const monthLabel =
      resolved.kind === "month"
        ? (resolved.label || labelFromYm(resolved.ym))
        : resolved.label;

    await setStatus(runId, {
      resolvedWindow: resolved,
      monthLabel: run.monthLabel || monthLabel,
    });

    // 5) ctx
    const env = buildEnv({ RUNNER_ID: runnerId });

    const ctx: RunnerCtx = {
      runId,
      run: { ...run, resolvedWindow: resolved, monthLabel },
      env,
      setStatus,
      pollOtp,
      clearOtp,
      admin,
    };

    // 6) run provider
    await fn(ctx);

    // 7) mark done (רק אם לא error)
    const after = await db.collection("portalImportRuns").doc(runId).get();
    const curStatus = (after.data() as any)?.status;

    if (curStatus !== "error") {
      await setStatus(runId, { status: "done" });
    }

    return { ok: true, runId };
  } catch (e: any) {
    console.error("[Runner] processRun error:", e);

    await setStatus(runId, {
      status: "error",
      error: { step: "runner", message: String(e?.message || e) },
    });

    throw e;
  }
}
