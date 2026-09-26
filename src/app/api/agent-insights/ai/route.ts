// ═══════════════════════════════════════════════════════════════════
// app/api/agent-insights/ai/route.ts
// סקירת AI על בסיס הנתונים המסוכמים שכבר במטמון (agentInsightsCache).
// נשלחים ל-AI רק סכומים מסוכמים לפי חברה/חודש/מוצר — לא שמות לקוחות ולא ת"ז.
// הסקירה נשמרת על מסמך המטמון עם החתימה, ונוצרת מחדש רק כשהנתונים משתנים
// (או כשמבקשים force).
// הקריאה ל-AI עוברת דרך lib/ai/client (מפתח, מודל ורישום עלויות במקום אחד).
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import { AiError, callClaude, extractJson } from '@/lib/ai/client';
import type { AiSummary, AiTone } from '@/types/agentInsights';
import { normalizeInsights } from '@/lib/insights/normalizeInsights';

export const maxDuration = 60;

const CACHE_COLLECTION = 'agentInsightsCache';
const TONES: AiTone[] = ['positive', 'negative', 'neutral', 'warning'];

const SYSTEM_PROMPT = `אתה אנליסט עסקי שכותב לסוכן ביטוח בישראל סקירה קצרה על התיק וההכנסות שלו.
תקבל JSON עם נתונים מסוכמים לשנה אחת. כל החודשים הם "חודש פרסום" (YYYY-MM).

הגדרות:
- portfolio: תמונת תיק לפי חודש הפרסום האחרון של כל תבנית. zvira = צבירה פיננסית (יתרה), pensionPremium = פרמיה חודשית בפנסיה, insurancePremium = פרמיה חודשית בביטוח.
- income: הכנסות מעמלות לפי חודש פרסום ולפי חברה. הנתונים מכסים רק את החודשים שנטענו (monthsWithData), ולכן totalYear איננו הכנסה שנתית — אל תציג אותו ככזה. להכנסה חודשית שוטפת השתמש ב-avgRecent (ממוצע החודשים ב-recentYms), ולצפי שנתי ב-annualRunRate.
- products: עמלות לפי מוצר בחודשים שנטענו.
- staleTemplates: דוחות שעדיין לא עודכנו לחודש הפרסום האחרון — הנתונים שלהם מחודש קודם.

כתוב 4 עד 6 תובנות, כל אחת משפט או שניים, בעברית פשוטה וישירה לסוכן (פנייה בגוף שני).
התייחס לפי הרלוונטיות: קצב ההכנסה החודשי והצפי השנתי, השינוי בחודש האחרון מול הקודם, ריכוזיות (חברה אחת מעל 40% מההכנסות או מהצבירה), הרכב התיק ומוצרים מובילים, ודוחות שעדיין לא עודכנו.
השתמש רק במספרים שמופיעים בנתונים. אל תמציא נתונים ואל תסיק סיבות שאין להן בסיס. עגל סכומים לשקלים שלמים עם מפריד אלפים. אל תיתן ייעוץ השקעות.

החזר JSON בלבד, בלי טקסט נוסף ובלי סימוני markdown, במבנה:
{"headline": "משפט פתיחה אחד", "insights": [{"tone": "positive|negative|neutral|warning", "text": "..."}]}`;

function buildAiInput(ins: ReturnType<typeof normalizeInsights>) {
  const top = <T,>(arr: T[], n: number) => arr.slice(0, n);
  const cat = ins.portfolio.categories;
  const productTotals: Record<string, number> = {};
  ins.products.byCompany.forEach((r) => {
    productTotals[r.product] = (productTotals[r.product] || 0) + r.amount;
  });

  return {
    year: ins.year,
    portfolio: {
      latestYm: ins.portfolio.latestYm,
      zvira: { total: cat.finansimZvira.amount, policies: cat.finansimZvira.policies, byCompany: top(cat.finansimZvira.byCompany, 8).map((c) => [c.company, c.amount]) },
      pensionPremium: { total: cat.pensiaPremia.amount, policies: cat.pensiaPremia.policies, byCompany: top(cat.pensiaPremia.byCompany, 8).map((c) => [c.company, c.amount]) },
      insurancePremium: { total: cat.insPremia.amount, policies: cat.insPremia.policies, byCompany: top(cat.insPremia.byCompany, 8).map((c) => [c.company, c.amount]) },
      staleTemplates: ins.portfolio.staleTemplates.map((t) => `${t.companyName} – ${t.templateName}: ${t.ym}`),
    },
    income: {
      monthsWithData: ins.income.monthsCount,
      totalYear: ins.income.totalYear,
      recentYms: ins.income.recentYms,
      avgRecent: ins.income.avgRecent,
      annualRunRate: ins.income.annualRunRate,
      recentByCompany: top(ins.income.recentByCompany, 10).map((c) => [c.company, c.amount]),
      byMonth: ins.income.months.map((m) => [m.ym, m.total]),
      lastYm: ins.income.lastYm,
      lastTotal: ins.income.lastTotal,
      prevYm: ins.income.prevYm,
      prevTotal: ins.income.prevTotal,
      changePct: ins.income.changePct,
    },
    products: Object.entries(productTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([p, amount]) => [p, Math.round(amount)]),
  };
}

function toSummary(j: any): Omit<AiSummary, 'generatedAt'> | null {
  const insights = Array.isArray(j?.insights)
    ? j.insights
        .map((x: any) => ({
          tone: (TONES.includes(x?.tone) ? x.tone : 'neutral') as AiTone,
          text: String(x?.text ?? '').trim(),
        }))
        .filter((x: any) => x.text)
    : [];
  if (!insights.length) return null;
  return { headline: String(j?.headline ?? '').trim(), insights };
}

export async function POST(req: NextRequest) {
  try {
    const { agentId, year, force } = await req.json();
    if (!agentId || !year) {
      return NextResponse.json({ error: 'missing params' }, { status: 400 });
    }

    const db = admin.firestore();
    const cacheRef = db.collection(CACHE_COLLECTION).doc(`${agentId}_${String(year)}`);
    const cacheSnap = await cacheRef.get();
    if (!cacheSnap.exists) {
      return NextResponse.json({ error: 'insights_not_ready' }, { status: 409 });
    }

    const signature = cacheSnap.get('signature');
    const cachedAi = cacheSnap.get('aiSummary') as AiSummary | undefined;
    if (!force && cachedAi && cacheSnap.get('aiSignature') === signature) {
      return NextResponse.json(cachedAi);
    }

    const insights = normalizeInsights(cacheSnap.get('insights'));
    if (!insights?.income?.months?.length && !insights?.portfolio?.latestYm) {
      return NextResponse.json({ error: 'no_data' }, { status: 404 });
    }

    const { text } = await callClaude({
      feature: 'agent-insights',
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(buildAiInput(insights)) }],
      maxTokens: 1200,
      meta: { agentId, year: String(year) },
    });

    let parsed: Omit<AiSummary, 'generatedAt'> | null = null;
    try {
      parsed = toSummary(extractJson(text));
    } catch {
      parsed = null;
    }
    if (!parsed) {
      console.error('[agent-insights/ai] unparsable response', text);
      return NextResponse.json(
        { error: 'ai_bad_response', detail: `תשובת המודל לא בפורמט הצפוי: ${text.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const aiSummary: AiSummary = { ...parsed, generatedAt: Date.now() };

    try {
      await cacheRef.set({ aiSummary, aiSignature: signature }, { merge: true });
    } catch (e) {
      console.error('[agent-insights/ai] cache write failed', e);
    }

    return NextResponse.json(aiSummary);
  } catch (err: any) {
    if (err instanceof AiError) {
      const code = err.code === 'not_configured' ? 'ai_not_configured' : 'ai_failed';
      return NextResponse.json({ error: code, detail: err.message }, { status: err.code === 'not_configured' ? 503 : 502 });
    }
    console.error('[agent-insights/ai]', err);
    return NextResponse.json({ error: 'server_error', detail: String(err?.message ?? err) }, { status: 500 });
  }
}
