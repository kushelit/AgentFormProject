// scripts/portalRunner/src/processRun.ts
import admin from "firebase-admin";
import { providers } from "./providers";
import type { RunDoc, RunnerCtx } from "./types";
import { resolveWindow, labelFromYm } from "./window";
import { initAdmin } from "./firebaseAdmin";
import {
  claimRun,
  setStatus,
  pollOtp,
  clearOtp,
  acquireTemplateMonthLock,
  markTemplateMonthLockDone,
  markTemplateMonthLockError,
} from "./firestoreRun";
import { buildEnv } from "./env";

export async function processRun(runId: string) {
  initAdmin();

  const db = admin.firestore();
  const runnerId = process.env.RUNNER_ID || `cloudrun_${Date.now()}`;

  // Will be set only after we resolve month and successfully acquire lock
  let lockInfo: null | { agentId: string; templateId: string; ym: string } = null;

  // 1) claim טרנזקציוני (מונע ריצה כפולה לאותו runId)
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
      resolved.kind === "month" ? resolved.label || labelFromYm(resolved.ym) : resolved.label;

    await setStatus(runId, {
      resolvedWindow: resolved,
      monthLabel: run.monthLabel || monthLabel,
    });

    console.log("[Runner] requestedWindow:", run.requestedWindow);
console.log("[Runner] resolvedWindow:", resolved);
    // 4.5) Lock by "what was chosen in portal UI" (resolved month)
    // Requirement: block rerun after SUCCESS (state=done)
    if (resolved.kind === "month") {
      const ym = resolved.ym; // YYYY-MM
  console.log("[Runner] about to acquire lock:", { agentId: run.agentId, templateId: run.templateId, ym, runId, runnerId });

      const lock = await acquireTemplateMonthLock({
        agentId: run.agentId,
        templateId: run.templateId,
        ym,
        runId,
        runnerId,
      });
console.log("[Runner] lock result:", lock);
      if (!lock.ok) {
        await setStatus(runId, {
          status: "skipped",
          step: lock.reason === "already_done" ? "duplicate_done" : "duplicate_running",
          error: {
            step: "runner",
            message:
              lock.reason === "already_done"
                ? `כבר בוצעה טעינה בהצלחה לתבנית ${run.templateId} עבור ${ym}`
                : `כבר קיימת ריצה פעילה לתבנית ${run.templateId} עבור ${ym}`,
          },
        });
        return { ok: true, skipped: true };
      }

      lockInfo = { agentId: run.agentId, templateId: run.templateId, ym };
    }

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
      agentId: run.agentId,
      runnerId,
    };

    // 6) run provider
    await fn(ctx);

    // 7) mark done (רק אם לא error)
    const after = await db.collection("portalImportRuns").doc(runId).get();
    const curStatus = (after.data() as any)?.status;

    if (curStatus !== "error") {
      await setStatus(runId, { status: "done" });
      if (lockInfo) {
        await markTemplateMonthLockDone({ ...lockInfo, runId });
      }
    }

    return { ok: true, runId };
  } catch (e: any) {
    console.error("[Runner] processRun error:", e);

    // mark lock as error (does NOT block retry)
    if (lockInfo) {
      try {
        await markTemplateMonthLockError({
          ...lockInfo,
          runId,
          message: String(e?.message || e),
        });
      } catch (lockErr) {
        console.error("[Runner] failed to mark lock error:", lockErr);
      }
    }

    await setStatus(runId, {
      status: "error",
      error: { step: "runner", message: String(e?.message || e) },
    });

    throw e;
  }
}