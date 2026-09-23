// ═══════════════════════════════════════════════════════════════════
// app/api/commission-summary-premium-kpis/route.ts
// קוביות KPI: צבירה פיננסית / פרמיה פנסיה / פרמיה ביטוח (+ פילוח לפי חברה)
// לפי חודש הפרסום האחרון של כל תבנית
//
// שרשרת חודש פרסום (אותו מנגנון של ה-drilldown):
//   portalImportRuns.resolvedWindow.ym
//     → portalImportRuns.queue.jobIds   (אוטומטי: jobId | מגשר: runId ידני)
//     → commissionImportRuns/{jobId}     (קיים רק לטעינה שהצליחה + templateId)
//     → policyCommissionSummaries.runId == jobId
//
// ביצועים — מטמון premiumKpiCache/{agentId}_{year}:
//   שלבים 1-3 קלים (ריצות + מטא של טעינות) → חתימה.
//   חתימה זהה למטמון → מחזירים מיד, בלי לקרוא מסמכי פוליסות.
//   החתימה כוללת: jobIds שנבחרו + זמן כתיבת כל טעינה + הגדרות התבניות הרלוונטיות.
//
// מקור: נפרעים בלבד — ללא תבניות hekefType.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { admin } from '@/lib/firebase/firebase-admin';
import { computePremiumKpis, type PremiumKpiRow } from '@/utils/premiumKpis';
import type { TemplateDoc } from '@/types/ContractCommissionComparison';

const CACHE_COLLECTION = 'premiumKpiCache';
const CACHE_VERSION = 2;  // להעלות כשמשנים את לוגיקת החישוב — מבטל את כל המטמון
const IN_LIMIT = 30;      // מגבלת Firestore ל-where('in')
const GETALL_CHUNK = 100;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const s = (v: any) => String(v ?? '').trim();

const tsMillis = (v: any): number =>
  typeof v?.toMillis === 'function' ? v.toMillis() : Number(v?._seconds ?? 0) * 1000;

export async function POST(req: NextRequest) {
  try {
    const { agentId, year } = await req.json();

    if (!agentId || !year) {
      return NextResponse.json({ error: 'missing params' }, { status: 400 });
    }

    const db = admin.firestore();
    const yearPrefix = `${year}-`;
    const cacheRef = db.collection(CACHE_COLLECTION).doc(`${agentId}_${year}`);

    // ─── במקביל: תבניות + ריצות הסוכן + מטמון ─────────────────────────────
    const [templatesSnap, portalRunsSnap, cacheSnap] = await Promise.all([
      db.collection('commissionTemplates').get(),
      db
        .collection('portalImportRuns')
        .where('agentId', '==', agentId)
        .select('resolvedWindow.ym', 'queue.jobIds')
        .get(),
      cacheRef.get(),
    ]);

    const templatesById: Record<string, TemplateDoc> = {};
    const hekefTemplateIds = new Set<string>();
    const activeTemplateIds = new Set<string>();

    templatesSnap.docs.forEach((d) => {
      const t: any = d.data();
      templatesById[d.id] = t as TemplateDoc;
      if (t.hekefType) hekefTemplateIds.add(d.id);
      if (t.isactive) activeTemplateIds.add(d.id);
    });

    // ─── 1) jobId → ym ─────────────────────────────────────────────────────
    const ymByJobId: Record<string, string> = {};
    portalRunsSnap.docs.forEach((d) => {
      const r: any = d.data();
      const ym = s(r?.resolvedWindow?.ym);
      if (!ym.startsWith(yearPrefix)) return;

      const jobIds: string[] = Array.isArray(r?.queue?.jobIds) ? r.queue.jobIds : [];
      for (const raw of jobIds) {
        const jobId = s(raw);
        if (!jobId) continue;
        if (!ymByJobId[jobId] || ym > ymByJobId[jobId]) ymByJobId[jobId] = ym;
      }
    });

    const allJobIds = Object.keys(ymByJobId);
    if (!allJobIds.length) {
      return NextResponse.json(computePremiumKpis([], templatesById));
    }

    // ─── 2) commissionImportRuns — רק טעינות שהצליחו + templateId ───────────
    const templateByJobId: Record<string, string> = {};
    const writtenAtByJobId: Record<string, number> = {};

    const runChunks = await Promise.all(
      chunk(allJobIds, GETALL_CHUNK).map((ids) =>
        db.getAll(
          ...ids.map((id) => db.collection('commissionImportRuns').doc(id)),
          { fieldMask: ['templateId', 'createdAt'] }
        )
      )
    );

    runChunks.flat().forEach((snap) => {
      if (!snap.exists) return; // טעינה שנכשלה / נמחקה
      const data: any = snap.data();
      const templateId = s(data?.templateId);
      if (!templateId || hekefTemplateIds.has(templateId)) return;
      templateByJobId[snap.id] = templateId;
      writtenAtByJobId[snap.id] = tsMillis(data?.createdAt);
    });

    // ─── 3) לכל תבנית — ה-ym האחרון, וכל ה-jobIds של אותו ym ───────────────
    const latestYmByTemplate: Record<string, string> = {};
    for (const [jobId, templateId] of Object.entries(templateByJobId)) {
      const ym = ymByJobId[jobId];
      if (!latestYmByTemplate[templateId] || ym > latestYmByTemplate[templateId]) {
        latestYmByTemplate[templateId] = ym;
      }
    }

    const selectedJobIds = Object.entries(templateByJobId)
      .filter(([jobId, templateId]) => ymByJobId[jobId] === latestYmByTemplate[templateId])
      .map(([jobId]) => jobId)
      .sort();

    // ─── חתימה + בדיקת מטמון ────────────────────────────────────────────────
    const involvedTemplates = Object.keys(latestYmByTemplate).sort();
    const signature = createHash('sha1')
      .update(
        JSON.stringify({
          v: CACHE_VERSION,
          jobs: selectedJobIds.map((id) => [id, ymByJobId[id], writtenAtByJobId[id]]),
          templates: involvedTemplates.map((tid) => {
            const t: any = templatesById[tid] || {};
            return [
              tid,
              t.Name ?? '',
              !!t.isactive,
              t.defaultPremiumField ?? '',
              t.fallbackProduct ?? '',
              t.productMap ?? {},
            ];
          }),
        })
      )
      .digest('hex');

    if (cacheSnap.exists && cacheSnap.get('signature') === signature) {
      return NextResponse.json(cacheSnap.get('kpis'));
    }

    // ─── 4) policyCommissionSummaries לפי runId ─────────────────────────────
    const rawDocs = (
      await Promise.all(
        chunk(selectedJobIds, IN_LIMIT).map((ids) =>
          db
            .collection('policyCommissionSummaries')
            .where('runId', 'in', ids)
            .select(
              'agentId',
              'policyNumberKey',
              'customerId',
              'product',
              'totalPremiumAmount',
              'company',
              'templateId',
              'reportMonth',
              'runId'
            )
            .get()
        )
      )
    ).flatMap((snap) => snap.docs.map((d) => d.data() as any));

    // הגנה: אם טעינה מכילה כמה חודשי דיווח — רק חודש הדיווח האחרון לכל תבנית
    const maxReportMonthByTemplate: Record<string, string> = {};
    for (const x of rawDocs) {
      if (s(x.agentId) !== agentId) continue;
      const tid = s(x.templateId) || templateByJobId[s(x.runId)];
      const rm = s(x.reportMonth);
      if (!tid || !rm) continue;
      if (!maxReportMonthByTemplate[tid] || rm > maxReportMonthByTemplate[tid]) {
        maxReportMonthByTemplate[tid] = rm;
      }
    }

    const rows: PremiumKpiRow[] = [];
    for (const x of rawDocs) {
      if (s(x.agentId) !== agentId) continue;
      const templateId = s(x.templateId) || templateByJobId[s(x.runId)];
      if (!templateId || hekefTemplateIds.has(templateId)) continue;
      if (s(x.reportMonth) !== maxReportMonthByTemplate[templateId]) continue;

      rows.push({
        policyNumberKey: x.policyNumberKey,
        customerId: x.customerId,
        product: x.product,
        totalPremiumAmount: Number(x.totalPremiumAmount) || 0,
        companyName: x.company || '',
        templateId,
        month: latestYmByTemplate[templateId],
      });
    }

    const kpis = computePremiumKpis(rows, templatesById);

    // אזהרת "תבניות בחודש קודם" — רק לתבניות פעילות
    kpis.staleTemplates = kpis.staleTemplates.filter((t) =>
      activeTemplateIds.has(t.templateId)
    );

    // שמירה למטמון — לא חוסם את התשובה אם נכשל
    cacheRef
      .set({ signature, kpis, agentId, year: String(year), updatedAt: admin.firestore.FieldValue.serverTimestamp() })
      .catch((e: any) => console.error('[premium-kpis] cache write failed', e));

    return NextResponse.json(kpis);
  } catch (err: any) {
    console.error('[commission-summary-premium-kpis]', err);
    return NextResponse.json(
      { error: err.message ?? 'server error' },
      { status: 500 }
    );
  }
}