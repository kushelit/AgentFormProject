// ═══════════════════════════════════════════════════════════════════
// app/api/commission-summary-drilldown/route.ts
// תיקון: סינון לפי templateId (אם נשלח) — כך שדריל-דאון לפי סוכן
// מתוך תבנית ספציפית לא יציג/ייצא פוליסות מתבניות אחרות
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';

export async function POST(req: NextRequest) {
  const { agentId, companyId, agentCode, reportMonth, templateId } = await req.json();

  if (!agentId || !companyId || !agentCode || !reportMonth) {
    return NextResponse.json({ error: 'missing params' }, { status: 400 });
  }

  try {
    const db = admin.firestore();

    // ─── שלוף templateIds שהם "היקף" — אלה שיש להם hekefType ──────────────
    const templatesSnap = await db
      .collection('commissionTemplates')
      .where('isactive', '==', true)
      .get();

    const hekefTemplateIds = new Set(
      templatesSnap.docs
        .filter(d => !!d.data().hekefType)
        .map(d => d.id)
    );

    let query = db
      .collection('policyCommissionSummaries')
      .where('agentId', '==', agentId)
      .where('companyId', '==', companyId)
      .where('agentCode', '==', String(agentCode).trim())
      .where('reportMonth', '==', String(reportMonth).trim());

    // 🔧 אם נשלח templateId — מסננים ישירות ב-Firestore לתבנית הספציפית
    if (templateId) {
      query = query.where('templateId', '==', String(templateId).trim());
    }

    const snap = await query
      .orderBy('totalCommissionAmount', 'desc')
      .limit(1000)
      .get();

    const rows = snap.docs
      .map((d) => {
        const x: any = d.data();
        return {
          policyNumberKey: x.policyNumberKey,
          customerId: x.customerId,
          fullName: x.fullName,
          product: x.product,
          templateId: x.templateId,
          totalCommissionAmount: x.totalCommissionAmount ?? 0,
          totalPremiumAmount: x.totalPremiumAmount ?? 0,
          commissionRate: x.commissionRate ?? 0,
          validMonth: x.validMonth,
          runId: x.runId,
        };
      })
      // ─── סינון: רק templates שאין להם hekefType (= "נפרעים") ─────────────
      // (לא רלוונטי בפועל אם templateId כבר סונן לעיל ספציפית, אבל נשאר כהגנה
      //  למקרה שנקראים בלי templateId — כמו מהטבלה "פירוט עבור חברה")
      .filter((r) => !hekefTemplateIds.has(r.templateId));

    return NextResponse.json({ rows });

  } catch (err: any) {
     console.error('[commission-summary-drilldown]', err);
    return NextResponse.json(
      { error: err.message ?? 'server error' },
      { status: 500 }
    );
  }
}