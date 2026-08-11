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
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';

function roundTo2(num: number) {
  return Math.round(num * 100) / 100;
}

function canonOf(v: any): string {
  return String(v ?? '').replace(/\D/g, '').replace(/^0+/, '');
}

interface Row {
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
  const { agentId, customerIds, ym } = await req.json();

  if (!agentId || !ym || !Array.isArray(customerIds) || !customerIds.length) {
    return NextResponse.json({ error: 'missing params (agentId, customerIds, ym)' }, { status: 400 });
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

    // 2) כל ריצות הפורטל שהתפרסמו ב-ym הזה לסוכן, מצומצם לחברות הרלוונטיות בלבד
    let portalRunsQuery: FirebaseFirestore.Query = db
      .collection('portalImportRuns')
      .where('agentId', '==', agentId)
      .where('resolvedWindow.ym', '==', String(ym).trim());

    if (relevantCompanyIds.length > 0 && relevantCompanyIds.length <= 30) {
      portalRunsQuery = portalRunsQuery.where('companyId', 'in', relevantCompanyIds);
    }
    // אם יש יותר מ-30 חברות רלוונטיות (נדיר מאוד) - לא מסננים, נופלים חזרה להתנהגות הקודמת (כל הסוכן)

    const portalRunsSnap = await portalRunsQuery.get();

    const jobIds: string[] = [];
    for (const d of portalRunsSnap.docs) {
      const ids: string[] = d.data()?.queue?.jobIds || [];
      jobIds.push(...ids);
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

      const tid = String(r.templateId || '');
      if (hekefTemplateIds.has(tid)) continue;

      const policyNumberKey = String(r.policyNumberKey || '').trim();
      const customerId = String(r.customerId || '').trim();
      const reportMonth = String(r.reportMonth || '').trim();
      if (!policyNumberKey || !customerId) continue;

      const key = `${policyNumberKey}_${customerId}_${tid}_${reportMonth}`;

      if (!map.has(key)) {
        map.set(key, {
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

    const rows = Array.from(map.values()).map((r) => ({
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