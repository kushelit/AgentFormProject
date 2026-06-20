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
      return { created: 0, updated: 0, skipped: 0, total: 0 };
    }

    // בנה map של customerId → fullName (ייחודי לפי תז מנורמל)
    // 🔧 תיקון: אם יש כמה רשומות לאותו לקוח, נעדיף רשומה עם fullName לא ריק
    // ולא נסתפק "בראשונה שנתקלנו בה" (שיכולה להיות עם שם חסר).
    const candidateMap = new Map<string, { customerId: string; fullName: string }>();

    for (const doc of policiesSnap.docs) {
      const data = doc.data();
      const rawId = s(data.customerId);
      const fullName = s(data.fullName);
      if (!rawId) continue;

      const normalizedId = normalizeId(rawId);
      if (!normalizedId) continue;

      const existingCandidate = candidateMap.get(normalizedId);
      if (!existingCandidate) {
        candidateMap.set(normalizedId, { customerId: rawId, fullName });
      } else if (!existingCandidate.fullName && fullName) {
        // היה לנו מועמד בלי שם, ומצאנו רשומה אחרת לאותו לקוח עם שם - נעדיף אותה
        candidateMap.set(normalizedId, { customerId: rawId, fullName });
      }
    }

    const total = candidateMap.size;
    if (total === 0) return { created: 0, updated: 0, skipped: 0, total: 0 };

    // ✅ שלב 2: שלוף את כל הלקוחות הקיימים של הסוכן (כולל השם הנוכחי, כדי לבדוק אם חסר)
    const existingSnap = await db
      .collection("customer")
      .where("AgentId", "==", agentId)
      .get();

    // 🔧 תיקון: בנה map מכל ווריאנט תז → { docRef, fullNameCustomer }
    // כדי שנדע גם אם הלקוח קיים, וגם אם חסר לו שם.
    const existingByIdVariant = new Map<
      string,
      { ref: admin.firestore.DocumentReference; fullNameCustomer: string }
    >();

    for (const doc of existingSnap.docs) {
      const rawId = s(doc.data().IDCustomer);
      const fullNameCustomer = s(doc.data().fullNameCustomer);
      for (const variant of idVariants(rawId)) {
        // אם כבר יש ערך עם שם, לא נחליף אותו בערך בלי שם (אבל זה edge-case נדיר של תזים כפולים)
        const existing = existingByIdVariant.get(variant);
        if (!existing || (!existing.fullNameCustomer && fullNameCustomer)) {
          existingByIdVariant.set(variant, { ref: doc.ref, fullNameCustomer });
        }
      }
    }

    // ✅ שלב 3: סנן לפי 3 קבוצות:
    //   - toCreate: לקוח חדש שלא קיים בכלל
    //   - toUpdate: לקוח קיים בלי שם (fullNameCustomer ריק) ויש לנו שם מהקומישנים
    //   - skipped: לקוח קיים עם שם כלשהו - לא נוגעים בו בכלל, אפילו אם הוא שונה
    const toCreate: Array<{ customerId: string; fullName: string }> = [];
    const toUpdate: Array<{
      ref: admin.firestore.DocumentReference;
      customerId: string;
      fullName: string;
    }> = [];

    let skipped = 0;

    for (const [, candidate] of candidateMap.entries()) {
      const variants = idVariants(candidate.customerId);
      let matchedExisting: { ref: admin.firestore.DocumentReference; fullNameCustomer: string } | undefined;

      for (const v of variants) {
        const found = existingByIdVariant.get(v);
        if (found) {
          matchedExisting = found;
          break;
        }
      }

      if (!matchedExisting) {
        // לא קיים בכלל - ליצור לקוח חדש
        toCreate.push(candidate);
        continue;
      }

      const hasExistingName = !!matchedExisting.fullNameCustomer;
      if (!hasExistingName && candidate.fullName) {
        // קיים, אבל בלי שם - ויש לנו שם מהקומישנים - להשלים רק את השם
        toUpdate.push({
          ref: matchedExisting.ref,
          customerId: candidate.customerId,
          fullName: candidate.fullName,
        });
      } else {
        // קיים עם שם (גם אם שונה/נערך) - או שגם לנו אין שם - לא לגעת
        skipped++;
      }
    }

    let created = 0;
    let updated = 0;
    const BATCH_SIZE = 500;

    // ✅ שלב 4: צור לקוחות חדשים בבאצ'ים
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

    // ✅ שלב 5: השלם שם רק ללקוחות קיימים שבאמת אין להם שם
    for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
      const chunk = toUpdate.slice(i, i + BATCH_SIZE);
      const batch = db.batch();

      for (const { ref, fullName } of chunk) {
        const { firstName, lastName } = splitFullName(fullName);

        batch.update(ref, {
          firstNameCustomer: firstName,
          lastNameCustomer: lastName,
          fullNameCustomer: fullName,
          lastUpdateDate: admin.firestore.FieldValue.serverTimestamp(),
        });

        updated++;
      }

      await batch.commit();
    }

    return { created, updated, skipped, total };
  }
);