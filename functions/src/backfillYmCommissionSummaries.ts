// ═══════════════════════════════════════════════════════════════════
// functions/src/backfillYmCommissionSummaries.ts
// Cloud Function חד-פעמי להפעלה מדף האדמין.
// מוגן: רק admin יכול לקרוא לו.
// ═══════════════════════════════════════════════════════════════════

import {onCall, HttpsError} from "firebase-functions/v2/https";
import {adminDb, ensureAdminApp} from "./shared/admin";
import {FieldValue} from "firebase-admin/firestore";
import {FUNCTIONS_REGION} from "./shared/region";

ensureAdminApp();

const FROM_YM = "2026-03";
const CHUNK_SIZE = 400;
const IN_LIMIT = 30;

function roundTo2(num: number) {
  return Math.round(num * 100) / 100;
}

function normalizeAgentCode(v: any): string {
  return String(v ?? "").trim();
}

function sanitizeMonth(v: any): string {
  return String(v ?? "").replace(/\//g, "-").trim();
}

function buildYmSummaryId(s: {
  agentId: string;
  agentCode: string;
  ym: string;
  templateId: string;
  companyId: string;
  reportMonth: string;
}): string {
  return `${s.agentId}_${normalizeAgentCode(s.agentCode)}_${s.ym}_${s.templateId}_${s.companyId}_${sanitizeMonth(s.reportMonth)}`;
}

async function fetchExternalByJobIds(
  jobIds: string[],
  agentId: string
): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  const db = adminDb();
  const unique = Array.from(new Set(jobIds.filter(Boolean)));
  if (!unique.length) return [];

  const results: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  for (let i = 0; i < unique.length; i += IN_LIMIT) {
    const chunk = unique.slice(i, i + IN_LIMIT);
    const snap = await db
      .collection("externalCommissions")
      .where("runId", "in", chunk)
      .where("agentId", "==", agentId)
      .get();
    results.push(...snap.docs);
  }
  return results;
}

async function writeInChunks(
  items: {id: string; data: Record<string, any>}[]
) {
  const db = adminDb();
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const slice = items.slice(i, i + CHUNK_SIZE);
    const batch = db.batch();
    for (const {id, data} of slice) {
      const ref = db.collection("ymCommissionSummaries").doc(id);
      batch.set(ref, data);
    }
    await batch.commit();
  }
}

export const backfillYmCommissionSummaries = onCall(
  {
    timeoutSeconds: 3600, 
    memory: "1GiB",
    region: FUNCTIONS_REGION,
  },
  async (req) => {
    // ── אימות: רק admin ─────────────────────────────────────────
    const callerUid = req.auth?.uid;
    if (!callerUid) throw new HttpsError("unauthenticated", "Login required");

    const db = adminDb();
    const userSnap = await db.collection("users").doc(callerUid).get();
    if (!userSnap.exists || userSnap.data()?.role !== "admin") {
      throw new HttpsError("permission-denied", "Admin only");
    }

    // ── לוגיקת ה-backfill ────────────────────────────────────────
    const templatesSnap = await db
      .collection("commissionTemplates")
      .where("isactive", "==", true)
      .get();

    const hekefTemplateIds = new Set(
      templatesSnap.docs
        .filter((d) => !!d.data().hekefType)
        .map((d) => d.id)
    );

    const runsSnap = await db
      .collection("portalImportRuns")
      .where("resolvedWindow.ym", ">=", FROM_YM)
      .where("status", "==", "success")
      .get();

    let processed = 0;
    let skipped = 0;
    let totalDocsWritten = 0;
    let errors = 0;

    for (const runDoc of runsSnap.docs) {
      const run = runDoc.data() as any;
      const ym = String(run?.resolvedWindow?.ym || "");
      const agentId = String(run?.agentId || "");

      if (String(run?.automationClass || "") === "self_update") {
        skipped++;
        continue;
      }

      const jobIds: string[] = run?.queue?.jobIds || [];
      if (!jobIds.length || !ym || !agentId) {
        skipped++;
        continue;
      }

      try {
        const externalDocs = await fetchExternalByJobIds(jobIds, agentId);

        if (!externalDocs.length) {
          skipped++;
          continue;
        }

        type SummaryAcc = {
          agentId: string;
          agentCode: string;
          ym: string;
          templateId: string;
          companyId: string;
          company: string;
          reportMonth: string;
          totalCommissionAmount: number;
          totalPremiumAmount: number;
          runId: string;
        };

        const accMap = new Map<string, SummaryAcc>();

        for (const extDoc of externalDocs) {
          const r = extDoc.data() as any;
          const tid = String(r.templateId || "");
          if (hekefTemplateIds.has(tid)) continue;

          const agentCode = normalizeAgentCode(r.agentCode);
          const reportMonth = sanitizeMonth(r.reportMonth);
          const companyId = String(r.companyId || "");
          const company = String(r.company || "");
          const runId = String(r.runId || "");

          if (!agentCode || !reportMonth || !tid || !companyId) continue;

          const id = buildYmSummaryId({agentId, agentCode, ym, templateId: tid, companyId, reportMonth});

          if (!accMap.has(id)) {
            accMap.set(id, {
              agentId, agentCode, ym, templateId: tid,
              companyId, company, reportMonth,
              totalCommissionAmount: 0,
              totalPremiumAmount: 0,
              runId,
            });
          }

          const acc = accMap.get(id)!;
          acc.totalCommissionAmount += Number(r.commissionAmount || 0);
          acc.totalPremiumAmount += Number(r.premium || 0);
        }

        if (!accMap.size) {
          skipped++;
          continue;
        }

        const toWrite = Array.from(accMap.entries()).map(([id, acc]) => ({
          id,
          data: {
            ...acc,
            totalCommissionAmount: roundTo2(acc.totalCommissionAmount),
            totalPremiumAmount: roundTo2(acc.totalPremiumAmount),
            updatedAt: FieldValue.serverTimestamp(),
          },
        }));

        await writeInChunks(toWrite);
        totalDocsWritten += toWrite.length;
        processed++;
      } catch (err: any) {
        console.error(`[backfill] שגיאה בריצה ${runDoc.id}:`, err.message);
        errors++;
      }
    }

    return {
      success: true,
      processed,
      skipped,
      errors,
      totalDocsWritten,
    };
  }
);