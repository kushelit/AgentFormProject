/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

// functions/src/customerTiers.ts
//
// שתי Cloud Functions:
// 1. calculateCustomerTiers — מריצה חישוב (קריאה בלבד, לא כותבת ל-DB) ומחזירה הצעות דירוג
// 2. applyCustomerTiers — מקבלת רשימת שורות מאושרות וכותבת אותן בפועל ל-customer.customerTier
//
// החישוב לפי חודש פרסום (ym) — אותו מנגנון "תיק נוכחי" של הסקירה (src/lib/insights):
//   portalImportRuns.resolvedWindow.ym → queue.jobIds → commissionImportRuns (templateId)
//   → policyCommissionSummaries.runId == jobId
// לכל תבנית: חודש הפרסום האחרון שלה עד החודש שנבחר (עד 12 חודשים אחורה), ובתוכו חודש הדיווח האחרון.
// נפרעים בלבד — ללא תבניות hekefType.

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { adminDb, nowTs } from "./shared/admin";
import { FUNCTIONS_REGION } from "./shared/region";
import { computeAgentAccess } from "./shared/agentAccess";

function s(v: any): string {
  return String(v ?? "").trim();
}

// ─── טיפוסים ──────────────────────────────────────────────────────────────────

interface TierThresholds {
  premium: number; // סכום נפרעים מינימלי לפרימיום
  gold: number;    // סכום נפרעים מינימלי לזהב
  silver: number;  // סכום נפרעים מינימלי לכסף
  // מתחת ל-silver -> 'standard'
}

type Tier = "premium" | "gold" | "silver" | "standard";

interface TierFamilyMember {
  customerId: string;
  customerName: string;
  IDCustomer: string;
  currentTier: Tier;
  responsibleUserId: string | null;
  responsibleUserName: string | null;
}

interface TierProposalRow {
  customerId: string;       // doc id של המבוטח הראשי (או של היחיד, אם אין תא משפחתי)
  customerName: string;     // שם המבוטח הראשי
  IDCustomer: string;       // ת"ז המבוטח הראשי
  familySize: number;       // כמה לקוחות בתא המשפחתי נכללו בסכימה
  nifraimAmount: number;    // הסכום שחושב (משוקלל למשפחה) - מוצג פעם אחת בלבד לכל המשפחה
  currentTier: Tier;        // הדירוג הקיים של המבוטח הראשי
  proposedTier: Tier;       // הדירוג המוצע למשפחה כולה
  changed: boolean;         // true אם לפחות אחד מבני המשפחה לא כבר בדירוג המוצע
  responsibleUserId: string | null;   // אחראי המבוטח הראשי - customer.responsibleUserId
  responsibleUserName: string | null; // שם מוצג של האחראי - customer.responsibleUserName
  members: TierFamilyMember[]; // כל בני התא המשפחתי (כולל הראשי) - לצורך תצוגה/הרחבת עדכונים
}

interface DuplicateSkipped {
  canonId: string;          // ת"ז מנורמלת (בלי אפסים מובילים) שמשותפת לשתי הרשומות
  keptCustomerId: string;   // doc id של הרשומה שנשארה ונכנסה לחישוב
  skippedCustomerId: string; // doc id של הרשומה הכפולה שהודחה מהחישוב
}

function canonId(v: any): string {
  const digits = s(v).replace(/\D/g, "");
  return digits.replace(/^0+/, "");
}

// ── הרשאה: המשתמש רשאי לגשת לנתוני הסוכן (אותו מודל של agentAccess / חוקי Firestore) ──
async function assertAgentAccess(db: FirebaseFirestore.Firestore, uid: string, agentId: string) {
  const access = await computeAgentAccess(db, uid);
  if (!access.all && !access.agentIds.includes(agentId)) {
    throw new HttpsError("permission-denied", "אין הרשאה לנתוני הסוכן");
  }
}

const YM_RE = /^\d{4}-\d{2}$/;
const LOOKBACK_MONTHS = 12;
const IN_LIMIT = 30;
const GETALL_CHUNK = 100;
const FETCH_CONCURRENCY = 20;

function shiftYm(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function mapPool<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return out;
}

interface TemplateWindow {
  templateId: string;
  templateName: string;
  companyName: string;
  ym: string;          // חודש הפרסום שנלקח לתבנית
  reportMonth: string; // חודש הדיווח שנלקח בתוכו
  stale: boolean;      // ym < החודש שנבחר — התבנית עוד לא נטענה לחודש הזה
}

/**
 * נפרעים לפי לקוח (ת"ז קנונית) לחודש פרסום — "תיק נוכחי" עד selectedYm.
 * מחזיר גם את החלון שנבחר לכל תבנית ואת חודש הפרסום האחרון שקיים לסוכן.
 */
async function loadNifraimByYm(db: FirebaseFirestore.Firestore, agentId: string, selectedYm: string) {
  const minYm = shiftYm(selectedYm, -(LOOKBACK_MONTHS - 1));

  const [tplSnap, runsSnap] = await Promise.all([
    db.collection("commissionTemplates").get(),
    db.collection("portalImportRuns").where("agentId", "==", agentId).select("resolvedWindow.ym", "queue.jobIds").get(),
  ]);

  const hekefTemplateIds = new Set<string>();
  const activeTemplateIds = new Set<string>();
  const templateNames: Record<string, string> = {};
  tplSnap.docs.forEach((d) => {
    const t: any = d.data();
    if (t.hekefType) hekefTemplateIds.add(d.id);
    if (t.isactive) activeTemplateIds.add(d.id);
    templateNames[d.id] = s(t.Name) || d.id;
  });

  // jobId → חודש פרסום (בטווח), וחודש הפרסום האחרון שקיים בכלל
  let latestAvailableYm: string | null = null;
  const ymByJobId: Record<string, string> = {};
  runsSnap.docs.forEach((d) => {
    const r: any = d.data();
    const ym = s(r?.resolvedWindow?.ym);
    if (!YM_RE.test(ym)) return;
    if (!latestAvailableYm || ym > latestAvailableYm) latestAvailableYm = ym;
    if (ym > selectedYm || ym < minYm) return;
    const jobIds: any[] = Array.isArray(r?.queue?.jobIds) ? r.queue.jobIds : [];
    jobIds.forEach((raw) => {
      const jobId = s(raw);
      if (jobId && (!ymByJobId[jobId] || ym > ymByJobId[jobId])) ymByJobId[jobId] = ym;
    });
  });

  // טעינות שהצליחו (קיים commissionImportRuns) → תבנית. לפי מזהה מסמך, ואם לא נמצא — לפי השדה runId
  const templateByJob: Record<string, string> = {};
  const companyByJob: Record<string, string> = {};
  const allJobIds = Object.keys(ymByJobId);
  const found = new Set<string>();
  const accept = (jobId: string, x: any) => {
    found.add(jobId);
    const templateId = s(x?.templateId);
    if (!templateId || hekefTemplateIds.has(templateId)) return;
    templateByJob[jobId] = templateId;
    companyByJob[jobId] = s(x?.company);
  };
  const byDoc = await Promise.all(chunk(allJobIds, GETALL_CHUNK).map((ids) =>
    db.getAll(...ids.map((id) => db.collection("commissionImportRuns").doc(id)), { fieldMask: ["templateId", "company"] }),
  ));
  byDoc.flat().forEach((snap) => snap.exists && accept(snap.id, snap.data()));
  const missing = allJobIds.filter((id) => !found.has(id));
  if (missing.length) {
    const snaps = await Promise.all(chunk(missing, IN_LIMIT).map((ids) =>
      db.collection("commissionImportRuns").where("runId", "in", ids).select("runId", "templateId", "company").get(),
    ));
    snaps.forEach((snap) => snap.docs.forEach((d) => {
      const x: any = d.data();
      const runId = s(x.runId);
      if (runId && !found.has(runId)) accept(runId, x);
    }));
  }

  // לכל תבנית: חודש הפרסום האחרון שלה עד החודש שנבחר → רק הטעינות של אותו חודש
  const latestYmByTemplate: Record<string, string> = {};
  Object.entries(templateByJob).forEach(([jobId, templateId]) => {
    const ym = ymByJobId[jobId];
    if (!latestYmByTemplate[templateId] || ym > latestYmByTemplate[templateId]) latestYmByTemplate[templateId] = ym;
  });
  const jobsToFetch = Object.keys(templateByJob).filter((jobId) => ymByJobId[jobId] === latestYmByTemplate[templateByJob[jobId]]);

  const snaps = await mapPool(jobsToFetch, FETCH_CONCURRENCY, (jobId) =>
    db.collection("policyCommissionSummaries").where("runId", "==", jobId)
      .select("agentId", "runId", "templateId", "reportMonth", "customerId", "totalCommissionAmount", "company").get(),
  );

  type Row = { templateId: string; reportMonth: string; customerKey: string; amount: number };
  const rows: Row[] = [];
  const companyByTemplate: Record<string, string> = {};
  snaps.forEach((snap) => snap.docs.forEach((d) => {
    const x: any = d.data();
    if (s(x.agentId) !== agentId) return;
    const runId = s(x.runId);
    const templateId = s(x.templateId) || templateByJob[runId];
    if (!templateId || hekefTemplateIds.has(templateId)) return;
    const customerKey = canonId(x.customerId);
    if (!customerKey) return;
    companyByTemplate[templateId] = s(x.company) || companyByJob[runId] || companyByTemplate[templateId] || "";
    rows.push({ templateId, reportMonth: s(x.reportMonth), customerKey, amount: Number(x.totalCommissionAmount || 0) });
  }));

  // בתוך חודש הפרסום של כל תבנית — חודש הדיווח האחרון בלבד (קובץ יכול להכיל כמה חודשי דיווח)
  const maxReportMonth: Record<string, string> = {};
  rows.forEach((r) => {
    if (!maxReportMonth[r.templateId] || r.reportMonth > maxReportMonth[r.templateId]) maxReportMonth[r.templateId] = r.reportMonth;
  });

  const amountByCustomerId = new Map<string, number>();
  rows.forEach((r) => {
    if (r.reportMonth !== maxReportMonth[r.templateId]) return;
    amountByCustomerId.set(r.customerKey, (amountByCustomerId.get(r.customerKey) || 0) + r.amount);
  });

  const templates: TemplateWindow[] = Object.keys(maxReportMonth).map((templateId) => ({
    templateId,
    templateName: templateNames[templateId] || templateId,
    companyName: companyByTemplate[templateId] || "",
    ym: latestYmByTemplate[templateId],
    reportMonth: maxReportMonth[templateId],
    // כמו staleTemplates בסקירה — רק תבניות פעילות מסומנות כ"עדיין בחודש קודם"
    stale: latestYmByTemplate[templateId] < selectedYm && activeTemplateIds.has(templateId),
  })).sort((a, b) => a.ym.localeCompare(b.ym) || a.companyName.localeCompare(b.companyName));

  return { amountByCustomerId, templates, latestAvailableYm, policyRowsCount: rows.length };
}

function tierFromAmount(amount: number, thresholds: TierThresholds): Tier {
  if (amount >= thresholds.premium) return "premium";
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
    const month = s(request.data?.month); // חודש פרסום (ym)
    if (!agentId || !YM_RE.test(month)) {
      throw new HttpsError("invalid-argument", "נדרש agentId וחודש פרסום (YYYY-MM)");
    }

    const db = adminDb();
    await assertAgentAccess(db, callerUid, agentId);

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

    if (
      thresholds.premium === undefined ||
      thresholds.gold === undefined ||
      thresholds.silver === undefined
    ) {
      throw new HttpsError(
        "failed-precondition",
        "מסמך tierThresholds חסר אחד מהשדות: premium, gold, silver",
      );
    }

    // 2) טעינת כל לקוחות הסוכן
    const customersSnap = await db.collection("customer").where("AgentId", "==", agentId).get();
    const customersRaw = customersSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    // 2.5) זיהוי וסינון כפילויות לקוח לפי ת"ז מנורמלת (עם/בלי 0 מוביל).
    // זו "זבל" קיים בדאטה שגורם לאותו לקוח אמיתי להופיע פעמיים במדרג.
    // בין שתי רשומות עם אותה ת"ז מנורמלת - נשארת זו שעודכנה לאחרונה (lastUpdateDate, ואם אין - createdAt),
    // והשנייה מודחת מהחישוב (לא נמחקת ב-DB, רק לא נכנסת לתוצאה הזו).
    const primaryByCanonId = new Map<string, any>();
    const duplicatesSkipped: DuplicateSkipped[] = [];

    customersRaw.forEach((c) => {
      const key = canonId(c.IDCustomer);
      if (!key) return; // אין ת"ז תקינה - לא ניתן לזהות כפילות, הרשומה נשארת כרגיל

      const existing = primaryByCanonId.get(key);
      if (!existing) {
        primaryByCanonId.set(key, c);
        return;
      }

      const existingTime = existing.lastUpdateDate?.toMillis?.() ?? existing.createdAt?.toMillis?.() ?? 0;
      const currentTime = c.lastUpdateDate?.toMillis?.() ?? c.createdAt?.toMillis?.() ?? 0;

      if (currentTime > existingTime) {
        primaryByCanonId.set(key, c);
        duplicatesSkipped.push({ canonId: key, keptCustomerId: c.id, skippedCustomerId: existing.id });
      } else {
        duplicatesSkipped.push({ canonId: key, keptCustomerId: existing.id, skippedCustomerId: c.id });
      }
    });

    const customers = customersRaw.filter((c) => {
      const key = canonId(c.IDCustomer);
      if (!key) return true; // אין ת"ז - נשאר, לא מזוהה ככפילות
      return primaryByCanonId.get(key)?.id === c.id;
    });

    // 3) נפרעים לפי לקוח — לפי חודש פרסום ("תיק נוכחי" עד החודש שנבחר)
    const { amountByCustomerId, templates, latestAvailableYm, policyRowsCount } = await loadNifraimByYm(db, agentId, month);

    // 4) קיבוץ לקוחות לפי תא משפחתי (parentID) - לאחר סינון הכפילויות
    const familyGroups = new Map<string, typeof customers>();
    customers.forEach((c) => {
      const key = c.parentID || c.id;
      if (!familyGroups.has(key)) familyGroups.set(key, []);
      familyGroups.get(key)!.push(c);
    });

    // 5) חישוב סכום משוקלל למשפחה, והצעת דירוג למשפחה - שורה אחת פר תא משפחתי
    const rows: TierProposalRow[] = [];

    for (const [key, members] of familyGroups) {
      const familyTotal = members.reduce((sum, m) => {
        const idKey = canonId(m.IDCustomer);
        return sum + (amountByCustomerId.get(idKey) || 0);
      }, 0);

      const proposedTier = tierFromAmount(familyTotal, thresholds);

      // המבוטח הראשי: הרשומה שה-id שלה שווה למפתח הקבוצה (parentID המשותף, או עצמה אם יחיד)
      const primary = members.find((m) => m.id === key) || members[0];

      const familyMembers: TierFamilyMember[] = members.map((m) => ({
        customerId: m.id,
        customerName: `${m.firstNameCustomer ?? ""} ${m.lastNameCustomer ?? ""}`.trim(),
        IDCustomer: m.IDCustomer ?? "",
        currentTier: (m.customerTier as Tier) || "standard",
        responsibleUserId: m.responsibleUserId ?? null,
        responsibleUserName: m.responsibleUserName ?? null,
      }));

      // "שינוי" מוגדר ברמת המשפחה: true אם לפחות אחד מבני המשפחה עדיין לא בדירוג המוצע
      // (לא רק הראשי) - כדי לתפוס גם מצב שבו רק חלק מהמשפחה עודכנה בעבר.
      const changed = familyMembers.some((m) => m.currentTier !== proposedTier);
      const primaryCurrentTier: Tier = (primary.customerTier as Tier) || "standard";

      rows.push({
        customerId: primary.id,
        customerName: `${primary.firstNameCustomer ?? ""} ${primary.lastNameCustomer ?? ""}`.trim(),
        IDCustomer: primary.IDCustomer ?? "",
        familySize: members.length,
        nifraimAmount: Number(familyTotal.toFixed(2)),
        currentTier: primaryCurrentTier,
        proposedTier,
        changed,
        responsibleUserId: primary.responsibleUserId ?? null,
        responsibleUserName: primary.responsibleUserName ?? null,
        members: familyMembers,
      });
    }

    // מיון: שינויים קודם, אחר כך לפי סכום בסדר יורד
    rows.sort((a, b) => {
      if (a.changed !== b.changed) return a.changed ? -1 : 1;
      return b.nifraimAmount - a.nifraimAmount;
    });

    return {
      month,
      thresholds,
      totalCustomers: customers.length,
      totalFamilies: rows.length,
      changedCount: rows.filter((r) => r.changed).length,
      basis: "ym",
      latestAvailableYm,
      policyRowsCount, // 0 = אין נתוני טעינה לחודש — הדף חוסם אישור
      templates,       // לכל תבנית: חודש הפרסום/הדיווח שנלקחו, ו-stale אם עדיין בחודש קודם
      duplicatesSkippedCount: duplicatesSkipped.length,
      duplicatesSkipped, // לצורך שקיפות/ניקוי עתידי - אילו לקוחות זוהו ככפילות ואילו נשמרו
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
    await assertAgentAccess(db, callerUid, agentId);

    // טעינת כל לקוחות הסוכן, כדי לזהות:
    // (א) רשומות כפולות (אותה ת"ז מנורמלת, עם/בלי 0 מוביל) שצריכות לקבל את אותו הדירוג
    // (ב) בני משפחה (אותו parentID) - כי כל שורה מאושרת היום מייצגת משפחה שלמה, לא לקוח בודד
    const customersSnap = await db.collection("customer").where("AgentId", "==", agentId).get();
    const idsByCanon = new Map<string, string[]>(); // canonId -> כל ה-doc id-ים שמשתפים אותה ת"ז מנורמלת
    const canonByCustomerId = new Map<string, string>(); // doc id -> canonId שלו
    const parentKeyByCustomerId = new Map<string, string>(); // doc id -> parentID (או עצמו, אם יחיד)
    const memberIdsByParentKey = new Map<string, string[]>(); // parentID -> כל ה-doc id-ים בתא המשפחתי

    customersSnap.docs.forEach((d) => {
      const data = d.data() as any;

      const idc = data.IDCustomer;
      const key = canonId(idc);
      if (key) {
        canonByCustomerId.set(d.id, key);
        if (!idsByCanon.has(key)) idsByCanon.set(key, []);
        idsByCanon.get(key)!.push(d.id);
      }

      const parentKey = data.parentID || d.id;
      parentKeyByCustomerId.set(d.id, parentKey);
      if (!memberIdsByParentKey.has(parentKey)) memberIdsByParentKey.set(parentKey, []);
      memberIdsByParentKey.get(parentKey)!.push(d.id);
    });

    // מרחיבים כל שורה מאושרת (מייצגת משפחה) לכל בני המשפחה, ולכל הרשומות הכפולות של כל אחד מהם -
    // כולם מקבלים את אותו proposedTier/nifraimAmount.
    const expandedUpdates = new Map<string, { proposedTier: Tier; nifraimAmount: number }>();
    approvedRows.forEach((row) => {
      const parentKey = parentKeyByCustomerId.get(row.customerId) || row.customerId;
      const familyMemberIds = memberIdsByParentKey.get(parentKey) || [row.customerId];

      familyMemberIds.forEach((memberId) => {
        const canon = canonByCustomerId.get(memberId);
        const targetIds = canon ? (idsByCanon.get(canon) || [memberId]) : [memberId];
        targetIds.forEach((id) => {
          expandedUpdates.set(id, { proposedTier: row.proposedTier, nifraimAmount: row.nifraimAmount });
        });
      });
    });

    const updatesList = Array.from(expandedUpdates.entries());
    const batchSize = 400; // מתחת למגבלת 500 כתיבות ל-batch
    let updated = 0;

    for (let i = 0; i < updatesList.length; i += batchSize) {
      const chunk = updatesList.slice(i, i + batchSize);
      const batch = db.batch();
      chunk.forEach(([customerId, data]) => {
        const ref = db.collection("customer").doc(customerId);
        batch.update(ref, {
          customerTier: data.proposedTier,
          tierNifraim: data.nifraimAmount,
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