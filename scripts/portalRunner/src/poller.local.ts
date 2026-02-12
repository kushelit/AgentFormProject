// scripts/portalRunner/src/poller.local.ts
import "dotenv/config";
import crypto from "crypto";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

import { initFirebaseClient } from "./firebaseClient";
import { loginIfNeeded } from "./loginCli"; // ✅ חדש (Session לקובץ + fallback לאימייל/סיסמה)
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

async function main() {
  // ✅ חשוב: firebaseClient צריך להחזיר גם functions (כדי לאפשר session without password בהפעלות הבאות)
  const { auth, db, storage, functions } = initFirebaseClient();

  // ✅ מוצרי: לא צריך להתחבר כל פעם. אם יש session.json -> יעלה מחובר.
  // אם אין / נכשל -> יבקש פעם אחת Email+Password וישמור refreshToken.
  const agentId = await loginIfNeeded({ auth, functions });

  const runnerId = process.env.RUNNER_ID || `local_${agentId}_${crypto.randomUUID().slice(0, 8)}`;
  const pollMs = pickPollIntervalMs();

  const env: RunnerEnv = {
    RUNNER_ID: runnerId,
    HEADLESS: process.env.HEADLESS,
    DOWNLOAD_DIR: process.env.DOWNLOAD_DIR,
    CLAL_PORTAL_URL: process.env.CLAL_PORTAL_URL,
    MIGDAL_PORTAL_URL: process.env.MIGDAL_PORTAL_URL,
    MIGDAL_DEBUG: process.env.MIGDAL_DEBUG,
  
    FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET, // ✅ חדש
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
            admin: null,
          };
          

          await fn(ctx);
        } catch (e: any) {
          await setStatusClient(db, runId, {
            status: "error",
            step: "runner",
            error: { step: "runner", message: String(e?.message || e) },
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
