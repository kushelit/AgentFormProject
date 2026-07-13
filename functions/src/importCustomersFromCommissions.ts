// functions/src/importCustomersFromCommissions.ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { adminDb, ensureAdminApp } from "./shared/admin";
import { FUNCTIONS_REGION } from "./shared/region";
import * as admin from "firebase-admin";

function s(v: any) {
  return String(v ?? "").trim();
}

function idVariants(id: string): string[] {
  const digits = id.replace(/\D/g, "");
  if (!digits) return [];
  const padded = digits.padStart(9, "0").slice(-9);
  const stripped = digits.replace(/^0+/, "") || "0";
  return Array.from(new Set([digits, padded, stripped]));
}

function splitName(
  fullName: string,
  nameFormat: string
): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };

  if (nameFormat === "first_last") {
    return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
  } else {
    return { firstName: parts[parts.length - 1], lastName: parts.slice(0, -1).join(" ") };
  }
}

// ─── לוגיקה משותפת: בניית רשימת מועמדים לייבוא ─────────────────────────────

async function buildCandidateList(db: admin.firestore.Firestore, agentId: string) {
  // טען nameFormat מהתבניות
  const templatesSnap = await db.collection("commissionTemplates").get();
  const templateNameFormat = new Map<string, string>();
  for (const doc of templatesSnap.docs) {
    templateNameFormat.set(doc.id, s(doc.data().nameFormat) || "last_first");
  }

  // שלוף רשומות מ-policyCommissionSummaries
  const policiesSnap = await db
    .collection("policyCommissionSummaries")
    .where("agentId", "==", agentId)
    .get();

  if (policiesSnap.empty) return { toCreate: [], skipped: 0, total: 0 };

  // בנה map של מועמדים — חובה fullName + customerId
  const candidateMap = new Map<
    string,
    { customerId: string; fullName: string; nameFormat: string }
  >();

  for (const doc of policiesSnap.docs) {
    const data = doc.data();
    const rawId = s(data.customerId);
    const fullName = s(data.fullName);
    const templateId = s(data.templateId);

    if (!rawId || !fullName) continue;

    const variants = idVariants(rawId);
    if (!variants.length) continue;

    const key = variants.find((v) => v.length === 9) ?? variants[0];
    if (!candidateMap.has(key)) {
      const nameFormat = templateNameFormat.get(templateId) || "last_first";
      candidateMap.set(key, { customerId: rawId, fullName, nameFormat });
    }
  }

  const total = candidateMap.size;
  if (total === 0) return { toCreate: [], skipped: 0, total: 0 };

  // שלוף לקוחות קיימים → בנה set של וריאנטים
  const existingSnap = await db
    .collection("customer")
    .where("AgentId", "==", agentId)
    .get();

  const existingVariants = new Set<string>();
  for (const doc of existingSnap.docs) {
    for (const variant of idVariants(s(doc.data().IDCustomer))) {
      existingVariants.add(variant);
    }
  }

  // סנן — רק לקוחות שלא קיימים בשום וריאנט
  const toCreate: Array<{ customerId: string; fullName: string; nameFormat: string }> = [];
  let skipped = 0;

  for (const [, candidate] of candidateMap.entries()) {
    const exists = idVariants(candidate.customerId).some((v) => existingVariants.has(v));
    if (exists) {
      skipped++;
    } else {
      toCreate.push(candidate);
    }
  }

  return { toCreate, skipped, total };
}

// ─── תצוגה מקדימה — ללא כתיבה ל-DB ─────────────────────────────────────────

export const previewCustomerImport = onCall(
  { region: FUNCTIONS_REGION, timeoutSeconds: 540, memory: "512MiB" },
  async (request) => {
    ensureAdminApp();

    const agentId = s(request.data?.agentId);
    if (!agentId) throw new HttpsError("invalid-argument", "agentId is required");

    const callerUid = request.auth?.uid;
    if (!callerUid) throw new HttpsError("unauthenticated", "Must be authenticated");

    const db = adminDb();
    const { toCreate, skipped, total } = await buildCandidateList(db, agentId);

    // מחזיר רשימה עם שמות מפוצלים לפי nameFormat — בלי שום כתיבה
    const previewList = toCreate.map(({ customerId, fullName, nameFormat }) => {
      const { firstName, lastName } = splitName(fullName, nameFormat);
      return { customerId, fullName, firstName, lastName };
    });

    return { previewList, skipped, total, toCreate: toCreate.length };
  }
);

// ─── ייבוא לקוחות ───────────────────────────────────────────────────────────

export const importCustomersFromCommissions = onCall(
  { region: FUNCTIONS_REGION, timeoutSeconds: 540, memory: "512MiB" },
  async (request) => {
    ensureAdminApp();

    const agentId = s(request.data?.agentId);
    if (!agentId) throw new HttpsError("invalid-argument", "agentId is required");

    const callerUid = request.auth?.uid;
    if (!callerUid) throw new HttpsError("unauthenticated", "Must be authenticated");

    const db = adminDb();

    // שלב 1: צור רשומת ריצה
    const runRef = db.collection("customerImportRuns").doc();
    await runRef.set({
      agentId,
      createdBy: callerUid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: "running",
      created: 0,
      skipped: 0,
      total: 0,
    });
    const runId = runRef.id;

    try {
      const { toCreate, skipped, total } = await buildCandidateList(db, agentId);

      if (total === 0 || toCreate.length === 0) {
        await runRef.update({ status: "done", created: 0, skipped, total });
        return { runId, created: 0, skipped, total, createdList: [] };
      }

      // צור לקוחות חדשים בבאצ'ים
      let created = 0;
      const createdList: Array<{ customerId: string; fullName: string }> = [];
      const BATCH_SIZE = 500;

      for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
        const chunk = toCreate.slice(i, i + BATCH_SIZE);
        const batch = db.batch();

        for (const { customerId, fullName, nameFormat } of chunk) {
          const { firstName, lastName } = splitName(fullName, nameFormat);
          const docRef = db.collection("customer").doc();

          batch.set(docRef, {
            AgentId: agentId,
            IDCustomer: customerId,
            firstNameCustomer: firstName,
            lastNameCustomer: lastName,
            fullNameCustomer: fullName,
            parentID: docRef.id,
            importedFromCommissions: true,
            importRunId: runId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            lastUpdateDate: admin.firestore.FieldValue.serverTimestamp(),
          });

          created++;
          createdList.push({ customerId, fullName });
        }

        await batch.commit();
      }

      // עדכון רשומת הריצה
      await runRef.update({ status: "done", created, skipped, total });

      // שמירת ה-runId האחרון על הסוכן — לאפשר rollback מאוחר
      await db.collection("agentImportState").doc(agentId).set({
        lastImportRunId: runId,
        lastImportAt: admin.firestore.FieldValue.serverTimestamp(),
        lastImportCreated: created,
      }, { merge: true });

      return { runId, created, skipped, total, createdList };

    } catch (e) {
      await runRef.update({ status: "error" });
      throw e;
    }
  }
);

// ─── רולבק — מחיקת כל מה שנוצר בריצה ספציפית ──────────────────────────────

export const rollbackCustomerImport = onCall(
  { region: FUNCTIONS_REGION, timeoutSeconds: 540, memory: "512MiB" },
  async (request) => {
    ensureAdminApp();

    const runId = s(request.data?.runId);
    if (!runId) throw new HttpsError("invalid-argument", "runId is required");

    const callerUid = request.auth?.uid;
    if (!callerUid) throw new HttpsError("unauthenticated", "Must be authenticated");

    const db = adminDb();

    // וודא שהריצה קיימת
    const runDoc = await db.collection("customerImportRuns").doc(runId).get();
    if (!runDoc.exists) throw new HttpsError("not-found", "Run not found");

    const agentId = s(runDoc.data()?.agentId);

    // שלוף את כל הלקוחות של הריצה הזו
    const toDeleteSnap = await db
      .collection("customer")
      .where("importRunId", "==", runId)
      .get();

    let deleted = 0;

    if (!toDeleteSnap.empty) {
      const BATCH_SIZE = 500;
      const docs = toDeleteSnap.docs;

      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = db.batch();
        for (const doc of docs.slice(i, i + BATCH_SIZE)) {
          batch.delete(doc.ref);
          deleted++;
        }
        await batch.commit();
      }
    }

    // עדכן רשומת הריצה
    await db.collection("customerImportRuns").doc(runId).update({
      status: "rolledBack",
      deletedAt: admin.firestore.FieldValue.serverTimestamp(),
      deleted,
    });

    // נקה את ה-runId מ-agentImportState
    if (agentId) {
      await db.collection("agentImportState").doc(agentId).update({
        lastImportRunId: admin.firestore.FieldValue.delete(),
        lastImportAt: admin.firestore.FieldValue.delete(),
        lastImportCreated: admin.firestore.FieldValue.delete(),
      });
    }

    return { deleted };
  }
);