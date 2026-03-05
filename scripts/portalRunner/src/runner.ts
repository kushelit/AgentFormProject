import crypto from "crypto";
import path from "path";
import fs from "fs";
import { spawn, execSync } from "child_process"; 
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

import { ref, getDownloadURL } from "firebase/storage";
import { initFirebaseClient } from "./firebaseClient";
import type { RunDoc, RunnerCtx, RunnerEnv } from "./types";
import { resolveWindow, labelFromYm } from "./window";
import { buildRunnerPaths, setPlaywrightBrowsersPath } from "./runnerPaths";
import { createFileLogger } from "./logger";
import { loginIfNeeded } from "./loginCli";

// הגדרת גרסה נוכחית
const RUNNER_VERSION = "2.0.1";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * פונקציית עזר: מקפיצה חלון קלט של Windows להזנת קוד צימוד
 */
function getPairingCodeFromUI(): string | null {
  try {
    const psCommand = `
      Add-Type -AssemblyName Microsoft.VisualBasic;
      [Microsoft.VisualBasic.Interaction]::InputBox('נא להזין את קוד הצימוד המופיע באתר:', 'חיבור MagicSale Runner', '')
    `;
    // הפקודה עוצרת את ביצוע הקוד עד שהמשתמש לוחץ OK או Cancel
    const result = execSync(`powershell -Command "${psCommand.replace(/\n/g, "")}"`, { encoding: "utf8" });
    return result.trim() || null;
  } catch (e) {
    return null; // המשתמש לחץ על ביטול
  }
}

/**
 * בודק ב-Firestore אם קיימת גרסה חדשה יותר בשרת
 */
async function checkForUpdates(db: any, log: any) {
  try {
    const configRef = doc(db, "portalRunnerConfig", "global");
    const snap = await getDoc(configRef);
    
    if (snap.exists()) {
      const remoteVersion = snap.data()?.latestVersion;
      if (remoteVersion && remoteVersion !== RUNNER_VERSION) {
        log.info(`[Update] New version detected on server: ${remoteVersion}. (Current: ${RUNNER_VERSION})`);
        return remoteVersion;
      }
    }
  } catch (e) {
    log.error("[Update] Failed to check for updates:", e);
  }
  return null;
}

// --- פונקציות עזר ל-Firestore ---

async function claimRunClient(db: any, runId: string, runnerId: string, agentId: string): Promise<boolean> {
  const ref = doc(db, "portalImportRuns", runId);
  return runTransaction(db, async (tx: any) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return false;
    const d: any = snap.data();
    if (String(d.status) !== "queued") return false;
    if (String(d.agentId) !== agentId) return false;
    if (d?.runner?.claimedAt) return false;

    tx.set(ref, {
      status: "running",
      step: "claimed",
      runner: { id: runnerId, claimedAt: serverTimestamp(), version: RUNNER_VERSION },
      updatedAt: serverTimestamp(),
    }, { merge: true });
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
    const snap = await getDocs(query(collection(db, "portalImportRuns"), where("__name__", "==", runId), limit(1)));
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

// --- ניהול נעילות (Locks) ---

type LockResult = | { ok: true } | { ok: false; reason: "already_done" | "busy"; existingRunId?: string };

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
    if (sy === ey && sm === em) return `${sy}-${String(sm).padStart(2, "0")}`;
  }
  return null;
}

async function acquireTemplateMonthLockClient(params: {
  db: any; agentId: string; templateId: string; ym: string; runId: string; runnerId: string; ttlMinutes?: number;
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

      if (state === "done") return { ok: false as const, reason: "already_done" as const, existingRunId };
      if (state === "running" && !isExpired && existingRunId && existingRunId !== params.runId) {
        return { ok: false as const, reason: "busy" as const, existingRunId };
      }
      tx.set(ref, { agentId: params.agentId, templateId: params.templateId, ym: params.ym, state: "running", runId: params.runId, runnerId: params.runnerId, claimedAt: now, updatedAt: now, expiresAt }, { merge: true });
      return { ok: true as const };
    }
    tx.set(ref, { agentId: params.agentId, templateId: params.templateId, ym: params.ym, state: "running", runId: params.runId, runnerId: params.runnerId, claimedAt: now, updatedAt: now, expiresAt });
    return { ok: true as const };
  });
}

async function markTemplateMonthLockDoneClient(params: { db: any; agentId: string; templateId: string; ym: string; runId: string; }) {
  const ref = doc(params.db, "portalImportLocks", lockDocId(params.agentId, params.templateId, params.ym));
  await runTransaction(params.db, async (tx: any) => {
    tx.set(ref, { state: "done", runId: params.runId, doneAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
  });
}

async function markTemplateMonthLockErrorClient(params: { db: any; agentId: string; templateId: string; ym: string; runId: string; message: string; }) {
  const ref = doc(params.db, "portalImportLocks", lockDocId(params.agentId, params.templateId, params.ym));
  await runTransaction(params.db, async (tx: any) => {
    tx.set(ref, { state: "error", runId: params.runId, error: { message: params.message }, updatedAt: serverTimestamp() }, { merge: true });
  });
}

function setupGracefulShutdown() {
  let stop = false;
  const onStop = () => { stop = true; };
  process.on("SIGINT", onStop);
  process.on("SIGTERM", onStop);
  return () => stop;
}

/* =========================================================
   MAIN ENTRY POINT
========================================================= */

async function main() {
  const shouldStop = setupGracefulShutdown();
  const { auth, db, storage, functions, runner, effectiveBucket } = initFirebaseClient();

  const paths = buildRunnerPaths({
    downloadDirFromConfig: (runner?.downloadDir && String(runner.downloadDir).trim()) || null,
  });

  const log = createFileLogger({ logsDir: paths.logsDir, alsoConsole: true });
  log.info(`[Runner] Starting MagicSale Runner v${RUNNER_VERSION}`);

  // טיפול בנתיבי Playwright בתוך EXE (PKG)
  if ((process as any).pkg) {
    const exeDir = path.dirname(process.execPath);
    const pwNearExe = path.join(exeDir, "pw-browsers");
    if (fs.existsSync(pwNearExe)) {
      setPlaywrightBrowsersPath(pwNearExe);
    } else {
      log.warn("[Runner] pw-browsers not found near exe. Fallback to default.");
      setPlaywrightBrowsersPath(paths.pwBrowsersDir);
    }
  }

  const { providers } = await import("./providers");

  // --- לוגיקת צימוד וחיבור חכמה ---
  let tempAgentId: string | null = null;

  try {
    // נסיון ראשון: אולי הסוכן כבר מחובר (יש לו session.json)
    tempAgentId = await loginIfNeeded({ auth, functions });
  } catch (err) {
    log.info("[Login] No session found, popping up UI pairing window...");
    
    // אם אין סשן - מקפיצים את החלון
    const code = getPairingCodeFromUI();

    if (!code) {
      log.error("[Login] User cancelled pairing window. Exiting...");
      process.exit(1); 
    }

    // נסיון שני: צימוד עם הקוד שהתקבל מהחלון
    // הערה: loginIfNeeded צריכה לתמוך ב-pairingCode בתוך האובייקט
    tempAgentId = await loginIfNeeded({ auth, functions, pairingCode: code } as any);
  }

  // וידוא עבור TypeScript שה-agentId אינו null
  if (!tempAgentId) {
    log.error("[Runner] Authentication failed (agentId is null). Exiting.");
    process.exit(1);
  }

  const agentId: string = tempAgentId; // מעכשיו הוא string ודאי

  // בדיקת עדכונים
  await checkForUpdates(db, log);

  const runnerId = `local_${agentId}_${crypto.randomUUID().slice(0, 8)}`;
  const pollMs = typeof runner?.pollIntervalMs === "number" && isFinite(runner.pollIntervalMs) && runner.pollIntervalMs >= 500
      ? runner.pollIntervalMs : 2000;

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

  log.info("[LocalRunner] Polling started. agentId=", agentId, "runnerId=", runnerId);

  // --- LOOP POLLING ---
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

        // מנגנון עדכון עצמי (OTA)
        if (run.automationClass === "self_update") {
          await claimRunClient(db, runId, runnerId, agentId);
          await setStatusClient(db, runId, { status: "running", step: "downloading_update" });
          
          try {
            log.info("[Update] Starting self-update download...");
            const storageRef = ref(storage, "installers/MagicSaleSetup.exe");
            const downloadUrl = await getDownloadURL(storageRef);
            const updatePath = path.join(paths.downloadsDir, "MagicSaleSetup_New.exe");
            
            const response = await fetch(downloadUrl);
            const buffer = await response.arrayBuffer();
            fs.writeFileSync(updatePath, Buffer.from(buffer));

            await setStatusClient(db, runId, { status: "done", step: "update_downloaded" });
            log.info("[Update] Download complete. Launching installer...");

            spawn(updatePath, ["/SILENT"], { detached: true, stdio: "ignore" }).unref();
            process.exit(0); 
          } catch (err: any) {
            log.error("[Update] Failed to perform self-update:", err.message);
            await setStatusClient(db, runId, { status: "error", error: { message: err.message } });
            continue;
          }
        }

        const ok = await claimRunClient(db, runId, runnerId, agentId);
        if (!ok) continue;

        log.info("[LocalRunner] processing run:", runId, run.automationClass);
        let lockInfo: null | { agentId: string; templateId: string; ym: string } = null;

        try {
          const fn = (providers as any)[run.automationClass];
          if (!fn) throw new Error(`Unknown automationClass: ${run.automationClass}`);

          const resolved = resolveWindow(new Date(), run.requestedWindow);
          const monthLabel = resolved.kind === "month" ? (resolved.label || labelFromYm(resolved.ym)) : resolved.label;

          await setStatusClient(db, runId, { resolvedWindow: resolved, monthLabel: run.monthLabel || monthLabel });

          const ym = getYmForLock(resolved);
          if (ym && run.templateId) {
            const lock = await acquireTemplateMonthLockClient({ db, agentId: run.agentId, templateId: run.templateId, ym, runId, runnerId });
            if (!lock.ok) {
              await setStatusClient(db, runId, { status: "skipped", step: lock.reason === "already_done" ? "duplicate_done" : "duplicate_running", error: { step: "runner", message: `Duplicate run for ${ym}` } });
              continue;
            }
            lockInfo = { agentId: run.agentId, templateId: run.templateId, ym };
          }

          const ctx: RunnerCtx = {
            runId, run: { ...run, resolvedWindow: resolved, monthLabel }, env,
            setStatus: (id, patch) => setStatusClient(db, id, patch),
            pollOtp: (id, t) => pollOtpClient(db, id, t),
            clearOtp: (id) => clearOtpClient(db, id),
            storage, agentId, runnerId, functions, paths, log,
          };

          await fn(ctx);

          const after = await getDoc(doc(db, "portalImportRuns", runId));
          if ((after.data() as any)?.status !== "error") {
            await setStatusClient(db, runId, { status: "done" });
            if (lockInfo) await markTemplateMonthLockDoneClient({ db, ...lockInfo, runId });
          }
        } catch (e: any) {
          log.error("[LocalRunner] Error in provider:", e.message);
          if (lockInfo) await markTemplateMonthLockErrorClient({ db, ...lockInfo, runId, message: e.message });
          await setStatusClient(db, runId, { status: "error", error: { message: e.message } });
        }
      }
    } catch (e: any) {
      log.error("[LocalRunner] Polling error:", e.message);
      await sleep(1500);
    }
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });