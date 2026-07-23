/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import os from "os";
import path from "path";
import fs from "fs";
import JSZip from "jszip";
import { adminDb, adminBucket, nowTs } from "../shared/admin";

import { pickZipEntryName } from "../shared/zipSelect";
import { parseNodeFile } from "../shared/import/parse/parseNodeFile";
import { standardizeRows } from "../shared/import/standardize";
import { buildArtifacts } from "../shared/import/buildArtifacts";
import { makeAdminAdapter } from "../shared/import/commit/adminAdapter";
import { commitRun } from "../shared/import/commit/commitRun";
import type { CommissionTemplate } from "../shared/import/types";

function safeStr(v: any) {
  return String(v ?? "").trim();
}

function getPreviousMonthStr(): string {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() ; // 0-11, ולכן זה כבר "החודש הקודם" במספור 1-12

  if (month === 0) {
    year -= 1;
    month = 12;
  }

  return `${year}-${String(month).padStart(2, "0")}`;
}


function getTwoMonthsAgoStr(): string {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() - 1; // מינוס 2 (getMonth הוא 0-based)

  if (month <= 0) {
    month += 12;
    year -= 1;
  }

  return `${year}-${String(month).padStart(2, "0")}`;
}


function normalizeBucketName(b: string) {
  const s = String(b || "").trim().replace(/^gs:\/\//, "");
  if (!s) return "";
  if (s.endsWith(".firebasestorage.app")) return s.replace(".firebasestorage.app", ".appspot.com");
  return s;
}

function stepError(step: string, message: string, extra?: any) {
  const e: any = new Error(message);
  e.step = step;
  if (extra) e.extra = extra;
  return e;
}


async function finishAsEmpty(params: {
  db: FirebaseFirestore.Firestore;
  queueRef: FirebaseFirestore.DocumentReference;
  portalRunId: string;
  jobId: string;
  templateId: string;
  message: string;
  reason: string;
  extra?: any;
  templateName?: string;
}) {
  const { db, queueRef, portalRunId, jobId, templateId,templateName, message, reason, extra } = params;

  await queueRef.set(
    {
      status: "skipped",
      finishedAt: nowTs(),
      updatedAt: nowTs(),
      externalCount: 0,
      commissionSummariesCount: 0,
      policySummariesCount: 0,
      result: {
        type: "empty_report",
        reason,
        message,
        ...extra,
      },
    },
    { merge: true }
  );

  await updatePortalRunJobState({
    db,
    portalRunId,
    jobId,
    patch: {
      status: "skipped",
      templateId,
      templateName: templateName || templateId,
      finishedAt: nowTs(),
      externalCount: 0,
      commissionSummariesCount: 0,
      policySummariesCount: 0,
      result: {
        type: "empty_report",
        reason,
        message,
        ...extra,
      },
    },
  });
}




async function downloadStorageFileToTmp(params: { bucketNameRaw: string; storagePath: string }) {
  const { bucketNameRaw, storagePath } = params;

  const defaultB = adminBucket();
  const storage = (defaultB as any).storage;

  const rawClean = safeStr(bucketNameRaw).replace(/^gs:\/\//, "");
  const normalized = normalizeBucketName(bucketNameRaw);
  const defaultBucket = defaultB.name;

  const candidates = Array.from(new Set([normalized, rawClean, defaultBucket].filter(Boolean)));

  const tmpPath = path.join(os.tmpdir(), `${Date.now()}_${path.basename(storagePath)}`);
  let lastErr: any = null;

  for (const b of candidates) {
    try {
      await storage.bucket(b).file(storagePath).download({ destination: tmpPath });
      return { tmpPath, usedBucket: b, candidates };
    } catch (e: any) {
      lastErr = e;
    }
  }

  throw new Error(
    `Download failed for all buckets: ${JSON.stringify(candidates)} :: ${String(
      lastErr?.message || lastErr
    )}`
  );
}

async function updatePortalRunJobState(params: {
  db: FirebaseFirestore.Firestore;
  portalRunId: string;
  jobId: string;
  patch: any;
  aggregate?: { finalStatus?: "success" | "error" };
}) {
  const { db, portalRunId, jobId, patch, aggregate } = params;
  const portalRunRef = db.collection("portalImportRuns").doc(portalRunId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(portalRunRef);
    if (!snap.exists) return;

    const data = snap.data() as any;
    const jobIds: string[] = Array.isArray(data?.queue?.jobIds)
      ? data.queue.jobIds
      : [];

    tx.set(
      portalRunRef,
      {
        queue: {
          ...(data.queue || {}),
          jobs: {
            ...(data?.queue?.jobs || {}),
            [jobId]: {
              ...(data?.queue?.jobs?.[jobId] || {}),
              ...patch,
              updatedAt: nowTs(),
            },
          },
        },
        updatedAt: nowTs(),
      },
      { merge: true }
    );

    if (!jobIds.length && aggregate?.finalStatus) {
      tx.set(
        portalRunRef,
        {
          status: aggregate.finalStatus,
          step: aggregate.finalStatus === "success" ? "import_done" : "import_error",
          updatedAt: nowTs(),
        },
        { merge: true }
      );
    }
  });

  // ✅ אחרי שמירת ה-job, בודקים את האמת מתוך commissionImportQueue
  const freshRunSnap = await portalRunRef.get();
  if (!freshRunSnap.exists) return;

  const freshRun = freshRunSnap.data() as any;
  const jobIds: string[] = Array.isArray(freshRun?.queue?.jobIds)
    ? freshRun.queue.jobIds
    : [];

  if (!jobIds.length) return;

  const jobSnaps = await Promise.all(
    jobIds.map((id) => db.collection("commissionImportQueue").doc(id).get())
  );

  const statuses = jobSnaps.map((snap) => {
    if (!snap.exists) return "missing";
    return safeStr(snap.data()?.status);
  });

  const allFinishedOk =
    statuses.length > 0 &&
    statuses.every((s) => s === "success" || s === "skipped");

  const anyError = statuses.some((s) => s === "error" || s === "missing");

  const pendingJobIds = jobIds.filter((id, index) => {
    const st = statuses[index];
    return st !== "success" && st !== "skipped" && st !== "error";
  });

 
  if (allFinishedOk) {
  // חישוב דוחות חסרים לפי תבניות פעילות
  const companyId = safeStr(freshRun.companyId);
  let reportsSummary: any[] = [];

  if (companyId) {
  const expectedSnap = await db.collection("commissionTemplates")
      .where("companyId", "==", companyId)
      .where("isactive", "==", true)
      .get();

   // סוכן רגיל (לא בית סוכן) לא אמור לצפות לדוחות שמסומנים agencyHouseOnly -
    // הם פשוט לא רלוונטיים לו ולא צריכים להופיע כ"חסרים".
    // משתמשים ב-agentId מתוך מסמך ה-portalRun עצמו (freshRun) - לא ממשתנה
    // חיצוני, כי זו פונקציה נפרדת (updatePortalRunJobState) בלי גישה אליו.
    const runAgentId = safeStr(freshRun?.agentId);
    const userSnap = runAgentId ? await db.collection("users").doc(runAgentId).get() : null;
    const isAgencyHouse = userSnap?.exists ? !!userSnap.data()?.isAgencyHouse : false;

    const expectedTemplateIds = expectedSnap.docs
  .filter(d => {
    const data = d.data();
    if (data?.agencyHouseOnly && !isAgencyHouse) return false;
    if (data?.excludeForAgencyHouse && isAgencyHouse) return false;
    return true;
  })
  .map(d => d.id);

  reportsSummary = expectedTemplateIds.map(templateId => {
  const templateDoc = expectedSnap.docs.find(d => d.id === templateId);
const templateName = safeStr(templateDoc?.data()?.Name || templateDoc?.data()?.type) || templateId;
  const job = jobSnaps.find(s => safeStr(s.exists ? s.data()?.templateId : "") === templateId);
  if (!job || !job.exists) return { templateId, templateName, status: "not_downloaded" };
  const jobStatus = safeStr(job.data()?.status);
  if (jobStatus === "success") return { templateId, templateName, status: "ok" };
  if (jobStatus === "skipped") return { templateId, templateName, status: "skipped", reason: safeStr(job.data()?.result?.reason) };
  if (jobStatus === "error") return { templateId, templateName, status: "error", message: safeStr(job.data()?.error?.message) };
  return { templateId, templateName, status: "unknown" };
});
  }

  await portalRunRef.set(
    {
      status: "success",
      step: "import_done",
      reportsSummary,
      queue: {
        ...(freshRun.queue || {}),
        pendingJobIds: [],
        lastAggregateCheckAt: nowTs(),
      },
      updatedAt: nowTs(),
    },
    { merge: true }
  );
}
  else if (anyError) {
    await portalRunRef.set(
      {
        status: "error",
        step: "import_error",
        queue: {
          ...(freshRun.queue || {}),
          pendingJobIds,
          lastAggregateCheckAt: nowTs(),
        },
        updatedAt: nowTs(),
      },
      { merge: true }
    );
  } else {
    await portalRunRef.set(
      {
        queue: {
          ...(freshRun.queue || {}),
          pendingJobIds,
          lastAggregateCheckAt: nowTs(),
        },
        updatedAt: nowTs(),
      },
      { merge: true }
    );
  }
}

async function isAutomationEnabled(db: FirebaseFirestore.Firestore): Promise<boolean> {
  try {
    const snap = await db.collection("systemFlags").doc("automation").get();
    return snap.exists ? !!snap.data()?.enabled : false;
  } catch {
    return false; // default safe
  }
}



export async function processCommissionImportQueueImpl(event: any) {
  const db = adminDb();

  // ✅ Feature flag: stop worker unless enabled
  const enabled = await isAutomationEnabled(db as any);
  if (!enabled) return;

  const jobId = event.params.jobId as string;
let requestedReportMonth: string | undefined;

 const after = event.data;
if (!after?.exists) return;

  const queueRef = db.collection("commissionImportQueue").doc(jobId);

  // ====== 1) CLAIM ATOMIC ======
  const now = Date.now();
  const leaseMs = 10 * 60 * 1000;
  const leaseUntilMillis = now + leaseMs;

  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(queueRef);
    if (!snap.exists) return { ok: false as const, reason: "missing" };

    const job = snap.data() as any;

    const status = safeStr(job?.status);
    const leaseUntil = job?.leaseUntil?.toMillis?.() ?? 0;

    const canSteal = status === "processing" && leaseUntil > 0 && leaseUntil < now;

    if (status !== "queued" && !canSteal) {
      return { ok: false as const, reason: `status=${status}` };
    }

    if (job?.finishedAt) return { ok: false as const, reason: "already_finished" };

    tx.set(
      queueRef,
      {
        status: "processing",
        startedAt: job?.startedAt ?? nowTs(),
        lockedAt: nowTs(),
        leaseUntil: new Date(leaseUntilMillis),
        lockedBy: process.env.K_REVISION || "unknown",
        updatedAt: nowTs(),
      },
      { merge: true }
    );

    return { ok: true as const, job };
  });

  if (!claimed.ok) return;

  // ====== 2) DO WORK ======
  const job = claimed.job as any;

  // ✅ portalRunId הוא ה-run המקורי (לא jobId)
  const portalRunId = safeStr(job.portalRunId) || safeStr(job.portalRunId || "");
  // fallback אחורה (אם פעם portalRunId לא נשמר)
  const effectivePortalRunId = portalRunId || safeStr(jobId.split("_")[0] || jobId);

  const templateId = safeStr(job.templateId);
  const agentId = safeStr(job.agentId);
  const companyId = safeStr(job.companyId);
  const storagePath = safeStr(job?.file?.storagePath);

  const rawBucket = safeStr(job?.file?.bucket) || adminBucket().name;
  const bucketName = normalizeBucketName(rawBucket);

  const fail = async (err: any) => {
    const message = safeStr(err?.message || err);
    const step = safeStr(err?.step) || "worker";
    const extra = err?.extra || null;

    await queueRef.set(
      { status: "error", error: { step, message, extra }, finishedAt: nowTs(), updatedAt: nowTs() },
      { merge: true }
    );

    // ✅ לא “לדרוס” סטטוס לריצה כולה באופן עיוור — נשמור סטטוס פר-job
    await updatePortalRunJobState({
      db: db as any,
      portalRunId: effectivePortalRunId,
      jobId,
      patch: { status: "error", error: { step, message, extra }, finishedAt: nowTs() },
      aggregate: { finalStatus: "error" },
    });
  };

  try {
    if (!templateId || !agentId || !companyId || !storagePath) {
      throw stepError("validate_job", "Missing required job fields", {
        templateId,
        agentId,
        companyId,
        storagePath,
      });
    }

    const tmplSnap = await db.collection("commissionTemplates").doc(templateId).get();
    if (!tmplSnap.exists) throw stepError("load_template", `commissionTemplates/${templateId} not found`);

    const tmpl = tmplSnap.data() as any;
    const fields: Record<string, string> = tmpl?.fields || {};
    if (!Object.keys(fields).length) throw stepError("load_template", `Template ${templateId} has empty fields`);

    const zipEntryRules = tmpl?.zipEntryRules || null;
    const missingZipEntryBehavior = safeStr(tmpl?.missingZipEntryBehavior || "error");
    
    const companySnap = await db.collection("company").doc(companyId).get();
    const companyName = companySnap.exists ? safeStr(companySnap.data()?.companyName) : "";

    const userSnap = await db.collection("users").doc(agentId).get();
    const agentName = userSnap.exists
      ? safeStr(userSnap.data()?.name || userSnap.data()?.fullName || userSnap.data()?.displayName)
      : "";

const template: CommissionTemplate = {
  templateId,
  companyId,
  companyName,
  templateName: safeStr(tmpl?.Name || tmpl?.type),
  automationClass: safeStr(tmpl?.automationClass),
  commissionIncludesVAT: !!tmpl?.commissionIncludesVAT,
  fallbackProduct: safeStr(tmpl?.fallbackProduct) || undefined,
  fields,
  missingZipEntryBehavior: (missingZipEntryBehavior as "error" | "skip"),
    hekefType: tmpl?.hekefType || undefined,
};

// ====== מיטב: כמה קבצים עם אותו templateId ======
const storagePathsToProcess: string[] = [storagePath];

if (templateId === "meitav_insurance") {
  const portalRunSnap = await db.collection("portalImportRuns").doc(effectivePortalRunId).get();
  const allDownloads: any[] = portalRunSnap.data()?.downloads || [];
  const extraPaths = allDownloads
    .filter((d: any) => safeStr(d.templateId) === templateId)
    .map((d: any) => safeStr(d.storagePath))
    .filter((p) => p && p !== storagePath);
  storagePathsToProcess.push(...extraPaths);
}

let allFinalRows: any[] = [];
let allAgentCodes: string[] = [];
const tmpPaths: string[] = [];

  for (const currentStoragePath of storagePathsToProcess) {
      try {
    const dl = await downloadStorageFileToTmp({ bucketNameRaw: bucketName, storagePath: currentStoragePath });
    const tmpPath = dl.tmpPath;
    tmpPaths.push(tmpPath);
    const buf = fs.readFileSync(tmpPath);

let parseBuf: Buffer = Buffer.from(buf);
let parseName = currentStoragePath;

if (path.extname(currentStoragePath).toLowerCase() === ".zip") {
  const zip = await JSZip.loadAsync(buf);
  const files = Object.values(zip.files).filter((f) => !f.dir);
  const names = files.map((f) => f.name);

const picked = pickZipEntryName(names, zipEntryRules || undefined);

if (!picked.ok) {
  const shouldSkip =
    picked.reason === "zip_rules_no_match" &&
    missingZipEntryBehavior === "skip";

  if (shouldSkip) {
    await queueRef.set(
      {
        status: "skipped",
        finishedAt: nowTs(),
        updatedAt: nowTs(),
        result: {
          reason: "missing_zip_entry_skipped",
          zipReason: picked.reason,
          candidates: picked.candidates || [],
          templateId,
        },
      },
      { merge: true }
    );

    await updatePortalRunJobState({
      db: db as any,
      portalRunId: effectivePortalRunId,
      jobId,
      patch: {
        status: "skipped",
        reason: "missing_zip_entry_skipped",
        finishedAt: nowTs(),
        templateId,
       templateName: safeStr(template.templateName) || templateId,
        extra: {
          zipReason: picked.reason,
          candidates: picked.candidates || [],
          zipEntryRules,
        },
      },
    });

    try {
      fs.unlinkSync(tmpPath);
    } catch (e) {
      // ignore
    }

    return;
  }

  throw stepError("zip_select", picked.reason, {
    candidates: picked.candidates,
    zipEntryRules,
  });
}

  const file = files.find((f) => f.name === picked.name);
  if (!file) throw stepError("zip_select", "picked file not found", picked);

  parseName = file.name;
  const innerExt = path.extname(file.name).toLowerCase();

  if (innerExt === ".csv") {
    const u8 = await file.async("uint8array");
    parseBuf = Buffer.from(u8);
  } else {
    const nb = await file.async("nodebuffer");
    parseBuf = Buffer.from(nb);
  }
}
    const parsed = await parseNodeFile({ fileBuffer: parseBuf, storagePathOrName: parseName, templateId, fields });
    // if (!parsed.rowsCount) throw stepError("parse_file", "File parsed but has 0 rows", parsed?.debug);
if (!parsed.rowsCount) {
  await finishAsEmpty({
    db,
    queueRef,
    portalRunId: effectivePortalRunId,
    jobId,
    templateId,
   templateName: safeStr(template.templateName) || templateId,
    message: "הדוח נקלט אך מכיל 0 שורות",
    reason: "parse_file_empty",
    extra: { debug: parsed?.debug },
  });
  return;
}
    const { standardized, agentCodes } = standardizeRows({
      rawRows: parsed.rawRows,
      template,
      base: {
        agentId,
        companyId,
        company: companyName,
        templateId,
        sourceFileName: path.basename(parseName),
      },
    });

    
    // if (!standardized.length) throw stepError("standardize", "No standardized rows produced");
if (!standardized.length) {
  await finishAsEmpty({
    db,
    queueRef,
    portalRunId: effectivePortalRunId,
    jobId,
    templateId,
    templateName: safeStr(template.templateName) || templateId,
    message: "הדוח נקלט אך לאחר עיבוד לא נמצאו שורות",
    reason: "standardize_empty",
  });
  return;
}

let rowsForThisFile = [...standardized];
// מור: באוטומטי תמיד כופים חודש דיווח = חודש קודם
if (templateId === "mor_insurance") {
const reportMonth = requestedReportMonth || getTwoMonthsAgoStr();

  rowsForThisFile = rowsForThisFile.map((row: any) => ({
    ...row,
    reportMonth,
  }));
}
if (templateId === "ayalon_insurance") {
  const targetMonth = getPreviousMonthStr();

  rowsForThisFile = rowsForThisFile.filter((row: any) => {
    return safeStr(row.reportMonth) === targetMonth;
  });

  if (!rowsForThisFile.length) {
    await finishAsEmpty({
      db,
      queueRef,
      portalRunId: effectivePortalRunId,
      jobId,
      templateId,
    templateName: safeStr(template.templateName) || templateId,
      message: `הדוח נקלט אך אין נתונים עבור ${targetMonth}`,
      reason: "filter_month_empty",
    });
    return;
  }
}

if (templateId === "analyst_insurance") {
const targetMonth = requestedReportMonth || getTwoMonthsAgoStr();

  rowsForThisFile = rowsForThisFile.filter((row: any) => {
    return safeStr(row.reportMonth) === targetMonth;
  });

  if (!rowsForThisFile.length) {
    await finishAsEmpty({
      db,
      queueRef,
      portalRunId: effectivePortalRunId,
      jobId,
      templateId,
    templateName: safeStr(template.templateName) || templateId,
      message: `הדוח נקלט אך אין נתונים עבור ${targetMonth}`,
      reason: "filter_month_empty",
    });
    return;
  }
}   

if (templateId === "hacshara_insurance") {
  const targetMonth = getPreviousMonthStr();

  rowsForThisFile = rowsForThisFile.filter((row: any) => {
    return safeStr(row.reportMonth) === targetMonth;
  });

  if (!rowsForThisFile.length) {
    await finishAsEmpty({
      db,
      queueRef,
      portalRunId: effectivePortalRunId,
      jobId,
      templateId,
      templateName: safeStr(template.templateName) || templateId,
      message: `הדוח נקלט אך אין נתונים עבור ${targetMonth}`,
      reason: "filter_month_empty",
    });
    return;
  }
}
if (templateId === "hacshara_zvira") {
  const targetMonth = getPreviousMonthStr();

  rowsForThisFile = rowsForThisFile.filter((row: any) => {
    return safeStr(row.reportMonth) === targetMonth;
  });

  if (!rowsForThisFile.length) {
    await finishAsEmpty({
      db,
      queueRef,
      portalRunId: effectivePortalRunId,
      jobId,
      templateId,
      templateName: safeStr(template.templateName) || templateId,
      message: `הדוח נקלט אך אין נתונים עבור ${targetMonth}`,
      reason: "filter_month_empty",
    });
    return;
  }
}
if (templateId === "harel_tzvira") {
  // 🔧 רק M-2 — הדוח תמיד מכיל שני חודשים, אנחנו לוקחים רק את הנכון
  const targetMonth = getTwoMonthsAgoStr();

  rowsForThisFile = rowsForThisFile.filter((row: any) => {
    return safeStr(row.reportMonth) === targetMonth;
  });

  if (!rowsForThisFile.length) {
    await finishAsEmpty({
      db,
      queueRef,
      portalRunId: effectivePortalRunId,
      jobId,
      templateId,
      templateName: safeStr(template.templateName) || templateId,
      message: `הדוח נקלט אך אין נתונים עבור ${targetMonth}`,
      reason: "filter_month_empty",
    });
    return;
  }
}
// סינון לפי קודי סוכן מותרים (agentPortalFilters)
const portalFilterSnap = await db
  .collection("agentPortalFilters")
  .doc(`${agentId}_${companyId}`)
  .get();

//console.log(`[portalFilter] doc=${agentId}_${companyId} exists=${portalFilterSnap.exists}`);

if (portalFilterSnap.exists) {
  const allowedCodes: string[] = (portalFilterSnap.data()?.agentCodes || [])
    .map((c: any) => safeStr(c))
    .filter(Boolean);

 //   console.log(`[portalFilter] allowedCodes=${JSON.stringify(allowedCodes)}`);
 // console.log(`[portalFilter] rowsBeforeFilter=${rowsForThisFile.length}`);

  if (allowedCodes.length > 0) {
    rowsForThisFile = rowsForThisFile.filter((row: any) =>
      allowedCodes.includes(safeStr(row.agentCode))
    );
  console.log(`[portalFilter] rowsAfterFilter=${rowsForThisFile.length}`);

    if (!rowsForThisFile.length) {
      await finishAsEmpty({
        db,
        queueRef,
        portalRunId: effectivePortalRunId,
        jobId,
        templateId,
        templateName: safeStr(template.templateName) || templateId,
        message: "הדוח נקלט אך אף מספר סוכן לא תואם את הפילטר המוגדר",
        reason: "portal_filter_empty",
      });
      return;
    }
  }
}



allFinalRows = allFinalRows.concat(rowsForThisFile);
allAgentCodes = Array.from(new Set([...allAgentCodes, ...agentCodes]));

      } catch (fileErr: any) {
        console.error(`[processQueue] Error processing file ${currentStoragePath}:`, fileErr.message);
      }
    } // סגירת for

const finalRows = allFinalRows;

// ✅ runId = jobId (ייחודי לכל תבנית/קובץ)
   // 🔧 שלוף את ה-ym מה-portalImportRun לפני buildArtifacts
let resolvedYm: string | undefined;
const portalRunForYm = await db.collection("portalImportRuns").doc(effectivePortalRunId).get();
if (portalRunForYm.exists) {
  resolvedYm = safeStr(portalRunForYm.data()?.resolvedWindow?.ym) || undefined;
  requestedReportMonth = safeStr(portalRunForYm.data()?.requestedReportMonth) || undefined;
}

const { rowsPrepared, commissionSummaries, policySummaries, runDoc } = buildArtifacts({
      standardizedRows: finalRows,
      runId: jobId,
      runMeta: {
        agentId,
        agentName,
        companyId,
        company: companyName,
        templateId,
       templateName: safeStr(template.templateName) || templateId,
        createdAt: nowTs(),
        source: "portalRunner",
        portalRunId: effectivePortalRunId,
        ym: resolvedYm, // 🔧 חדש — חודש פרסום לכתיבה ל-ymCommissionSummaries
      },
    });

    const adapter = makeAdminAdapter(db as any);
    await commitRun({ adapter, runDoc, rowsPrepared, commissionSummaries, policySummaries, agentCodes: allAgentCodes });

    await queueRef.set(
      {
        status: "success",
        finishedAt: nowTs(),
        updatedAt: nowTs(),
        externalCount: rowsPrepared.length,
        commissionSummariesCount: commissionSummaries.length,
        policySummariesCount: policySummaries.length,
      },
      { merge: true }
    );

    // ✅ סטטוס פר-job + אגרגציה ברמת portalRun
    await updatePortalRunJobState({
      db: db as any,
      portalRunId: effectivePortalRunId,
      jobId,
      patch: {
        status: "success",
        finishedAt: nowTs(),
        externalCount: rowsPrepared.length,
        commissionSummariesCount: commissionSummaries.length,
        policySummariesCount: policySummaries.length,
        templateId,
      templateName: safeStr(template.templateName) || templateId,
      },
      aggregate: { finalStatus: "success" },
    });

   for (const tmpPath of tmpPaths) {
      try { fs.unlinkSync(tmpPath); } catch {}
    }
 } catch (e: any) {
    if (safeStr(e?.step) === "template_mismatch") {
      await finishAsEmpty({
        db,
        queueRef,
        portalRunId: effectivePortalRunId,
        jobId,
        templateId,
        templateName: templateId || "",
        message: "הדוח ריק או לא תואם את התבנית",
        reason: "template_mismatch",
        extra: { debug: e?.debug },
      });
      return;
    }
    await fail(e);
  }
}