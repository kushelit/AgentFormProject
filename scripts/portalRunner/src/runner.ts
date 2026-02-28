// scripts/portalRunner/src/poller.local.ts
import crypto from "crypto";
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
import { loginIfNeeded } from "./loginCli";
import { providers } from "./providers";
import type { RunDoc, RunnerCtx, RunnerEnv } from "./types";
import { resolveWindow, labelFromYm } from "./window";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function pickPollIntervalMs() {
  const raw = Number(process.env.POLL_INTERVAL_MS || 2000);
  if (!isFinite(raw) || raw < 500) return 2000;
  return raw;
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
   Collection: portalImportLocks
   DocId: {agentId}_{templateId}_{ym}
========================================================= */

type LockResult =
  | { ok: true }
  | { ok: false; reason: "already_done" | "busy"; existingRunId?: string };

function lockDocId(agentId: string, templateId: string, ym: string) {
  return `${agentId}_${templateId}_${ym}`;
}

// מנסים לחלץ YYYY-MM גם אם resolved.kind לא בדיוק "month"
function getYmForLock(resolved: any): string | null {
  if (resolved?.kind === "month" && typeof resolved?.ym === "string" && resolved.ym) return resolved.ym;

  // אופציונלי: אם יש start/end באותו חודש
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
  ym: string; // YYYY-MM
  runId: string;
  runnerId: string;
  ttlMinutes?: number; // default 30
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

async function main() {
  const { auth, db, storage, functions, runner, effectiveBucket } = initFirebaseClient();

  const agentId = await loginIfNeeded({ auth, functions });

  const runnerId =
    process.env.RUNNER_ID ||
    `local_${agentId}_${crypto.randomUUID().slice(0, 8)}`;

  // poll interval: קודם קונפיג, אח"כ ENV, אח"כ default
  const pollMsFromConfig = typeof runner?.pollIntervalMs === "number" ? runner.pollIntervalMs : undefined;
  const pollMs = pollMsFromConfig ?? pickPollIntervalMs();

  // Headless / DownloadDir: קודם קונפיג, אח"כ ENV
  const headlessFromConfig =
    typeof runner?.headless === "boolean" ? String(runner.headless) : undefined;

  const downloadDirFromConfig =
    typeof runner?.downloadDir === "string" && runner.downloadDir.trim()
      ? runner.downloadDir.trim()
      : undefined;

  const env: RunnerEnv = {
    RUNNER_ID: runnerId,
    HEADLESS: headlessFromConfig ?? process.env.HEADLESS,
    DOWNLOAD_DIR: downloadDirFromConfig ?? process.env.DOWNLOAD_DIR,

    // אפשר כבר להעביר גם לקונפיג (מומלץ ל-EXE). כרגע: config קודם ואז ENV
    CLAL_PORTAL_URL: (runner?.clalPortalUrl && String(runner.clalPortalUrl).trim()) || process.env.CLAL_PORTAL_URL,
    MIGDAL_PORTAL_URL: (runner?.migdalPortalUrl && String(runner.migdalPortalUrl).trim()) || process.env.MIGDAL_PORTAL_URL,
    MIGDAL_DEBUG:
      runner?.migdalDebug !== undefined ? String(runner.migdalDebug) : process.env.MIGDAL_DEBUG,

    FIREBASE_STORAGE_BUCKET: effectiveBucket,
  };

  console.log("[LocalRunner] started. agentId=", agentId, "runnerId=", runnerId, "pollMs=", pollMs);

  while (true) {
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
        const runId = docSnap.id;
        const run = docSnap.data() as RunDoc;

        const ok = await claimRunClient(db, runId, runnerId, agentId);
        if (!ok) continue;

        console.log("[LocalRunner] claimed run:", runId, run.automationClass);

        // Will be set only after we resolve month and successfully acquire lock
        let lockInfo: null | { agentId: string; templateId: string; ym: string } = null;

        try {
          const fn = providers[run.automationClass];
          if (!fn) throw new Error(`Unknown automationClass: ${run.automationClass}`);

          const resolved = resolveWindow(new Date(), run.requestedWindow);
          const monthLabel =
            resolved.kind === "month" ? (resolved.label || labelFromYm(resolved.ym)) : resolved.label;

          await setStatusClient(db, runId, {
            resolvedWindow: resolved,
            monthLabel: run.monthLabel || monthLabel,
          });

          // ===== 4.5) Lock (BEFORE provider/OTP) =====
          const ym = getYmForLock(resolved);

          if (ym && run.templateId) {
            console.log("[LocalRunner] about to acquire lock:", {
              agentId: run.agentId,
              templateId: run.templateId,
              ym,
              runId,
              runnerId,
            });

            const lock = await acquireTemplateMonthLockClient({
              db,
              agentId: run.agentId,
              templateId: run.templateId,
              ym,
              runId,
              runnerId,
            });

            console.log("[LocalRunner] lock result:", lock);

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

              continue; // ⚠️ לא נכנסים ל־OTP בכלל
            }

            lockInfo = { agentId: run.agentId, templateId: run.templateId, ym };
          } else {
            console.log("[LocalRunner] lock skipped (no ym or no templateId). resolved.kind=", (resolved as any)?.kind);
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
          };

          await fn(ctx);

          // mark done if not error
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

          // mark lock error (does NOT block retry)
          if (lockInfo) {
            try {
              await markTemplateMonthLockErrorClient({ db, ...lockInfo, runId, message: msg });
            } catch (lockErr: any) {
              console.error("[LocalRunner] failed to mark lock error:", lockErr?.message || lockErr);
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
      console.error("[LocalRunner] poll loop error:", e?.message || e);
      await sleep(1500);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});