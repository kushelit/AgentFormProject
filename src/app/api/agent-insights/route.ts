// ═══════════════════════════════════════════════════════════════════
// app/api/agent-insights/route.ts
// מקור הנתונים היחיד לסקירה + מוצרים. הכל לפי חודש פרסום (ym).
// השליפות עצמן ב-lib/insights/serverData (משותף עם רשימת הפוליסות).
// הכנסות: ymCommissionSummaries (אותו מקור של טבלת "לפי חודש פרסום").
//
// מטמון: agentInsightsCache/{agentId}_{year}
//   חתימה = טעינות השנה (jobId + ym + זמן כתיבה) + הכנסות + הגדרות התבניות.
//   חתימה זהה, בתוקף ובמבנה מלא → מחזירים מיד בלי לקרוא מסמכי פוליסות.
//   תוקף מקסימלי 12 שעות (רשת ביטחון למחיקות גורפות).
//
// נפרעים בלבד — ללא תבניות hekefType (כולל תבניות לא פעילות).
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { admin } from '@/lib/firebase/firebase-admin';
import { computeInsights, type InsightsIncomeRow } from '@/lib/insights/computeInsights';
import {
  buildPortfolioIndex,
  fetchPolicyRows,
  loadHouseholds,
  loadJobMeta,
  loadJobYms,
  loadTemplates,
  num,
  str,
  tsMillis,
} from '@/lib/insights/serverData';

export const maxDuration = 60;

const INSIGHTS_CACHE_COLLECTION = 'agentInsightsCache';
const CACHE_VERSION = 10; // להעלות כשמשנים את לוגיקת החישוב — מבטל את כל המטמון
const CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
/** מטמון שחושב לפני פחות מזה מוחזר מיד — בקריאה של מסמך אחד, בלי בדיקת חתימה */
const FRESH_MS = 15 * 60 * 1000;

/** מטמון נחשב תקין רק אם יש בו את כל השדות שהקוד הנוכחי מצפה להם */
function isCompleteInsights(x: any): boolean {
  return (
    !!x &&
    !!x.portfolio?.categories &&
    Array.isArray(x.income?.months) &&
    Array.isArray(x.income?.recentYms) &&
    Array.isArray(x.income?.recentByCompany) &&
    typeof x.income?.annualRunRate === 'number' &&
    Array.isArray(x.products?.byCompany) &&
    Array.isArray(x.products?.byMonth) &&
    Array.isArray(x.efficiency?.byDepth)
  );
}

export async function POST(req: NextRequest) {
  try {
    const { agentId, year, force } = await req.json();
    if (!agentId || !year) {
      return NextResponse.json({ error: 'missing params' }, { status: 400 });
    }

    const startedAt = Date.now();
    const db = admin.firestore();
    const yearStr = String(year);
    const cacheRef = db.collection(INSIGHTS_CACHE_COLLECTION).doc(`${agentId}_${yearStr}`);

    // ─── מסלול מהיר: מטמון טרי → מסמך אחד ──────────────────────────────────
    const cacheSnap = await cacheRef.get();
    if (!force && cacheSnap.exists && cacheSnap.get('v') === CACHE_VERSION) {
      const age = Date.now() - tsMillis(cacheSnap.get('updatedAt'));
      const cached = cacheSnap.get('insights');
      if (age >= 0 && age < FRESH_MS && isCompleteInsights(cached)) {
        console.log(`[agent-insights] fresh cache ${agentId}_${yearStr} in ${Date.now() - startedAt}ms`);
        return NextResponse.json(cached);
      }
    }

    // ─── במקביל: תבניות, ריצות, הכנסות (השנה בלבד), משקי בית ─────────────────
    const [tpl, ymByJobId, incomeSnap, hh] = await Promise.all([
      loadTemplates(db),
      loadJobYms(db, agentId, yearStr),
      db
        .collection('ymCommissionSummaries')
        .where('agentId', '==', agentId)
        .where('ym', '>=', `${yearStr}-01`)
        .where('ym', '<=', `${yearStr}-12`)
        .select('ym', 'company', 'templateId', 'totalCommissionAmount')
        .get(),
      loadHouseholds(db, agentId),
    ]);
    const { templatesById, hekefTemplateIds, activeTemplateIds } = tpl;

    // ─── הכנסות ─────────────────────────────────────────────────────────────
    const incomeRows: InsightsIncomeRow[] = [];
    let incomeSigTotal = 0;
    incomeSnap.docs.forEach((d) => {
      const x: any = d.data();
      const ym = str(x.ym);
      if (!ym.startsWith(`${yearStr}-`)) return;
      if (hekefTemplateIds.has(str(x.templateId))) return;
      const amount = num(x.totalCommissionAmount);
      incomeRows.push({ ym, company: str(x.company) || 'חברה לא ידועה', amount });
      incomeSigTotal += amount;
    });

    // ─── טעינות שהצליחו ─────────────────────────────────────────────────────
    const jobMeta = await loadJobMeta(db, Object.keys(ymByJobId), hekefTemplateIds);
    const jobIds = Object.keys(jobMeta).sort();

    // ─── חתימה + מטמון ──────────────────────────────────────────────────────
    const involvedTemplates = Array.from(new Set(jobIds.map((id) => jobMeta[id].templateId))).sort();
    const signature = createHash('sha1')
      .update(
        JSON.stringify({
          v: CACHE_VERSION,
          jobs: jobIds.map((id) => [id, ymByJobId[id], jobMeta[id].createdAt]),
          income: [incomeRows.length, Math.round(incomeSigTotal * 100)],
          households: hh.signature, // קישור/ניתוק משפחה בניהול לקוחות → חישוב מחדש
          templates: involvedTemplates.map((tid) => {
            const t: any = templatesById[tid] || {};
            return [tid, t.Name ?? '', !!t.isactive, t.defaultPremiumField ?? '', t.fallbackProduct ?? '', t.productMap ?? {}];
          }),
        })
      )
      .digest('hex');

    if (cacheSnap.exists && cacheSnap.get('signature') === signature) {
      const age = Date.now() - tsMillis(cacheSnap.get('updatedAt'));
      const cached = cacheSnap.get('insights');
      if (age >= 0 && age < CACHE_MAX_AGE_MS && isCompleteInsights(cached) && cacheSnap.get('portfolioIndex')) {
        console.log(`[agent-insights] cache hit ${agentId}_${yearStr} in ${Date.now() - startedAt}ms`);
        // הנתונים לא השתנו — מסמנים את המטמון כטרי, כדי שהטעינות הבאות ילכו במסלול המהיר
        cacheRef.update({ updatedAt: admin.firestore.FieldValue.serverTimestamp() }).catch(() => undefined);
        return NextResponse.json(cached);
      }
    }

    // ─── פוליסות של כל טעינות השנה ──────────────────────────────────────────
    const tSetup = Date.now() - startedAt;
    const policyRows = await fetchPolicyRows({ db, agentId, jobIds, ymByJobId, jobMeta, hekefTemplateIds, withDetails: true });
    const tFetch = Date.now() - startedAt - tSetup;

    const insights = computeInsights({
      agentId,
      year: yearStr,
      templatesById,
      activeTemplateIds,
      policyRows,
      incomeRows,
      households: hh.map,
    });

    // אינדקס לרשימת הפוליסות (לא נשלח לדפדפן)
    const portfolioIndex = buildPortfolioIndex(policyRows, (r) => r.runId ?? '');
    const tCompute = Date.now() - startedAt - tSetup - tFetch;

    // שמירה למטמון לפני התשובה — סקירת ה-AI ורשימת הפוליסות נשענות על המסמך הזה.
    // set מלא מנקה גם סקירת AI קודמת (החתימה השתנתה).
    // Firestore דוחה undefined — הסבב דרך JSON מסיר אותו (ו-NaN/Infinity הופכים ל-null).
    // כשל בכתיבה = סקירת ה-AI לא תעבוד (insights_not_ready), לכן נרשם בבירור.
    try {
      const plain = JSON.parse(JSON.stringify({ insights, portfolioIndex }));
      await cacheRef.set({
        v: CACHE_VERSION,
        signature,
        insights: plain.insights,
        portfolioIndex: plain.portfolioIndex,
        agentId,
        year: yearStr,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e: any) {
      console.error(`[agent-insights] CACHE WRITE FAILED ${agentId}_${yearStr} — סקירת AI לא תעבוד עד שזה נפתר:`, e?.message ?? e);
    }

    const tWrite = Date.now() - startedAt - tSetup - tFetch - tCompute;
    console.log(
      `[agent-insights] computed ${agentId}_${yearStr}: ${jobIds.length} jobs, ${policyRows.length} policies, ${incomeRows.length} income rows — ` +
        `total ${Date.now() - startedAt}ms (setup ${tSetup} · fetch ${tFetch} · compute ${tCompute} · cache-write ${tWrite})`
    );

    return NextResponse.json(insights);
  } catch (err: any) {
    console.error('[agent-insights]', err);
    return NextResponse.json({ error: err.message ?? 'server error' }, { status: 500 });
  }
}