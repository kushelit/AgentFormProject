// scripts/portalRunner/src/runner.ts
import crypto from "crypto";
import path from "path";
import fs from "fs";

import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  doc,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";

import { initFirebaseClient } from "./firebaseClient";
import type { RunDoc, RunnerCtx, RunnerEnv } from "./types";
import { resolveWindow, labelFromYm } from "./window";
import { buildRunnerPaths, setPlaywrightBrowsersPath } from "./runnerPaths";
import { createFileLogger } from "./logger";
import { loginIfNeeded } from "./loginCli";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function claimRunClient(db: any, runId: string, runnerId: string, agentId: string): Promise<boolean> {
  const ref = doc(db, "portalImportRuns", runId);

  return runTransaction(db, async (tx: any) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return false;

    const d: any = snap.data();
    if (String(d.status) !== "queued") return false;
    if (String(d.agentId) !== agentId) return false;
    if (d?.runner?.claimedAt) return false;

    tx.set(
      ref,
      {
        status: "running",
        step: "claimed",
        runner: { id: runnerId, claimedAt: serverTimestamp() },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return true;
  });
}

async function setStatusClient(db: any, runId: string, patch: any) {
  const ref = doc(db, "portalImportRuns", runId);
  await runTransaction(db, async (tx: any) => {
    tx.set(ref, { ...patch, updatedAt: serverTimestamp() }, { merge: true });
  });
}

async function pollOtpClient(db: any, runId: string, timeoutMs = 3 * 60 * 1000): Promise<string> {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const snap = await getDocs(
      query(collection(db, "portalImportRuns"), where("__name__", "==", runId), limit(1))
    );
    const d: any = snap.docs[0]?.data() || {};
    const otp = String(d?.otp?.value || "").trim();
    if (otp) return otp;
    await sleep(1000);
  }

  throw new Error("OTP timeout");
}

async function clearOtpClient(db: any, runId: string) {
  await setStatusClient(db, runId, { otp: { state: "none", value: "" } });
}

/* =========================================================
   Template+Month Lock (LOCAL - client Firestore)
========================================================= */

type LockResult =
  | { ok: true }
  | { ok: false; reason: "already_done" | "busy"; existingRunId?: string };

function lockDocId(agentId: string, templateId: string, ym: string) {
  return `${agentId}_${templateId}_${ym}`;
}

function getYmForLock(resolved: any): string | null {
  if (resolved?.kind === "month" && typeof resolved?.ym === "string" && resolved.ym) return resolved.ym;

  const start = resolved?.start || resolved?.from || resolved?.fromDate;
  const end = resolved?.end || resolved?.to || resolved?.toDate;

  const s = start ? new Date(start) : null;
  const e = end ? new Date(end) : null;

  if (s && e && !isNaN(s.getTime()) && !isNaN(e.getTime())) {
    const sy = s.getFullYear();
    const sm = s.getMonth() + 1;
    const ey = e.getFullYear();
    const em = e.getMonth() + 1;
    if (sy === ey && sm === em) {
      return `${sy}-${String(sm).padStart(2, "0")}`;
    }
  }

  return null;
}

async function acquireTemplateMonthLockClient(params: {
  db: any;
  agentId: string;
  templateId: string;
  ym: string;
  runId: string;
  runnerId: string;
  ttlMinutes?: number;
}): Promise<LockResult> {
  const ttlMinutes = params.ttlMinutes ?? 30;
  const ref = doc(params.db, "portalImportLocks", lockDocId(params.agentId, params.templateId, params.ym));

  const now = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(now.toMillis() + ttlMinutes * 60 * 1000);

  return runTransaction(params.db, async (tx: any) => {
    const snap = await tx.get(ref);

    if (snap.exists()) {
      const d = snap.data() as any;
      const state = String(d.state || "");
      const existingRunId = String(d.runId || "");
      const existingExpiresAt = d.expiresAt as Timestamp | undefined;

      const isExpired = existingExpiresAt ? existingExpiresAt.toMillis() < now.toMillis() : true;

      if (state === "done") {
        return { ok: false as const, reason: "already_done" as const, existingRunId };
      }

      if (state === "running" && !isExpired && existingRunId && existingRunId !== params.runId) {
        return { ok: false as const, reason: "busy" as const, existingRunId };
      }

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

async function markTemplateMonthLockDoneClient(params: {
  db: any;
  agentId: string;
  templateId: string;
  ym: string;
  runId: string;
}) {
  const ref = doc(params.db, "portalImportLocks", lockDocId(params.agentId, params.templateId, params.ym));
  await runTransaction(params.db, async (tx: any) => {
    tx.set(
      ref,
      {
        state: "done",
        runId: params.runId,
        doneAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });
}

async function markTemplateMonthLockErrorClient(params: {
  db: any;
  agentId: string;
  templateId: string;
  ym: string;
  runId: string;
  message: string;
}) {
  const ref = doc(params.db, "portalImportLocks", lockDocId(params.agentId, params.templateId, params.ym));
  await runTransaction(params.db, async (tx: any) => {
    tx.set(
      ref,
      {
        state: "error",
        runId: params.runId,
        error: { message: params.message },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });
}

function setupGracefulShutdown() {
  let stop = false;
  const onStop = () => {
    stop = true;
  };
  process.on("SIGINT", onStop);
  process.on("SIGTERM", onStop);
  return () => stop;
}

async function main() {
  const shouldStop = setupGracefulShutdown();

  const { auth, db, storage, functions, runner, effectiveBucket } = initFirebaseClient();

  const paths = buildRunnerPaths({
    downloadDirFromConfig: (runner?.downloadDir && String(runner.downloadDir).trim()) || null,
  });

  const log = createFileLogger({ logsDir: paths.logsDir, alsoConsole: true });

  // ✅ רק ב-EXE (pkg) אנחנו קובעים PLAYWRIGHT_BROWSERS_PATH — אבל מכוונים ליד ה-EXE (לא APPDATA)
  if ((process as any).pkg) {
    const exeDir = path.dirname(process.execPath);
    const pwNearExe = path.join(exeDir, "pw-browsers");

    log.info("[Runner] exeDir=", exeDir);
    log.info("[Runner] pwNearExe=", pwNearExe);
    log.info("[Runner] pwNearExe exists=", fs.existsSync(pwNearExe));

    // אם התיקייה ליד ה-EXE קיימת – נכפה אותה. אחרת ניפול חזרה לנתיב מה-paths (לוג בלבד)
    if (fs.existsSync(pwNearExe)) {
      setPlaywrightBrowsersPath(pwNearExe);
    } else {
      log.warn("[Runner] pw-browsers not found near exe. Fallback to paths.pwBrowsersDir=", paths.pwBrowsersDir);
      setPlaywrightBrowsersPath(paths.pwBrowsersDir);
    }
  }

  log.info("[Runner] installDir=", paths.installDir);
  log.info("[Runner] appDataDir=", paths.appDataDir);
  log.info("[Runner] downloadsDir=", paths.downloadsDir);
  log.info("[Runner] logsDir=", paths.logsDir);
  log.info("[Runner] PLAYWRIGHT_BROWSERS_PATH=", process.env.PLAYWRIGHT_BROWSERS_PATH);

  // import providers AFTER playwright env set
  const { providers } = await import("./providers");

  const agentId = await loginIfNeeded({ auth, functions });

  const runnerId = `local_${agentId}_${crypto.randomUUID().slice(0, 8)}`;

  const pollMs =
    typeof runner?.pollIntervalMs === "number" && isFinite(runner.pollIntervalMs) && runner.pollIntervalMs >= 500
      ? runner.pollIntervalMs
      : 2000;

  const headlessFromConfig = typeof runner?.headless === "boolean" ? String(runner.headless) : undefined;

  const env: RunnerEnv = {
    RUNNER_ID: runnerId,
    HEADLESS: headlessFromConfig,
    DOWNLOAD_DIR: paths.downloadsDir,
    CLAL_PORTAL_URL: (runner?.clalPortalUrl && String(runner.clalPortalUrl).trim()) || undefined,
    MIGDAL_PORTAL_URL: (runner?.migdalPortalUrl && String(runner.migdalPortalUrl).trim()) || undefined,
    MIGDAL_DEBUG: runner?.migdalDebug !== undefined ? String(runner.migdalDebug) : undefined,
    FIREBASE_STORAGE_BUCKET: effectiveBucket,
  };

  log.info("[LocalRunner] started. agentId=", agentId, "runnerId=", runnerId, "pollMs=", pollMs);

  while (!shouldStop()) {
    try {
      const snap = await getDocs(
        query(
          collection(db, "portalImportRuns"),
          where("agentId", "==", agentId),
          where("status", "==", "queued"),
          orderBy("createdAt", "asc"),
          limit(5)
        )
      );

      if (snap.empty) {
        await sleep(pollMs);
        continue;
      }

      for (const docSnap of snap.docs) {
        if (shouldStop()) break;

        const runId = docSnap.id;
        const run = docSnap.data() as RunDoc;

        const ok = await claimRunClient(db, runId, runnerId, agentId);
        if (!ok) continue;

        log.info("[LocalRunner] claimed run:", runId, run.automationClass);

        let lockInfo: null | { agentId: string; templateId: string; ym: string } = null;

        try {
          const fn = (providers as any)[run.automationClass];
          if (!fn) throw new Error(`Unknown automationClass: ${run.automationClass}`);

          const resolved = resolveWindow(new Date(), run.requestedWindow);
          const monthLabel =
            resolved.kind === "month" ? (resolved.label || labelFromYm(resolved.ym)) : resolved.label;

          await setStatusClient(db, runId, {
            resolvedWindow: resolved,
            monthLabel: run.monthLabel || monthLabel,
          });

          const ym = getYmForLock(resolved);

          if (ym && run.templateId) {
            const lock = await acquireTemplateMonthLockClient({
              db,
              agentId: run.agentId,
              templateId: run.templateId,
              ym,
              runId,
              runnerId,
            });

            if (!lock.ok) {
              await setStatusClient(db, runId, {
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

              log.warn("[LocalRunner] skipped duplicate:", runId, lock.reason, lock.existingRunId || "");
              continue;
            }

            lockInfo = { agentId: run.agentId, templateId: run.templateId, ym };
          }

          const ctx: RunnerCtx = {
            runId,
            run: { ...run, resolvedWindow: resolved, monthLabel },
            env,
            setStatus: (id, patch) => setStatusClient(db, id, patch),
            pollOtp: (id, t) => pollOtpClient(db, id, t),
            clearOtp: (id) => clearOtpClient(db, id),
            storage,
            agentId,
            runnerId,
            functions,
            paths,
            log,
          };

          await fn(ctx);

          const after = await getDoc(doc(db, "portalImportRuns", runId));
          const curStatus = String((after.data() as any)?.status || "");
          if (curStatus !== "error") {
            await setStatusClient(db, runId, { status: "done" });
            if (lockInfo) {
              await markTemplateMonthLockDoneClient({ db, ...lockInfo, runId });
            }
          }
        } catch (e: any) {
          const msg = String(e?.message || e);
          log.error("[LocalRunner] run error:", runId, msg);

          if (lockInfo) {
            try {
              await markTemplateMonthLockErrorClient({ db, ...lockInfo, runId, message: msg });
            } catch (lockErr: any) {
              log.error("[LocalRunner] failed to mark lock error:", lockErr?.message || lockErr);
            }
          }

          await setStatusClient(db, runId, {
            status: "error",
            step: "runner",
            error: { step: "runner", message: msg },
          });
        }
      }
    } catch (e: any) {
      log.error("[LocalRunner] poll loop error:", e?.message || e);
      await sleep(1500);
    }
  }

  log.info("[LocalRunner] stopping...");
  if (log.flush) await log.flush();
  process.exit(0);
}

main().catch(async (e) => {
  try {
    console.error(e);
  } catch {}
  process.exit(1);
});