// src/lib/insights/serverData.ts
// שליפות Firestore משותפות ל-agent-insights ולרשימת הפוליסות (צד שרת בלבד).
//
// שרשרת חודש פרסום (אותו מנגנון של ה-drilldown):
//   portalImportRuns.resolvedWindow.ym
//     → portalImportRuns.queue.jobIds   (אוטומטי: jobId | מגשר: runId ידני)
//     → commissionImportRuns/{jobId}     (קיים רק לטעינה שהצליחה + templateId)
//     → policyCommissionSummaries.runId == jobId
import { admin } from '@/lib/firebase/firebase-admin';
import type { TemplateDoc } from '@/types/ContractCommissionComparison';
import { canonCustomerId, portfolioWindows, type HouseholdMap, type InsightsPolicyRow } from '@/lib/insights/computeInsights';

type Db = ReturnType<typeof admin.firestore>;

const IN_LIMIT = 30;
const GETALL_CHUNK = 100;

export const str = (v: any) => String(v ?? '').trim();
export const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
export const tsMillis = (v: any): number =>
  typeof v?.toMillis === 'function' ? v.toMillis() : Number(v?._seconds ?? 0) * 1000;

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export type TemplatesInfo = {
  templatesById: Record<string, TemplateDoc>;
  hekefTemplateIds: Set<string>;
  activeTemplateIds: Set<string>;
};

export async function loadTemplates(db: Db): Promise<TemplatesInfo> {
  const snap = await db.collection('commissionTemplates').get();
  const templatesById: Record<string, TemplateDoc> = {};
  const hekefTemplateIds = new Set<string>();
  const activeTemplateIds = new Set<string>();
  snap.docs.forEach((d) => {
    const t: any = d.data();
    templatesById[d.id] = t as TemplateDoc;
    if (t.hekefType) hekefTemplateIds.add(d.id);
    if (t.isactive) activeTemplateIds.add(d.id);
  });
  return { templatesById, hekefTemplateIds, activeTemplateIds };
}

/** jobId → חודש פרסום. year אופציונלי — בלעדיו מחזיר את כל השנים */
export async function loadJobYms(db: Db, agentId: string, year?: string): Promise<Record<string, string>> {
  const prefix = year ? `${year}-` : '';
  const snap = await db
    .collection('portalImportRuns')
    .where('agentId', '==', agentId)
    .select('resolvedWindow.ym', 'queue.jobIds')
    .get();

  const ymByJobId: Record<string, string> = {};
  snap.docs.forEach((d) => {
    const r: any = d.data();
    const ym = str(r?.resolvedWindow?.ym);
    if (!ym || !ym.startsWith(prefix)) return;
    const jobIds: string[] = Array.isArray(r?.queue?.jobIds) ? r.queue.jobIds : [];
    for (const raw of jobIds) {
      const jobId = str(raw);
      if (!jobId) continue;
      if (!ymByJobId[jobId] || ym > ymByJobId[jobId]) ymByJobId[jobId] = ym;
    }
  });
  return ymByJobId;
}

export type JobMeta = { templateId: string; company: string; companyId?: string; createdAt: number };

/**
 * מטא של טעינות שהצליחו (קיים commissionImportRuns), ללא תבניות היקף.
 * חיפוש בשני שלבים:
 *   1. לפי מזהה המסמך (טעינות אוטומטיות: מזהה המסמך = runId = jobId)
 *   2. מה שלא נמצא — לפי השדה runId (טעינה ידנית שנשמרה עם מזהה מסמך אוטומטי)
 */
export async function loadJobMeta(
  db: Db,
  jobIds: string[],
  hekefTemplateIds: Set<string>
): Promise<Record<string, JobMeta>> {
  const out: Record<string, JobMeta> = {};
  const found = new Set<string>();

  const accept = (jobId: string, d: any) => {
    found.add(jobId);
    const templateId = str(d?.templateId);
    if (!templateId || hekefTemplateIds.has(templateId)) return;
    out[jobId] = { templateId, company: str(d?.company), companyId: str(d?.companyId), createdAt: tsMillis(d?.createdAt) };
  };

  // 1) לפי מזהה המסמך
  const chunks = await Promise.all(
    chunk(jobIds, GETALL_CHUNK).map((ids) =>
      db.getAll(
        ...ids.map((id) => db.collection('commissionImportRuns').doc(id)),
        { fieldMask: ['templateId', 'company', 'companyId', 'createdAt'] }
      )
    )
  );
  chunks.flat().forEach((snap) => snap.exists && accept(snap.id, snap.data()));

  // 2) לפי השדה runId
  const missing = jobIds.filter((id) => !found.has(id));
  let byField = 0;
  if (missing.length) {
    const snaps = await Promise.all(
      chunk(missing, IN_LIMIT).map((ids) =>
        db
          .collection('commissionImportRuns')
          .where('runId', 'in', ids)
          .select('runId', 'templateId', 'company', 'companyId', 'createdAt')
          .get()
      )
    );
    snaps.forEach((snap) =>
      snap.docs.forEach((d) => {
        const x: any = d.data();
        const runId = str(x.runId);
        if (runId && !found.has(runId)) {
          accept(runId, x);
          byField++;
        }
      })
    );
  }

  const notFound = jobIds.filter((id) => !found.has(id));
  if (byField || notFound.length) {
    console.log(
      `[insights/jobMeta] ${jobIds.length} jobs: ${found.size - byField} by doc id, ${byField} by runId field, ` +
        `${notFound.length} not found${notFound.length ? ` (e.g. ${notFound.slice(0, 3).join(', ')})` : ''}`
    );
  }
  return out;
}

/** מסמכי policyCommissionSummaries של הטעינות → שורות לחישוב */
export async function fetchPolicyRows(params: {
  db: Db;
  agentId: string;
  jobIds: string[];
  ymByJobId: Record<string, string>;
  jobMeta: Record<string, JobMeta>;
  hekefTemplateIds: Set<string>;
  withDetails?: boolean; // שם לקוח + מספר סוכן (לרשימת פוליסות)
}): Promise<InsightsPolicyRow[]> {
  const { db, agentId, jobIds, ymByJobId, jobMeta, hekefTemplateIds, withDetails } = params;

  const fields = [
    'agentId', 'runId', 'templateId', 'reportMonth', 'product', 'productGroup', 'productsGroup',
    'company', 'policyNumberKey', 'customerId', 'totalPremiumAmount', 'totalCommissionAmount',
    ...(withDetails ? ['fullName', 'agentCode'] : []),
  ];

  const snaps = await Promise.all(
    chunk(jobIds, IN_LIMIT).map((ids) =>
      db.collection('policyCommissionSummaries').where('runId', 'in', ids).select(...fields).get()
    )
  );

  const rows: InsightsPolicyRow[] = [];
  for (const snap of snaps) {
    for (const d of snap.docs) {
      const x: any = d.data();
      if (str(x.agentId) !== agentId) continue;
      const runId = str(x.runId);
      const templateId = str(x.templateId) || jobMeta[runId]?.templateId;
      const ym = ymByJobId[runId];
      if (!templateId || !ym || hekefTemplateIds.has(templateId)) continue;
      rows.push({
        templateId,
        ym,
        reportMonth: str(x.reportMonth),
        product: x.product,
        productGroup: str(x.productGroup || x.productsGroup),
        company: str(x.company) || 'חברה לא ידועה',
        policyNumberKey: str(x.policyNumberKey),
        customerId: str(x.customerId),
        premium: num(x.totalPremiumAmount),
        commission: num(x.totalCommissionAmount),
        runId,
        ...(withDetails ? { fullName: str(x.fullName), agentCode: str(x.agentCode) } : {}),
      });
    }
  }
  return rows;
}

/**
 * אינדקס "תיק נוכחי" — נשמר במטמון לצד הסיכומים.
 * לכל תבנית: חודש הפרסום + חודש הדיווח שנבחרו, והטעינות שמהן הגיעו השורות.
 * מאפשר לרשימת הפוליסות לשלוף רק את הטעינות הרלוונטיות.
 */
export type PortfolioIndex = Record<
  string,
  { ym: string; reportMonth: string; jobIds: string[]; companies: string[] }
>;

export function buildPortfolioIndex(rows: InsightsPolicyRow[], jobByRow: (r: InsightsPolicyRow) => string): PortfolioIndex {
  const { latestYm, maxReportMonth } = portfolioWindows(rows);
  const idx: Record<string, { ym: string; reportMonth: string; jobIds: Set<string>; companies: Set<string> }> = {};

  for (const r of rows) {
    const t = r.templateId;
    if (r.ym !== latestYm[t] || r.reportMonth !== maxReportMonth[t]) continue;
    if (!idx[t]) idx[t] = { ym: latestYm[t], reportMonth: maxReportMonth[t], jobIds: new Set(), companies: new Set() };
    const jobId = jobByRow(r);
    if (jobId) idx[t].jobIds.add(jobId);
    idx[t].companies.add(r.company);
  }

  return Object.fromEntries(
    Object.entries(idx).map(([t, v]) => [
      t,
      { ym: v.ym, reportMonth: v.reportMonth, jobIds: Array.from(v.jobIds), companies: Array.from(v.companies) },
    ])
  );
}

/**
 * משקי בית של הסוכן מניהול לקוחות: ת"ז קנונית → parentID + גודל המשפחה.
 * מחזיר גם חתימה קצרה כדי שקישור/ניתוק משפחה יבטל את מטמון הסקירה.
 */
export async function loadHouseholds(db: Db, agentId: string): Promise<{ map: HouseholdMap; signature: string }> {
  const snap = await db.collection('customer').where('AgentId', '==', agentId).select('IDCustomer', 'parentID').get();
  const parentOf: Record<string, string> = {};
  const size: Record<string, number> = {};
  const pairs: string[] = [];
  snap.docs.forEach((d) => {
    const x: any = d.data();
    const cid = canonCustomerId(x.IDCustomer);
    if (!cid) return;
    const parent = str(x.parentID) || d.id;
    parentOf[cid] = parent;
    size[parent] = (size[parent] || 0) + 1;
    pairs.push(`${cid}:${parent}`);
  });
  const map: HouseholdMap = {};
  Object.entries(parentOf).forEach(([cid, parent]) => (map[cid] = { household: parent, groupSize: size[parent] }));
  pairs.sort();
  return { map, signature: `${pairs.length}:${simpleHash(pairs.join('|'))}` };
}

function simpleHash(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}