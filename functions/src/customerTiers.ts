/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

// functions/src/customerTiers.ts
//
// שתי Cloud Functions:
// 1. calculateCustomerTiers — מריצה חישוב (קריאה בלבד, לא כותבת ל-DB) ומחזירה הצעות דירוג
// 2. applyCustomerTiers — מקבלת רשימת שורות מאושרות וכותבת אותן בפועל ל-customer.customerTier

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { adminDb, nowTs } from "./shared/admin";
import { FUNCTIONS_REGION } from "./shared/region";

function s(v: any): string {
  return String(v ?? "").trim();
}

// ─── טיפוסים ──────────────────────────────────────────────────────────────────

interface TierThresholds {
  gold: number;    // סכום נפרעים מינימלי לזהב
  silver: number;  // סכום נפרעים מינימלי לכסף
  // מתחת ל-silver -> 'standard'
}

type Tier = "gold" | "silver" | "standard";

interface TierProposalRow {
  customerId: string;       // doc id של הלקוח
  customerName: string;
  IDCustomer: string;
  parentID?: string;
  familySize: number;       // כמה לקוחות בתא המשפחתי נכללו בסכימה
  nifraimAmount: number;    // הסכום שחושב (משוקלל למשפחה)
  currentTier: Tier;        // הדירוג הקיים היום ב-DB
  proposedTier: Tier;       // הדירוג המוצע לפי הסכימה החדשה
  changed: boolean;         // proposedTier !== currentTier
}

function canonId(v: any): string {
  const digits = s(v).replace(/\D/g, "");
  return digits.replace(/^0+/, "");
}

function tierFromAmount(amount: number, thresholds: TierThresholds): Tier {
  if (amount >= thresholds.gold) return "gold";
  if (amount >= thresholds.silver) return "silver";
  return "standard";
}

// ─── 1. חישוב (read-only) ──────────────────────────────────────────────────────

export const calculateCustomerTiers = onCall(
  {
    region: FUNCTIONS_REGION,
    timeoutSeconds: 300,
    memory: "512MiB",
  },
  async (request) => {
    const callerUid = request.auth?.uid;
    if (!callerUid) throw new HttpsError("unauthenticated", "יש להתחבר למערכת");

    const agentId = s(request.data?.agentId);
    const month = s(request.data?.month);
    if (!agentId || !month) {
      throw new HttpsError("invalid-argument", "נדרש agentId וmonth (YYYY-MM)");
    }

    const db = adminDb();

    // 1) טעינת ספי דירוג מ-MD (מוגדר ב-Firestore, נטען בלבד)
    const thresholdsSnap = await db.collection("tierThresholds").doc(agentId).get();
    const thresholdsDoc = thresholdsSnap.exists
      ? thresholdsSnap
      : await db.collection("tierThresholds").doc("default").get();

    if (!thresholdsDoc.exists) {
      throw new HttpsError(
        "failed-precondition",
        "לא הוגדרו ספי דירוג (tierThresholds) לסוכן זה או כברירת מחדל",
      );
    }
    const thresholds = thresholdsDoc.data() as TierThresholds;

    // 2) טעינת כל לקוחות הסוכן
    const customersSnap = await db.collection("customer").where("AgentId", "==", agentId).get();
    const customers = customersSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    // 3) טעינת כל שורות העמלה מטעינות (policyCommissionSummaries) לחודש הנבחר
    const externalSnap = await db
      .collection("policyCommissionSummaries")
      .where("agentId", "==", agentId)
      .where("reportMonth", "==", month)
      .get();

    // מיפוי customerId (מנורמל) -> סכום נפרעים
    const amountByCustomerId = new Map<string, number>();
    externalSnap.docs.forEach((d) => {
      const row = d.data() as any;
      const key = canonId(row.customerId);
      if (!key) return;
      const amt = Number(row.totalCommissionAmount || 0);
      amountByCustomerId.set(key, (amountByCustomerId.get(key) || 0) + amt);
    });

    // 4) קיבוץ לקוחות לפי תא משפחתי (parentID)
    const familyGroups = new Map<string, typeof customers>();
    customers.forEach((c) => {
      const key = c.parentID || c.id;
      if (!familyGroups.has(key)) familyGroups.set(key, []);
      familyGroups.get(key)!.push(c);
    });

    // 5) חישוב סכום משוקלל למשפחה, והצעת דירוג לכל לקוח
    const rows: TierProposalRow[] = [];

    for (const [, members] of familyGroups) {
      const familyTotal = members.reduce((sum, m) => {
        const key = canonId(m.IDCustomer);
        return sum + (amountByCustomerId.get(key) || 0);
      }, 0);

      const proposedTier = tierFromAmount(familyTotal, thresholds);

      for (const m of members) {
        const currentTier: Tier = (m.customerTier as Tier) || "standard";
        rows.push({
          customerId: m.id,
          customerName: `${m.firstNameCustomer ?? ""} ${m.lastNameCustomer ?? ""}`.trim(),
          IDCustomer: m.IDCustomer ?? "",
          parentID: m.parentID,
          familySize: members.length,
          nifraimAmount: Number(familyTotal.toFixed(2)),
          currentTier,
          proposedTier,
          changed: currentTier !== proposedTier,
        });
      }
    }

    // מיון: שינויים קודם, אחר כך לפי סכום בסדר יורד
    rows.sort((a, b) => {
      if (a.changed !== b.changed) return a.changed ? -1 : 1;
      return b.nifraimAmount - a.nifraimAmount;
    });

    return {
      month,
      thresholds,
      totalCustomers: rows.length,
      changedCount: rows.filter((r) => r.changed).length,
      rows,
    };
  },
);

// ─── 2. אישור וכתיבה בפועל ──────────────────────────────────────────────────────

export const applyCustomerTiers = onCall(
  {
    region: FUNCTIONS_REGION,
    timeoutSeconds: 300,
    memory: "256MiB",
  },
  async (request) => {
    const callerUid = request.auth?.uid;
    if (!callerUid) throw new HttpsError("unauthenticated", "יש להתחבר למערכת");

    const agentId = s(request.data?.agentId);
    const month = s(request.data?.month);
    const approvedRows = (request.data?.approvedRows || []) as {
      customerId: string;
      proposedTier: Tier;
      nifraimAmount: number;
    }[];

    if (!agentId || !approvedRows.length) {
      throw new HttpsError("invalid-argument", "נדרש agentId ורשימת שורות מאושרות");
    }

    const db = adminDb();
    const batchSize = 400; // מתחת למגבלת 500 כתיבות ל-batch
    let updated = 0;

    for (let i = 0; i < approvedRows.length; i += batchSize) {
      const chunk = approvedRows.slice(i, i + batchSize);
      const batch = db.batch();
      chunk.forEach((row) => {
        const ref = db.collection("customer").doc(row.customerId);
        batch.update(ref, {
          customerTier: row.proposedTier,
          tierNifraim: row.nifraimAmount,
          tierLastCalculated: month,
          tierUpdatedAt: nowTs(),
        });
      });
      await batch.commit();
      updated += chunk.length;
    }

    // שמירת לוג ריצה (לצורך "החודש האחרון שחושב")
    await db.collection("tierCalcRuns").add({
      agentId,
      month,
      updatedCount: updated,
      runBy: callerUid,
      runAt: nowTs(),
    });

    return { updated };
  },
);