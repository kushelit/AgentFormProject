/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import os from "os";
import path from "path";
import fs from "fs";
import JSZip from "jszip";
import {adminDb, adminBucket, nowTs} from "../shared/admin";

import {pickZipEntryName} from "../shared/zipSelect";
import {parseNodeFile} from "../shared/import/parse/parseNodeFile";
import {standardizeRows} from "../shared/import/standardize";
import {buildArtifacts} from "../shared/import/buildArtifacts";
import {makeAdminAdapter} from "../shared/import/commit/adminAdapter";
import {commitRun} from "../shared/import/commit/commitRun";
import type {CommissionTemplate} from "../shared/import/types";

function safeStr(v: any) {
  return String(v ?? "").trim();
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

async function downloadStorageFileToTmp(params: {bucketNameRaw: string; storagePath: string}) {
  const {bucketNameRaw, storagePath} = params;

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
      await storage.bucket(b).file(storagePath).download({destination: tmpPath});
      return {tmpPath, usedBucket: b, candidates};
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

export async function processCommissionImportQueueImpl(event: any) {
  const db = adminDb();
  const jobId = event.params.jobId as string;

  const after = event.data?.after;
  if (!after?.exists) return;

  const queueRef = db.collection("commissionImportQueue").doc(jobId);

  // ====== 1) CLAIM ATOMIC ======
  const now = Date.now();
  const leaseMs = 10 * 60 * 1000;
  const leaseUntilMillis = now + leaseMs;

  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(queueRef);
    if (!snap.exists) return {ok: false as const, reason: "missing"};

    const job = snap.data() as any;

    const status = safeStr(job?.status);
    const leaseUntil = job?.leaseUntil?.toMillis?.() ?? 0;

    const canSteal = status === "processing" && leaseUntil > 0 && leaseUntil < now;

    if (status !== "queued" && !canSteal) {
      return {ok: false as const, reason: `status=${status}`};
    }

    if (job?.finishedAt) return {ok: false as const, reason: "already_finished"};

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
      {merge: true}
    );

    return {ok: true as const, job};
  });

  if (!claimed.ok) return;

  // ====== 2) DO WORK ======
  const job = claimed.job as any;

  const portalRunId = safeStr(job.portalRunId || jobId);
  const portalRunRef = db.collection("portalImportRuns").doc(portalRunId);

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
      {status: "error", error: {step, message, extra}, finishedAt: nowTs(), updatedAt: nowTs()},
      {merge: true}
    );
    await portalRunRef.set(
      {status: "error", error: {step, message, extra}, updatedAt: nowTs()},
      {merge: true}
    );
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

    const companySnap = await db.collection("company").doc(companyId).get();
    const companyName = companySnap.exists ? safeStr(companySnap.data()?.companyName) : "";

    const userSnap = await db.collection("users").doc(agentId).get();
    const agentName = userSnap.exists ?
      safeStr(userSnap.data()?.name || userSnap.data()?.fullName || userSnap.data()?.displayName) :
      "";

    const template: CommissionTemplate = {
      templateId,
      companyId,
      companyName,
      templateName: safeStr(tmpl?.Name || tmpl?.type),
      automationClass: safeStr(tmpl?.automationClass),
      commissionIncludesVAT: !!tmpl?.commissionIncludesVAT,
      fallbackProduct: safeStr(tmpl?.fallbackProduct) || undefined,
      fields,
    };

    const dl = await downloadStorageFileToTmp({bucketNameRaw: bucketName, storagePath});
    const tmpPath = dl.tmpPath;
    const buf = fs.readFileSync(tmpPath);

    let parseBuf = buf;
    let parseName = storagePath;

    if (path.extname(storagePath).toLowerCase() === ".zip") {
      const zip = await JSZip.loadAsync(buf);
      const files = Object.values(zip.files).filter((f) => !f.dir);
      const names = files.map((f) => f.name);

      const picked = pickZipEntryName(names, zipEntryRules || undefined);
      if (!picked.ok) {
        throw stepError("zip_select", picked.reason, {candidates: picked.candidates, zipEntryRules});
      }

      const file = files.find((f) => f.name === picked.name);
      if (!file) throw stepError("zip_select", "picked file not found", picked);

      parseName = file.name;
      const innerExt = path.extname(file.name).toLowerCase();
      parseBuf = innerExt === ".csv" ? Buffer.from(await file.async("uint8array")) : await file.async("nodebuffer");
    }

    const parsed = await parseNodeFile({fileBuffer: parseBuf, storagePathOrName: parseName, templateId, fields});
    if (!parsed.rowsCount) throw stepError("parse_file", "File parsed but has 0 rows", parsed?.debug);

    const {standardized, agentCodes} = standardizeRows({
      rawRows: parsed.rawRows,
      template,
      base: {agentId, companyId, company: companyName, templateId, sourceFileName: path.basename(parseName)},
    });
    if (!standardized.length) throw stepError("standardize", "No standardized rows produced");

    const {rowsPrepared, commissionSummaries, policySummaries, runDoc} = buildArtifacts({
      standardizedRows: standardized,
      runId: jobId,
      runMeta: {
        agentId,
        agentName,
        companyId,
        company: companyName,
        templateId,
        templateName: template.templateName,
        createdAt: nowTs(),
        source: "portalRunner",
        portalRunId,
      },
    });

    const adapter = makeAdminAdapter(db as any);

    await commitRun({adapter, runDoc, rowsPrepared, commissionSummaries, policySummaries, agentCodes});

    await queueRef.set(
      {
        status: "success",
        finishedAt: nowTs(),
        updatedAt: nowTs(),
        externalCount: rowsPrepared.length,
        commissionSummariesCount: commissionSummaries.length,
        policySummariesCount: policySummaries.length,
      },
      {merge: true}
    );

    await portalRunRef.set({status: "success", updatedAt: nowTs()}, {merge: true});

    try {
      fs.unlinkSync(tmpPath);
    } catch (e) {
      // ignore
    }
  } catch (e: any) {
    await fail(e);
  }
}
