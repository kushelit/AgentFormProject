// ═══════════════════════════════════════════════════════════════════
// app/api/customer-commission-by-ym/route.ts
//
// "לפי חודש פרסום" ברמת לקוח (או תא משפחתי) - חוצה חברות.
// אותו join מדויק כמו ב-commission-summary-drilldown (ym branch), עם שני שיפורי ביצועים
// שנמדדו בפועל (ראו timing log למטה):
//   1. portalImportRuns: מצומצם מראש רק לחברות הרלוונטיות ללקוח (מ-policyCommissionSummaries שלו),
//      לא לכל הסוכן - פחות jobIds
//   2. externalCommissions: שאילתה נפרדת לכל customerId (runId ∈ chunk AND customerId == X) במקום
//      שאילתה רחבה אחת לפי runId בלבד - Firestore היה מחזיר את כל לקוחות אותה ריצה (נמדד: 9,670
//      מסמכים מיותרים) ורק מסננים אח"כ בזיכרון; עכשיו Firestore עצמו מצמצם
//   3. commissionTemplates: רץ במקביל (Promise, לא await) לכל שאר השרשרת - לא תלוי בשום דבר אחר
//
// mode: 'current' ("תיק נוכחי") — במקום ym אחד: לכל תבנית חודש הפרסום האחרון שלה ברמת הסוכן
// (כמו קוביות "תיק נוכחי" בסקירה), ובתוכו חודש הדיווח האחרון. כל שורה חוזרת עם ym.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import { loadJobMeta } from '@/lib/insights/serverData';
import { guardAgentAccess } from '@/lib/server/auth';

function roundTo2(num: number) {
  return Math.round(num * 100) / 100;
}

function canonOf(v: any): string {
  return String(v ?? '').replace(/\D/g, '').replace(/^0+/, '');
}

/** חודש דיווח לפורמט YYYY-MM (גם MM/YYYY או MM-YYYY) — להשוואה בין חודשים */
function normMonth(v: any): string {
  const s = String(v ?? '').trim().replace(/\//g, '-');
  const m = s.match(/^(\d{1,2})-(\d{4})$/);
  return m ? `${m[2]}-${m[1].padStart(2, '0')}` : s;
}

interface Row {
  ym?: string;
  policyNumberKey: string;
  customerId: string;
  fullName?: string;
  company?: string;
  product?: string;
  templateId: string;
  reportMonth: string;
  totalCommissionAmount: number;
  totalPremiumAmount: number;
}

export async function POST(req: NextRequest) {
  const { agentId, customerIds, ym, mode } = await req.json();
  const denied = await guardAgentAccess(req, agentId, 'customer-commission-by-ym');
  if (denied) return denied;
  const isCurrent = mode === 'current';

  if (!agentId || (!ym && !isCurrent) || !Array.isArray(customerIds) || !customerIds.length) {
    return NextResponse.json({ error: 'missing params (agentId, customerIds, ym | mode=current)' }, { status: 400 });
  }

  try {
    const t0 = Date.now();
    const db = admin.firestore();

    // templates לא תלוי בשום דבר אחר כאן (משמש רק בסינון הסופי) - מריצים אותו במקביל
    // לשרשרת ownPolicy->portalRuns במקום לחכות לו קודם
    const templatesPromise = db
      .collection('commissionTemplates')
      .where('isactive', '==', true)
      .get();

    // 1) צמצום מראש: אילו חברות בכלל רלוונטיות ללקוחות האלה (לא כל הסוכן) -
    // כדי לא לשלוף portalImportRuns/externalCommissions עבור חברות שלא נוגעות ללקוח הזה בכלל
    const ownPolicySnap = await db
      .collection('policyCommissionSummaries')
      .where('agentId', '==', agentId)
      .where('customerId', 'in', (customerIds as string[]).slice(0, 30))
      .get();
    const relevantCompanyIds = Array.from(new Set(
      ownPolicySnap.docs.map((d) => String(d.data()?.companyId || '')).filter(Boolean)
    ));
    const t2 = Date.now();

    // 2) ריצות הפורטל של הסוכן, מצומצם לחברות הרלוונטיות בלבד.
    //    רגיל: רק ב-ym המבוקש. תיק נוכחי: כל החודשים, ואז בחירה לפי תבנית (למטה).
    let portalRunsQuery: FirebaseFirestore.Query = db
      .collection('portalImportRuns')
      .where('agentId', '==', agentId);
    if (!isCurrent) portalRunsQuery = portalRunsQuery.where('resolvedWindow.ym', '==', String(ym).trim());

    if (relevantCompanyIds.length > 0 && relevantCompanyIds.length <= 30) {
      portalRunsQuery = portalRunsQuery.where('companyId', 'in', relevantCompanyIds);
    }
    // אם יש יותר מ-30 חברות רלוונטיות (נדיר מאוד) - לא מסננים, נופלים חזרה להתנהגות הקודמת (כל הסוכן)

    const portalRunsSnap = await portalRunsQuery.select('resolvedWindow.ym', 'queue.jobIds').get();

    // jobId → חודש פרסום (אם אותה טעינה מופיעה בכמה ריצות — החודש המאוחר)
    const ymByJobId: Record<string, string> = {};
    for (const d of portalRunsSnap.docs) {
      const runYm = String(d.get('resolvedWindow.ym') || '').trim();
      if (!runYm) continue;
      const ids: string[] = d.get('queue.jobIds') || [];
      for (const raw of ids) {
        const id = String(raw || '').trim();
        if (id && (!ymByJobId[id] || runYm > ymByJobId[id])) ymByJobId[id] = runYm;
      }
    }

    let jobIds = Object.keys(ymByJobId);
    // תיק נוכחי: templateId של כל טעינה (כולל ידנית מגושרת), ולכל תבנית רק טעינות חודש הפרסום האחרון שלה
    let templateByJobId: Record<string, string> = {};
    if (isCurrent && jobIds.length) {
      const templatesSnap = await templatesPromise;
      const hekefIds = new Set(templatesSnap.docs.filter((d) => !!d.data().hekefType).map((d) => d.id));
      const jobMeta = await loadJobMeta(db, jobIds, hekefIds);
      templateByJobId = Object.fromEntries(Object.entries(jobMeta).map(([id, m]) => [id, m.templateId]));

      const latestYm: Record<string, string> = {};
      for (const [id, tid] of Object.entries(templateByJobId)) {
        if (!latestYm[tid] || ymByJobId[id] > latestYm[tid]) latestYm[tid] = ymByJobId[id];
      }
      jobIds = jobIds.filter((id) => templateByJobId[id] && ymByJobId[id] === latestYm[templateByJobId[id]]);
    }
    const t3 = Date.now();

    if (!jobIds.length) {
      console.log('[customer-commission-by-ym] timing (no jobIds):', { ownPolicy: t2 - t0, portalRuns: t3 - t2 });
      return NextResponse.json({ rows: [] });
    }

    // 3) externalCommissions (ledger גולמי) - שאילתה צרה לכל לקוח בנפרד (runId ∈ chunk AND customerId == X),
    // במקום שאילתה רחבה אחת לפי runId בלבד שמביאה את *כל* לקוחות אותה ריצה (יכול להיות אלפי מסמכים
    // מיותרים - זה היה צוואר הבקבוק שנמדד: jobIds=6 אבל externalDocsCount=9670).
    // Firestore מאפשר תנאי 'in' אחד בלבד לשאילתה, אבל מותר לשלב אותו עם '==' על שדה אחר -
    // ולכן runId 'in' + customerId '==' יחד הם חוקיים ומצמצמים כבר ב-Firestore, לא רק בזיכרון.
    const targetIds = Array.from(new Set((customerIds as string[]).filter(Boolean)));

    const jobIdChunks: string[][] = [];
    for (let i = 0; i < jobIds.length; i += 30) jobIdChunks.push(jobIds.slice(i, i + 30));

    const externalSnaps = await Promise.all(
      targetIds.flatMap((cid) =>
        jobIdChunks.map((chunk) =>
          db.collection('externalCommissions')
            .where('agentId', '==', agentId)
            .where('runId', 'in', chunk)
            .where('customerId', '==', cid)
            .get()
        )
      )
    );
    const externalDocs = externalSnaps.flatMap((snap) => snap.docs);
    const t4 = Date.now();

    // עכשיו באמת צריכים את התבניות, לצורך הסינון - נחכה לפרומיס שכבר רץ ברקע
    const templatesSnap = await templatesPromise;
    const hekefTemplateIds = new Set(
      templatesSnap.docs.filter((d) => !!d.data().hekefType).map((d) => d.id)
    );
    const t4b = Date.now();

    // 4) סינון ללקוחות המבוקשים בלבד - התאמה מנורמלת (כמו שאר המערכת מתמודדת עם 0 מוביל)
    const targetCanon = new Set(customerIds.map(canonOf).filter(Boolean));

    const map = new Map<string, Row>();

    for (const doc of externalDocs) {
      const r = doc.data() as any;
      if (!targetCanon.has(canonOf(r.customerId))) continue;

      const runId = String(r.runId || '').trim();
      const tid = String(r.templateId || '') || templateByJobId[runId] || '';
      if (hekefTemplateIds.has(tid)) continue;

      const policyNumberKey = String(r.policyNumberKey || '').trim();
      const customerId = String(r.customerId || '').trim();
      const reportMonth = String(r.reportMonth || '').trim();
      if (!policyNumberKey || !customerId) continue;

      const key = `${policyNumberKey}_${customerId}_${tid}_${reportMonth}`;

      if (!map.has(key)) {
        map.set(key, {
          ym: ymByJobId[runId],
          policyNumberKey,
          customerId,
          fullName: r.fullName ? String(r.fullName).trim() : undefined,
          company: r.company ? String(r.company).trim() : undefined,
          product: r.product ? String(r.product).trim() : undefined,
          templateId: tid,
          reportMonth,
          totalCommissionAmount: 0,
          totalPremiumAmount: 0,
        });
      }

      const agg = map.get(key)!;
      agg.totalCommissionAmount += Number(r.commissionAmount || 0);
      agg.totalPremiumAmount += Number(r.premium || 0);
      if (!agg.fullName && r.fullName) agg.fullName = String(r.fullName).trim();
      if (!agg.company && r.company) agg.company = String(r.company).trim();
      if (!agg.product && r.product) agg.product = String(r.product).trim();
    }

    let aggregated = Array.from(map.values());

    // תיק נוכחי: בתוך חודש הפרסום — רק חודש הדיווח האחרון של כל תבנית
    // (יתרת צבירה אסור לסכום על פני חודשים; תיקוני רטרו לא נכנסים לתמונה השוטפת)
    if (isCurrent) {
      const maxReportMonth: Record<string, string> = {};
      for (const r of aggregated) {
        const m = normMonth(r.reportMonth);
        if (!maxReportMonth[r.templateId] || m > maxReportMonth[r.templateId]) maxReportMonth[r.templateId] = m;
      }
      aggregated = aggregated.filter((r) => normMonth(r.reportMonth) === maxReportMonth[r.templateId]);
    }

    const rows = aggregated.map((r) => ({
      ...r,
      totalCommissionAmount: roundTo2(r.totalCommissionAmount),
      totalPremiumAmount: roundTo2(r.totalPremiumAmount),
    }));

    rows.sort((a, b) => b.totalCommissionAmount - a.totalCommissionAmount);
    const t5 = Date.now();

    console.log('[customer-commission-by-ym] timing:', {
      ownPolicy: t2 - t0,
      portalRuns: t3 - t2,
      externalCommissions: t4 - t3,
      templatesWait: t4b - t4, // אם זה קרוב ל-0, templatesPromise כבר סיים ברקע ולא חיכינו לו בכלל
      filterAndAggregate: t5 - t4b,
      total: t5 - t0,
      jobIdsCount: jobIds.length,
      externalDocsCount: externalDocs.length,
      relevantCompanyIdsCount: relevantCompanyIds.length,
    });

    return NextResponse.json({ rows });
  } catch (err: any) {
    console.error('[customer-commission-by-ym]', err);
    return NextResponse.json({ error: err.message ?? 'server error' }, { status: 500 });
  }
}