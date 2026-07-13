// ═══════════════════════════════════════════════════════════════════
// app/api/commission-summary-by-template/route.ts
// תיקון יסודי: כשמסננים לפי ym (חודש פרסום), קוראים מ-externalCommissions
// (ה-ledger הגולמי, כל שורה מכל ריצה נשמרת בנפרד) ולא מ-commissionSummaries
// (מסמך ממוזג עם runId בודד לקבוצה, שלא יכול לשמר "כמה הגיע באיזו ריצה").
//
// בלי ym (תצוגת "לפי חודש דיווח") — שום שינוי, ממשיכים לקרוא את הסיכום
// הממוזג כמו קודם, כי שם בדיוק רוצים את הסכום המצטבר ההיסטורי.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import { getDocsByFieldInBatches } from '@/lib/server/firestoreBatch';

export async function POST(req: NextRequest) {
  const { agentId, companyId, year, ym } = await req.json();

  if (!agentId || !companyId) {
    return NextResponse.json({ error: 'missing params' }, { status: 400 });
  }

  try {
    const db = admin.firestore();

    // ─── templates "היקף" (hekefType) — לא נכללים בדף הנפרעים, בשני המצבים ──
    const templatesAllSnap = await db
      .collection('commissionTemplates')
      .where('isactive', '==', true)
      .get();

    const hekefTemplateIds = new Set(
      templatesAllSnap.docs
        .filter((d) => !!d.data().hekefType)
        .map((d) => d.id)
    );

    const byTemplateMonth: Record<string, Record<string, number>> = {};
    const allMonths = new Set<string>();

    if (ym) {
      // ─── מצב "לפי חודש פרסום": externalCommissions, מסונן לפי runId-ים ────
      const portalRunsSnap = await db
        .collection('portalImportRuns')
        .where('agentId', '==', agentId)
        .where('companyId', '==', companyId)
        .where('resolvedWindow.ym', '==', ym)
        .get();

      const jobIds: string[] = [];
      for (const d of portalRunsSnap.docs) {
        const ids: string[] = d.data()?.queue?.jobIds || [];
        jobIds.push(...ids);
      }

      //console.log('[template-drill] ym mode, jobIds:', jobIds.length);

      if (!jobIds.length) {
        return NextResponse.json({ byTemplateMonth: {}, templateNames: {}, allMonths: [] });
      }

      const externalDocs = await getDocsByFieldInBatches({
        collection: 'externalCommissions',
        field: 'runId',
        values: jobIds,
        extraWhere: [
          ['agentId', '==', agentId],
          ['companyId', '==', companyId],
        ],
      });

     // console.log('[template-drill] ym mode, externalCommissions rows:', externalDocs.length);

      for (const doc of externalDocs) {
        const r = doc.data() as any;
        const tid = String(r.templateId || '');
        const month = String(r.reportMonth || '');
        const amount = Number(r.commissionAmount || 0);

        if (!tid || !month) continue;
        if (hekefTemplateIds.has(tid)) continue;
        if (year && !month.startsWith(String(year))) continue;

        allMonths.add(month);
        if (!byTemplateMonth[tid]) byTemplateMonth[tid] = {};
        byTemplateMonth[tid][month] = (byTemplateMonth[tid][month] || 0) + amount;
      }
    } else {
      // ─── מצב "לפי חודש דיווח": commissionSummaries הממוזג, ללא שינוי ──────
      const snap = await db
        .collection('commissionSummaries')
        .where('agentId', '==', agentId)
        .where('companyId', '==', companyId)
        .get();

      const rows = snap.docs.map((d) => d.data() as any);

      const filtered = rows.filter((r) => {
        if (year && !String(r.reportMonth || '').startsWith(year)) return false;
        if (hekefTemplateIds.has(String(r.templateId || ''))) return false;
        return true;
      });

      for (const r of filtered) {
        const tid = String(r.templateId || '');
        const month = String(r.reportMonth || '');
        const amount = Number(r.totalCommissionAmount || 0);

        if (!tid || !month) continue;

        allMonths.add(month);
        if (!byTemplateMonth[tid]) byTemplateMonth[tid] = {};
        byTemplateMonth[tid][month] = (byTemplateMonth[tid][month] || 0) + amount;
      }
    }

    // ─── שלוף שמות תבניות (משותף לשני המצבים) ────────────────────────────
    const templateNames: Record<string, string> = {};
    const templateIds = Object.keys(byTemplateMonth);
    await Promise.all(
      templateIds.map(async (tid) => {
        const tSnap = await db.collection('commissionTemplates').doc(tid).get();
        if (tSnap.exists) {
          const data = tSnap.data() as any;
          templateNames[tid] = String(data.Name || data.type || tid);
        } else {
          templateNames[tid] = tid;
        }
      })
    );

    return NextResponse.json({
      byTemplateMonth,
      templateNames,
      allMonths: Array.from(allMonths).sort(),
    });
  } catch (err: any) {
    console.error('[commission-summary-by-template]', err);
    return NextResponse.json({ error: err.message ?? 'server error' }, { status: 500 });
  }
}