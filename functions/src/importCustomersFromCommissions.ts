// functions/src/importCustomersFromCommissions.ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { adminDb, ensureAdminApp } from "./shared/admin";
import { FUNCTIONS_REGION } from "./shared/region";
import * as admin from "firebase-admin";

function s(v: any) {
  return String(v ?? "").trim();
}

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  const firstName = parts[parts.length - 1];
  const lastName = parts.slice(0, -1).join(" ");
  return { firstName, lastName };
}

function normalizeId(id: string): string {
  const digits = id.replace(/\D/g, "");
  return digits ? digits.padStart(9, "0").slice(-9) : "";
}

function idVariants(id: string): string[] {
  const digits = id.replace(/\D/g, "");
  if (!digits) return [];
  const padded = digits.padStart(9, "0").slice(-9);
  const stripped = digits.replace(/^0+/, "") || "0";
  return Array.from(new Set([digits, padded, stripped]));
}

export const importCustomersFromCommissions = onCall(
  {
    region: FUNCTIONS_REGION,
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async (request) => {
    ensureAdminApp();

    const agentId = s(request.data?.agentId);
    if (!agentId) throw new HttpsError("invalid-argument", "agentId is required");

    // ✅ אימות שהמשתמש הוא הסוכן עצמו או אדמין
    const callerUid = request.auth?.uid;
    if (!callerUid) throw new HttpsError("unauthenticated", "Must be authenticated");

    const db = adminDb();

    // ✅ שלב 1: שלוף את כל ה-customerId הייחודיים מ-policyCommissionSummaries
    const policiesSnap = await db
      .collection("policyCommissionSummaries")
      .where("agentId", "==", agentId)
      .get();

    if (policiesSnap.empty) {
      return { created: 0, skipped: 0, total: 0 };
    }

    // בנה map של customerId → fullName (ייחודי לפי תז מנורמל)
    const candidateMap = new Map<string, { customerId: string; fullName: string }>();

    for (const doc of policiesSnap.docs) {
      const data = doc.data();
      const rawId = s(data.customerId);
      const fullName = s(data.fullName);
      if (!rawId) continue;

      const normalizedId = normalizeId(rawId);
      if (!normalizedId) continue;

      if (!candidateMap.has(normalizedId)) {
        candidateMap.set(normalizedId, { customerId: rawId, fullName });
      }
    }

    const total = candidateMap.size;
    if (total === 0) return { created: 0, skipped: 0, total: 0 };

    // ✅ שלב 2: שלוף את כל הלקוחות הקיימים של הסוכן
    const existingSnap = await db
      .collection("customer")
      .where("AgentId", "==", agentId)
      .get();

    // בנה Set של כל הווריאנטים של תזים קיימים
    const existingIds = new Set<string>();
    for (const doc of existingSnap.docs) {
      const rawId = s(doc.data().IDCustomer);
      for (const variant of idVariants(rawId)) {
        existingIds.add(variant);
      }
    }

    // ✅ שלב 3: סנן רק חדשים
    const toCreate: Array<{ customerId: string; fullName: string }> = [];

    for (const [, candidate] of candidateMap.entries()) {
          const alreadyExists = idVariants(candidate.customerId).some(v => existingIds.has(v));
      if (!alreadyExists) {
        toCreate.push(candidate);
      }
    }

    if (toCreate.length === 0) {
      return { created: 0, skipped: total, total };
    }

    // ✅ שלב 4: צור בבאצ'ים של 500
    let created = 0;
    const BATCH_SIZE = 500;

    for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
      const chunk = toCreate.slice(i, i + BATCH_SIZE);
      const batch = db.batch();

      for (const { customerId, fullName } of chunk) {
        const { firstName, lastName } = splitFullName(fullName);
        const docRef = db.collection("customer").doc();

        batch.set(docRef, {
          AgentId: agentId,
          IDCustomer: normalizeId(customerId),
          firstNameCustomer: firstName,
          lastNameCustomer: lastName,
          fullNameCustomer: fullName,
          parentID: docRef.id,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          lastUpdateDate: admin.firestore.FieldValue.serverTimestamp(),
          importedFromCommissions: true,
        });

        created++;
      }

      await batch.commit();
    }

    return { created, skipped: total - created, total };
  }
);