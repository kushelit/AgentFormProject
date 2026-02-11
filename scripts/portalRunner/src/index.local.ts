// scripts/portalRunner/src/index.ts
import "dotenv/config";
import fs from "fs";
import path from "path";
import admin from "firebase-admin";
import { providers } from "./providers";
import type { RunDoc, RunnerCtx, RunnerEnv } from "./types";
import { resolveWindow, labelFromYm } from "./window";

function initAdmin() {
  if (admin.apps.length) return;

  const keyPath = process.env.FIREBASE_ADMIN_KEY_PATH;
  if (!keyPath) throw new Error("Missing FIREBASE_ADMIN_KEY_PATH");

  const fullPath = path.resolve(process.cwd(), keyPath);
  const rawFile = fs.readFileSync(fullPath, "utf8");
  const parsed: any = JSON.parse(rawFile);

  console.log("[Runner] serviceAccount project_id:", parsed.project_id);
  console.log("[Runner] serviceAccount client_email:", parsed.client_email);

  admin.initializeApp({
    credential: admin.credential.cert(parsed),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function claimRun(runId: string, runnerId: string): Promise<boolean> {
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

async function setStatus(runId: string, patch: any) {
  const db = admin.firestore();
  await db
    .collection("portalImportRuns")
    .doc(runId)
    .set({ ...patch, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
}

async function pollOtp(runId: string, timeoutMs = 3 * 60 * 1000): Promise<string> {
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

async function clearOtp(runId: string) {
  const db = admin.firestore();
  const ref = db.collection("portalImportRuns").doc(runId);

  await ref.set(
    {
      otp: {
        state: "none",
        value: admin.firestore.FieldValue.delete(),
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

function envBool(v: string | undefined, fallback: boolean) {
  if (v == null || v === "") return fallback;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y" || s === "on";
}

async function main() {
  console.log("[env] has FIREBASE_ADMIN_KEY_PATH?", !!process.env.FIREBASE_ADMIN_KEY_PATH);
  console.log("[env] has BUCKET?", !!process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);

  initAdmin();

  const app = admin.app();
  console.log("[Runner] projectId:", app.options.projectId);
  console.log("[Runner] storageBucket:", app.options.storageBucket);

  const db = admin.firestore();
  console.log("[Runner] firestore database:", db.databaseId);

  const runnerId = process.env.RUNNER_ID || `runner_${Math.random().toString(16).slice(2)}`;

  const env: RunnerEnv = {
    FIREBASE_ADMIN_KEY_PATH: process.env.FIREBASE_ADMIN_KEY_PATH,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,

    RUNNER_ID: process.env.RUNNER_ID,
    HEADLESS: process.env.HEADLESS,
    DOWNLOAD_DIR: process.env.DOWNLOAD_DIR,

    CLAL_PORTAL_URL: process.env.CLAL_PORTAL_URL,
  };

  console.log("[Runner] started. runnerId=", runnerId);

  while (true) {
    const snap = await db
      .collection("portalImportRuns")
      .where("status", "==", "queued")
      .orderBy("createdAt", "asc")
      .limit(5)
      .get();

    if (snap.empty) {
      await sleep(1500);
      continue;
    }

    for (const docSnap of snap.docs) {
      const runId = docSnap.id;
      const run = docSnap.data() as RunDoc;

      const ok = await claimRun(runId, runnerId);
      if (!ok) continue;

      console.log("[Runner] claimed run:", runId, run.automationClass);

      try {
        const fn = providers[run.automationClass];
        if (!fn) throw new Error(`Unknown automationClass: ${run.automationClass}`);

        // resolve window + monthLabel (תצוגה/דיבאג)
        const resolved = resolveWindow(new Date(), run.requestedWindow);
        const monthLabel =
          resolved.kind === "month" ? (resolved.label || labelFromYm(resolved.ym)) : resolved.label;

          await setStatus(runId, {
            resolvedWindow: resolved,
            monthLabel: run.monthLabel || monthLabel,
          });
          

        const ctx: RunnerCtx = {
          runId,
          run: { ...run, resolvedWindow: resolved, monthLabel },
          env,
          setStatus,
          pollOtp,
          clearOtp,
          admin, // ✅ זה היה חסר
        };

        await fn(ctx);

        // אם provider לא סימן done בעצמו, נשאיר את זה פתוח (לא מכריחים)
      } catch (e: any) {
        await setStatus(runId, {
          status: "error",
          error: { step: "runner", message: String(e?.message || e) },
        });
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
