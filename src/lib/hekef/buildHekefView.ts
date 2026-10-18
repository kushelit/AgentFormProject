// src/lib/hekef/buildHekefView.ts
// Builds the "היקף" tab view for one agent + company + processing month from
// externalCommissions rows of hekef_commission templates (see functions/src/shared/import/standardize.ts).

export type HekefKind = 'current' | 'retro';
export type HekefCat = 'new' | 'increase' | 'decrease' | 'cancel' | 'risk' | 'transfer' | 'other';
export type HekefPolicyType = 'new' | 'cancel' | 'chg' | 'risk' | 'transfer' | 'none' | 'fix';
const HEKEF_CATS: HekefCat[] = ['new', 'increase', 'decrease', 'cancel', 'risk', 'transfer', 'other'];

export interface HekefLine {
  mv: string; // movementType
  kind: HekefKind | '';
  dep: string; // depositType (regular / one_time / raw)
  pd: string; // productionDate YYYY-MM-DD
  cd: string; // cancellationDate YYYY-MM-DD
  g: number; // grossPremium
  cp: number; // cancelledPremium
  pct: number; // agentCancelPercent
  acp: number; // agentCancelPremium
  net: number; // premium (agent net premium)
  rc: number; // contractCommissionRate
  ra: number; // actualCommissionRate
  c: number; // commissionAmount
  // כלל: פירוט החישוב (null בשורות שנטענו לפני שהשדות נוספו לתבנית)
  yr: string; // annexYear
  chg: number; // premiumChange
  pp: number | null; // prevPremium
  rate: number | null; // commissionRate
  cum: number | null; // cumulativeCommission
  paid: number | null; // paidSoFar
  // מנורה (null בשורות שנטענו לפני שהשדות נוספו לתבנית)
  split: number | null; // agentSplitPercent — חלק הסוכן בעמלה
  reg: string; // registrationDate — מתי נרשמה התנועה
  yrs: number | null; // yearsInForce — באיזו שנה של הפוליסה
  // מגדל
  base: string; // creditBase — בסיס זיכוי (הסכם / מבצע)
  rew: string; // rewardType — עמלות נפח / מענקים / עמלות פרסים
  /** רטרו: הסבר לשורה שהיא ביטול / רישום מחדש של רישום קודם (מוצג בשורת הפוליסה) */
  fix?: string;
}

export interface HekefPolicy {
  agent: string;
  no: string;
  cid: string;
  name: string;
  prod: string;
  pd: string;
  pmBucket: string;
  kinds: HekefKind[];
  type: HekefPolicyType;
  mv: string;
  c: number;
  p: number;
  rateFlag: boolean;
  /** יש בפוליסה תנועה שבוטלה ונרשמה מחדש באחוז עמלה אחר (תיקון אחוז רטרואקטיבי) */
  corr: boolean;
  notes: string[];
  lines: HekefLine[];
}

/** תיקוני אחוז: תנועה שבוטלה ונרשמה מחדש באותה פרמיה ובאחוז אחר. amount = ההפרש לסוכן החודש */
export interface HekefCorrections {
  policies: number;
  amount: number;
  groups: { from: number; to: number; policies: number; amount: number; products: string[] }[];
}

/** קבוצה ב"על מה שילמו / קיזזו": סכום החודש והפוליסות שבה (לפי סימן השורה — שורה בפלוס = שילמו, במינוס = קיזזו) */
export interface HekefFlowGroup {
  key: string;
  label: string;
  rew: string; // סוג תגמול (מגדל) — מענקים / עמלות פרסים / ''
  amount: number;
  policies: { agent: string; no: string; name: string; cid: string; prod: string; amount: number; note?: string }[];
}

export interface HekefView {
  month: string;
  rows: number;
  agentCodes: number;
  net: number;
  cat: Record<'new' | 'increase' | 'decrease' | 'cancel' | 'risk' | 'other', { c: number; rows: number }>;
  hasRates: boolean; // יש בדוח אחוזי עמלה (הסכם / בפועל) — במנורה כן, בכלל לא
  byKind: Record<HekefKind, number>;
  products: { n: string; c: number; p: number }[];
  reasons: { n: string; c: number; rows: number }[];
  ages: { n: string; c: number; rows: number }[];
  prodMonths: { m: string; label: string; c: number; rows: number }[];
  policies: HekefPolicy[];
  corrections: HekefCorrections;
  /** מגדל: כמה כל בסיס זיכוי (הסכם / מבצע) הניב החודש. ריק כשאין בסיסים בדוח */
  bases: { n: string; rew: string; c: number; p: number; rows: number }[];
  /** שילמו: לפי הסכם/מבצע (מגדל) או מוצר. קיזזו: לפי הסיבה (ביטול / הקטנה / פיגור / אחר) */
  flows: {
    paid: HekefFlowGroup[];
    offset: HekefFlowGroup[];
    paidTotal: number;
    offsetTotal: number;
    /** אותם סכומים לפי שנה נוכחית / שנים קודמות (כלל: מקדמות השנה מול התחשבנות שנים קודמות) */
    byKind: Record<'current' | 'retro', { paid: number; offset: number }>;
  };
  posPolicies: number;
  negPolicies: number;
  checks: {
    rateRows: number;
    ratePolicies: number;
    rateZero: number;
    top: { no: string; prod: string; c: number } | null;
    topShare: number;
    earlyShare: number;
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const s = (v: unknown) => String(v ?? '').trim();
const numOrNull = (v: unknown) => (v === undefined || v === null || v === '' ? null : num(v));
const ym = (iso: string) => iso.slice(0, 7);
const monthsBetween = (a: string, b: string) =>
  (+b.slice(0, 4) * 12 + +b.slice(5, 7)) - (+a.slice(0, 4) * 12 + +a.slice(5, 7));

// Movement categories by the opening words of "שם סוג תנועת תפוקה" (Menora wording).
// Other companies may need their own rules — keep them here when they arrive.
function categorize(mv: string): HekefCat {
  if (/^פיגור.*\+\s*$/.test(mv)) return 'increase'; // מגדל: "פיגורים שנה ב +" = חזרה מפיגור
  if (/^פיגור/.test(mv)) return 'risk';
  if (/^(ביטול|משיכה)/.test(mv)) return 'cancel';
  if (/^הגדלה/.test(mv)) return 'increase';
  if (/^הקטנה/.test(mv)) return 'decrease';
  if (/^העברה/.test(mv)) return 'transfer';
  if (/^(פתיחה|הפקדה|שינוי סוכן|חידוש|עסק חדש|חד פעמי)/.test(mv)) return 'new';
  return 'other';
}

/** הקטגוריה שהטעינה שמרה (movementCategory), ובשורות ישנות — לפי טקסט התנועה */
function rowCategory(r: any): HekefCat {
  // כלל: פוליסה בלי סטטוס בחודש הקודם ובנוכחי, שהמקדמה עליה מוחזרת — יצאה מהתפוקה (ביטול), לא הפקה
  if (/^חדש – ללא סטטוס/.test(s(r?.movementType)) && num(r?.commissionAmount) < 0) return 'cancel';
  const stored = s(r?.movementCategory) as HekefCat;
  return HEKEF_CATS.includes(stored) ? stored : categorize(s(r?.movementType));
}

function toKind(v: unknown): HekefKind | '' {
  const x = s(v).toLowerCase();
  if (x === 'current' || x === 'stf') return 'current';
  if (x === 'retro' || x === 'rtr') return 'retro';
  return '';
}

/** פירוק חודש אחד לגרף המגמה (נשמר במטמון לכל סוכן + חברה + חודש) */
export interface HekefMonthSummary {
  month: string;
  net: number;
  new: number;
  increase: number;
  decrease: number;
  cancel: number;
  risk: number;
  current: number;
  retro: number;
  premium: number;
  rows: number;
}

export function summarizeHekefMonth(rawRows: any[], month: string): HekefMonthSummary {
  const out: HekefMonthSummary = {
    month, net: 0, new: 0, increase: 0, decrease: 0, cancel: 0, risk: 0, current: 0, retro: 0, premium: 0, rows: rawRows.length,
  };
  for (const r of rawRows) {
    const c = num(r.commissionAmount);
    const cat = rowCategory(r);
    out.net += c;
    out.premium += num(r.premium);
    if (cat === 'increase' || cat === 'decrease' || cat === 'cancel' || cat === 'risk') out[cat] += c;
    else out.new += c; // new / transfer / other — כמו בגרף המפל
    const kind = toKind(r.processingType);
    if (kind) out[kind] += c;
  }
  for (const k of ['net', 'new', 'increase', 'decrease', 'cancel', 'risk', 'current', 'retro', 'premium'] as const) out[k] = r2(out[k]);
  return out;
}

type Line = HekefLine &{ agent: string; no: string; cid: string; name: string; prod: string; cat: HekefCat };

export function buildHekefView(rawRows: any[], month: string): HekefView {
  const lines: Line[] = rawRows.map((r) => {
    const mv = s(r.movementType);
    return {
      agent: s(r.agentCode),
      no: s(r.policyNumber),
      cid: s(r.customerId),
      name: s(r.fullName),
      prod: s(r.product),
      mv,
      cat: rowCategory(r),
      kind: toKind(r.processingType),
      dep: s(r.depositType),
      pd: s(r.productionDate),
      cd: s(r.cancellationDate),
      g: num(r.grossPremium),
      cp: num(r.cancelledPremium),
      pct: num(r.agentCancelPercent),
      acp: num(r.agentCancelPremium),
      net: num(r.premium),
      rc: num(r.contractCommissionRate),
      ra: num(r.actualCommissionRate),
      c: num(r.commissionAmount),
      yr: s(r.annexYear),
      chg: num(r.premiumChange),
      pp: numOrNull(r.prevPremium),
      rate: numOrNull(r.commissionRate),
      cum: numOrNull(r.cumulativeCommission),
      paid: numOrNull(r.paidSoFar),
      split: numOrNull(r.agentSplitPercent),
      reg: s(r.registrationDate),
      yrs: numOrNull(r.yearsInForce),
      base: s(r.creditBase),
      rew: s(r.rewardType),
    };
  });

  const sumBy = (arr: Line[], key: (l: Line) => string) => {
    const m: Record<string, { c: number; p: number; rows: number }> = {};
    for (const l of arr) {
      const k = key(l);
      m[k] = m[k] || { c: 0, p: 0, rows: 0 };
      m[k].c += l.c;
      m[k].p += l.net;
      m[k].rows++;
    }
    return m;
  };

  // "transfer" carries no commission; folded into "new" so the waterfall steps add up to the net exactly
  const byCat = sumBy(lines, (l) => (l.cat === 'transfer' ? 'new' : l.cat));
  const cat = {} as HekefView['cat'];
  for (const k of ['new', 'increase', 'decrease', 'cancel', 'risk', 'other'] as const) {
    cat[k] = { c: r2(byCat[k]?.c || 0), rows: byCat[k]?.rows || 0 };
  }

  const kindSums = sumBy(lines, (l) => l.kind);
  const byKind = { current: r2(kindSums.current?.c || 0), retro: r2(kindSums.retro?.c || 0) };

  const products = Object.entries(sumBy(lines, (l) => l.prod)).map(([n, v]) => ({ n, c: r2(v.c), p: r2(v.p) }));

  const cancels = lines.filter((l) => l.cat === 'cancel');
  const reasons = Object.entries(sumBy(cancels, (l) => l.mv))
    .map(([n, v]) => ({ n, c: r2(v.c), rows: v.rows }))
    .sort((a, b) => a.c - b.c);

  const monthStart = `${month}-01`;
  const ageOf = (l: Line) => {
    const m = l.pd ? monthsBetween(l.pd, monthStart) : 999;
    return m <= 12 ? 0 : m <= 24 ? 1 : 2;
  };
  const AGE_NAMES = ['עד 12 חודשים מהתפוקה', '13–24 חודשים', 'מעל 24 חודשים'];
  const ages = AGE_NAMES.map((n, i) => {
    const ls = cancels.filter((l) => ageOf(l) === i);
    return { n, c: r2(ls.reduce((a, l) => a + l.c, 0)), rows: ls.length };
  });

  // Production months: the 12 months up to the processing month one by one, earlier ones by year
  const [ry, rm] = month.split('-').map(Number);
  const last12: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(ry, rm - 1 - i, 1));
    last12.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  const pmBucketOf = (pd: string) => {
    const m = pd ? ym(pd) : '';
    if (!m) return 'none';
    return last12.includes(m) ? m : m < last12[0] ? m.slice(0, 4) : m;
  };
  const pmSums = sumBy(lines, (l) => pmBucketOf(l.pd));
  const prodMonths = [
    ...Object.keys(pmSums).filter((k) => /^\d{4}$/.test(k)).sort(),
    ...last12,
    ...(pmSums.none ? ['none'] : []),
  ].map((k) => ({
    m: k,
    label: k === 'none' ? 'ללא תאריך' : /^\d{4}$/.test(k) ? k : `${k.slice(5, 7)}/${k.slice(2, 4)}`,
    c: r2(pmSums[k]?.c || 0),
    rows: pmSums[k]?.rows || 0,
  }));

  // Policies: agent code + policy number
  const pmap = new Map<string, Line[]>();
  for (const l of lines) {
    const key = `${l.agent}|${l.no}`;
    if (!pmap.has(key)) pmap.set(key, []);
    pmap.get(key)!.push(l);
  }
  const typeOf = (ls: Line[]): HekefPolicyType => {
    // כלל: פוליסה שלא זזה החודש (אותה פרמיה ואותו סטטוס, בלי עמלה) — "ללא שינוי"
    if (ls.every((l) => l.cat === 'other' && Math.abs(l.c) < 0.005)) return 'none';
    const w: Record<string, number> = {};
    for (const l of ls) {
      // other = שינוי בעמלה בלי שינוי פרמיה (בכלל: מדרגה / שיעור מצטבר) — נספר כ"שינוי"
      const t = l.cat === 'increase' || l.cat === 'decrease' || l.cat === 'other' ? 'chg' : l.cat;
      w[t] = (w[t] || 0) + (Math.abs(l.c) || 0.0001);
    }
    return Object.entries(w).sort((a, b) => b[1] - a[1])[0][0] as HekefPolicyType;
  };

  // תיקוני אחוז — בכל פוליסה: זוג שורות עם אותה פרמיה נטו בסימנים הפוכים ובאחוזים שונים.
  // האחוז הישן: בתנועה "חיובית" (פתיחה/הגדלה) — של שורת המינוס (הביטול); בהקטנה/ביטול — של שורת הפלוס.
  const corrKeys = new Set<string>();
  const corrLines = new Map<Line, { from: number; to: number }>();
  const corrGroups = new Map<string, { from: number; to: number; pol: Set<string>; amount: number; products: Set<string> }>();
  let corrAmount = 0;
  for (const [key, ls] of pmap) {
    const used = new Set<Line>();
    for (const a of ls) {
      if (used.has(a) || a.net >= 0) continue;
      const b = ls.find((x) => !used.has(x) && x !== a && x.net > 0 && Math.abs(x.net + a.net) < 0.05 && x.ra !== a.ra && x.mv === a.mv);
      if (!b) continue;
      used.add(a).add(b);
      const reducing = a.cat === 'decrease' || a.cat === 'cancel';
      const from = reducing ? b.ra : a.ra;
      const to = reducing ? a.ra : b.ra;
      corrLines.set(a, { from, to }).set(b, { from, to });
      const amount = a.c + b.c;
      const gk = `${from}|${to}`;
      if (!corrGroups.has(gk)) corrGroups.set(gk, { from, to, pol: new Set(), amount: 0, products: new Set() });
      const g = corrGroups.get(gk)!;
      g.pol.add(key);
      g.amount += amount;
      if (a.prod) g.products.add(a.prod);
      corrAmount += amount;
      corrKeys.add(key);
    }
  }
  const corrections: HekefCorrections = {
    policies: corrKeys.size,
    amount: r2(corrAmount),
    groups: [...corrGroups.values()]
      .map((g) => ({ from: g.from, to: g.to, policies: g.pol.size, amount: r2(g.amount), products: [...g.products] }))
      .sort((x, y) => Math.abs(y.amount) - Math.abs(x.amount)),
  };

  const baseMap = new Map<string, { n: string; rew: string; c: number; p: number; rows: number }>();
  for (const l of lines) {
    if (!l.base) continue;
    const k = `${l.base}|${l.rew}`;
    if (!baseMap.has(k)) baseMap.set(k, { n: l.base, rew: l.rew, c: 0, p: 0, rows: 0 });
    const b = baseMap.get(k)!;
    b.c += l.c;
    b.p += l.net;
    b.rows++;
  }
  const bases = [...baseMap.values()]
    .map((b) => ({ ...b, c: r2(b.c), p: r2(b.p) }))
    .sort((a, b) => Math.abs(b.c) - Math.abs(a.c) || Math.abs(b.p) - Math.abs(a.p));

  const OFFSET_LABEL: Partial<Record<HekefCat, string>> = { cancel: 'ביטולים', decrease: 'הקטנת פרמיה', risk: 'פיגור' };
  type FlowAcc = { label: string; rew: string; amount: number; pol: Map<string, { line: Line; amount: number; note?: string }> };
  const flowMaps = { paid: new Map<string, FlowAcc>(), offset: new Map<string, FlowAcc>() };
  const flowByKind = { current: { paid: 0, offset: 0 }, retro: { paid: 0, offset: 0 } };
  const addFlow = (side: 'paid' | 'offset', key: string, label: string, rew: string, line: Line, amount: number, note?: string) => {
    if (line.kind) flowByKind[line.kind][side] += amount;
    const m = flowMaps[side];
    if (!m.has(key)) m.set(key, { label, rew, amount: 0, pol: new Map() });
    const g = m.get(key)!;
    g.amount += amount;
    const pk = `${line.agent}|${line.no}`;
    if (!g.pol.has(pk)) g.pol.set(pk, { line, amount: 0, note });
    g.pol.get(pk)!.amount += amount;
  };

  // רישום ומחיקה של אותה תנועה באותו אחוז (נטו 0) — לא שילמו ולא קיזזו
  const neutral = new Set<Line>();
  for (const ls of pmap.values()) {
    for (const a of ls) {
      if (neutral.has(a) || corrLines.has(a) || a.c >= 0) continue;
      const b = ls.find((x) => x !== a && !neutral.has(x) && !corrLines.has(x) && x.c > 0 && Math.abs(x.c + a.c) < 0.01 && Math.abs(x.net + a.net) < 0.05);
      if (b) neutral.add(a).add(b);
    }
  }

  // רטרו: שורת הפקה במינוס = הרישום הקודם בוטל (ואם יש לה זוג באחוז אחר — נרשם מחדש)
  const monthOf = (iso: string) => (iso ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
  const fixNote = new Map<Line, string>();
  for (const [l, r] of corrLines) {
    const when = monthOf(l.reg || l.pd);
    const reducing = l.cat === 'decrease' || l.cat === 'cancel';
    const isOld = reducing ? l.ra === r.from && l.net > 0 : l.ra === r.from && l.net < 0;
    fixNote.set(l, isOld
      ? `רטרו: הרישום המקורי${when ? ` (${when})` : ''} בוטל — באחוז ${r.from}%`
      : `רטרו: נרשם מחדש באחוז ${r.to}% במקום ${r.from}%`);
  }
  for (const l of lines) {
    if (fixNote.has(l) || neutral.has(l)) continue;
    if (l.cat === 'new' && l.c < -0.004 && (l.rc !== 0 || l.ra !== 0)) {
      const when = monthOf(l.reg || l.pd);
      fixNote.set(l, `רטרו: הרישום${when ? ` מ-${when}` : ''} בוטל`);
    }
  }

  // תיקוני אחוז — נטו לכל פוליסה, בקבוצה אחת (אחרת הביטול נספר ב"קיזזו" והרישום מחדש ב"שילמו")
  const corrByPolicy = new Map<string, { line: Line; amount: number; from: number; to: number }>();
  for (const [l, r] of corrLines) {
    const pk = `${l.agent}|${l.no}`;
    if (!corrByPolicy.has(pk)) corrByPolicy.set(pk, { line: l, amount: 0, ...r });
    corrByPolicy.get(pk)!.amount += l.c;
  }
  for (const { line, amount, from, to } of corrByPolicy.values()) {
    if (Math.abs(amount) < 0.005) continue;
    addFlow(amount > 0 ? 'paid' : 'offset', 'תיקוני אחוז', 'תיקוני אחוז', '', line, amount, `האחוז תוקן מ-${from}% ל-${to}%`);
  }

  for (const l of lines) {
    if (Math.abs(l.c) < 0.005 || neutral.has(l) || corrLines.has(l)) continue;
    const side = l.c > 0 ? 'paid' : 'offset';
    // חזרה מפיגור (מגדל: "פיגורים שנה ב +") — קבוצה משלה ב"שילמו": זה כסף שחזר כי הלקוח חזר להפקיד
    const back = side === 'paid' && /^פיגור.*\+\s*$/.test(l.mv);
    const key = back ? 'חזרו מפיגור' : side === 'paid' ? (l.base ? `${l.base}|${l.rew}` : l.prod || 'אחר') : OFFSET_LABEL[l.cat] || 'תיקונים וקיזוזים אחרים';
    const label = back ? key : side === 'paid' ? l.base || l.prod || 'אחר' : key;
    // מנורה: אחוז הביטול לפי השנה של הפוליסה
    const note = l.cat === 'cancel' && l.pct > 0 && l.yrs !== null ? `בוטלה בשנה ${l.yrs} של הפוליסה — מוחזרים ${l.pct}% מהעמלה` : undefined;
    addFlow(side, key, label, side === 'paid' && !back ? l.rew : '', l, l.c, note);
  }
  const toGroups = (m: typeof flowMaps.paid): HekefFlowGroup[] =>
    [...m.entries()]
      .map(([key, g]) => ({
        key,
        label: g.label,
        rew: g.rew,
        amount: r2(g.amount),
        policies: [...g.pol.values()]
          .map(({ line, amount, note }) => ({ agent: line.agent, no: line.no, name: line.name, cid: line.cid, prod: line.prod, amount: r2(amount), note }))
          .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
      }))
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const flows = {
    paid: toGroups(flowMaps.paid),
    offset: toGroups(flowMaps.offset),
    paidTotal: 0,
    offsetTotal: 0,
    byKind: flowByKind,
  };

  flows.paidTotal = r2(flows.paid.reduce((a, g) => a + g.amount, 0));
  flows.offsetTotal = r2(flows.offset.reduce((a, g) => a + g.amount, 0));
  for (const k of ['current', 'retro'] as const) {
    flowByKind[k].paid = r2(flowByKind[k].paid);
    flowByKind[k].offset = r2(flowByKind[k].offset);
  }

  const policies: HekefPolicy[] = [...pmap.values()]
    .map((ls) => {
      const c = r2(ls.reduce((a, l) => a + l.c, 0));
      const p = r2(ls.reduce((a, l) => a + l.net, 0));
      const main = [...ls].sort((a, b) => Math.abs(b.c) - Math.abs(a.c))[0];
      const pds = ls.map((l) => l.pd).filter(Boolean).sort();
      // אחוז בפועל 0 כשחלק הסוכן 0 — העמלה הולכת לסוכן אחר, לא ממצא
      const rateFlag = ls.some((l) => l.rc !== l.ra && l.split !== 0);
      const notes: string[] = [];
      if (ls.some((a) => a.g !== 0 && ls.some((b) => b !== a && b.g === -a.g))) {
        notes.push('רישום ותיקון: יש בפוליסה שורות שמבטלות זו את זו (אותה פרמיה בפלוס ובמינוס). העמלה נטו היא מה שנשאר אחרי הקיזוז ביניהן.');
      }
      for (const l of ls.filter((x) => x.cat === 'cancel' && x.pd)) {
        notes.push(`ביטול ${monthsBetween(l.pd, monthStart)} חודשים אחרי תאריך התפוקה${l.pct ? ` · סוכן-אחוז ביטול ${l.pct}%` : ""}`);
      }
      if (ls.some((x) => x.cat === 'risk')) {
        notes.push('בפיגור: הפוליסה עוד לא בוטלה, אבל לא נספרת לתשלום. אם ההפקדות יחזרו — גם ההיקף יחזור.');
      }
      if (rateFlag) notes.push('שווה בדיקה: בחלק מהשורות סוכן-אחוז עמלה בפועל שונה מסוכן-אחוז עמלה מההסכם.');
      // "תיקון" במקום "הפקה": בפוליסה יש תיקון אחוז, או שההפקה בה במינוס (רישום קודם בוטל ברטרו)
      const isFix = corrKeys.has(`${main.agent}|${main.no}`) || (c < -0.004 && ls.some((l) => l.cat === 'new' && l.c < -0.004 && (l.rc !== 0 || l.ra !== 0)));
      return {
        agent: main.agent,
        no: main.no,
        cid: main.cid,
        name: main.name,
        prod: main.prod,
        pd: pds[0] || '',
        pmBucket: pmBucketOf(pds[0] || ''),
        kinds: (['current', 'retro'] as HekefKind[]).filter((k) => ls.some((l) => l.kind === k)),
        type: isFix ? 'fix' : typeOf(ls),
        mv: main.mv,
        c,
        p,
        rateFlag,
        corr: corrKeys.has(`${main.agent}|${main.no}`),
        notes,
        lines: ls.map((l) => {
          const { mv, kind, dep, pd, cd, g, cp, pct, acp, net, rc, ra, c, yr, chg, pp, rate, cum, paid, split, reg, yrs, base, rew } = l;
          return { mv, kind, dep, pd, cd, g, cp, pct, acp, net, rc, ra, c, yr, chg, pp, rate, cum, paid, split, reg, yrs, base, rew, fix: fixNote.get(l) };
        }),
      };
    })
    .sort((a, b) => Math.abs(b.c) - Math.abs(a.c));

  const mism = lines.filter((l) => l.rc !== l.ra && l.split !== 0);
  const cancelSum = cancels.reduce((a, l) => a + l.c, 0);
  const top = policies.length ? [...policies].sort((a, b) => a.c - b.c)[0] : null;

  return {
    month,
    rows: lines.length,
    agentCodes: new Set(lines.map((l) => l.agent)).size,
    net: r2(lines.reduce((a, l) => a + l.c, 0)),
    cat,
    hasRates: lines.some((l) => l.rc !== 0 || l.ra !== 0),
    byKind,
    products,
    reasons,
    ages,
    prodMonths,
    policies,
    corrections,
    bases,
    flows,
    posPolicies: policies.filter((p) => p.c > 0.004).length,
    negPolicies: policies.filter((p) => p.c < -0.004).length,
    checks: {
      rateRows: mism.length,
      ratePolicies: policies.filter((p) => p.rateFlag).length,
      rateZero: mism.filter((l) => l.ra === 0).length,
      top: top && top.c < 0 ? { no: top.no, prod: top.prod, c: top.c } : null,
      topShare: cancelSum && top && top.c < 0 ? Math.round((top.c / cancelSum) * 100) : 0,
      earlyShare: cancelSum ? Math.round((ages[0].c / cancelSum) * 100) : 0,
    },
  };
}
