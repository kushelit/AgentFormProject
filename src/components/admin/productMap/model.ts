// src/components/admin/productMap/model.ts
// המרה בין מסמך התבנית לבין טיוטת עריכה, ובדיקות תקינות.

export type MapEntry = {
  id: string;              // מזהה מקומי לעריכה (לא נשמר)
  key: string;             // מפתח ב-productMap
  canonicalProduct: string;
  premiumField: string;    // ריק = defaultPremiumField של התבנית
  aliases: string[];
  extra: Record<string, any>; // שדות נוספים שהיו על ה-entry — נשמרים כמו שהם
};

export type Draft = {
  fallbackProduct: string;
  defaultPremiumField: string;
  entries: MapEntry[];
};

export const KNOWN_PREMIUM_FIELDS: Record<string, string> = {
  finansimZvira: 'צבירה פיננסית',
  pensiaPremia: 'פרמיה פנסיה',
  insPremia: 'פרמיה ביטוח',
};

export const premiumFieldLabel = (f: string) => (KNOWN_PREMIUM_FIELDS[f] ? `${KNOWN_PREMIUM_FIELDS[f]} (${f})` : f);

/** אותו נרמול כמו ב-resolveFromTemplate */
export const normAlias = (v: any) =>
  String(v ?? '')
    .replace(/\u200f|\u200e|\ufeff/g, '')
    .replace(/\u00a0/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

let seq = 0;
export const newId = () => `e${Date.now().toString(36)}_${seq++}`;

export function draftFromTemplate(t: any): Draft {
  const map = (t?.productMap ?? {}) as Record<string, any>;
  return {
    fallbackProduct: String(t?.fallbackProduct ?? ''),
    defaultPremiumField: String(t?.defaultPremiumField ?? ''),
    entries: Object.entries(map).map(([key, e]) => {
      const { aliases, canonicalProduct, premiumField, ...extra } = e ?? {};
      return {
        id: newId(),
        key,
        canonicalProduct: String(canonicalProduct ?? ''),
        premiumField: String(premiumField ?? ''),
        aliases: Array.isArray(aliases) ? aliases.map((a: any) => String(a)) : [],
        extra,
      };
    }),
  };
}

function uniqueKey(base: string, used: Set<string>) {
  let k = base || 'product';
  let i = 2;
  while (used.has(k)) k = `${base || 'product'}_${i++}`;
  used.add(k);
  return k;
}

/** טיוטה → productMap לשמירה */
export function productMapFromDraft(d: Draft): Record<string, any> {
  const used = new Set<string>();
  const out: Record<string, any> = {};
  d.entries.forEach((e, idx) => {
    const key = uniqueKey(e.key.trim() || `product_${idx + 1}`, used);
    out[key] = {
      ...e.extra,
      canonicalProduct: e.canonicalProduct.trim(),
      aliases: Array.from(new Set(e.aliases.map((a) => a.trim()).filter(Boolean))),
      ...(e.premiumField.trim() ? { premiumField: e.premiumField.trim() } : {}),
    };
  });
  return out;
}

/** התבנית כפי שתיראה אחרי שמירה — לתצוגה מקדימה של הסיווג */
export function previewTemplate(original: any, d: Draft) {
  return {
    ...original,
    fallbackProduct: d.fallbackProduct.trim() || undefined,
    defaultPremiumField: d.defaultPremiumField.trim() || undefined,
    productMap: productMapFromDraft(d),
  };
}

export const draftSignature = (d: Draft) =>
  JSON.stringify({
    f: d.fallbackProduct.trim(),
    p: d.defaultPremiumField.trim(),
    m: productMapFromDraft(d),
  });

export type DraftIssues = {
  missingCanonical: string[];          // entry ids
  duplicateKeys: string[];             // entry ids
  duplicateAliases: Record<string, string[]>; // normAlias -> entry ids
};

export function validateDraft(d: Draft): DraftIssues {
  const missingCanonical = d.entries.filter((e) => !e.canonicalProduct.trim()).map((e) => e.id);

  const keyCount: Record<string, string[]> = {};
  d.entries.forEach((e) => {
    const k = e.key.trim();
    if (!k) return;
    (keyCount[k] ||= []).push(e.id);
  });
  const duplicateKeys = Object.values(keyCount).filter((ids) => ids.length > 1).flat();

  const aliasOwners: Record<string, Set<string>> = {};
  d.entries.forEach((e) =>
    e.aliases.forEach((a) => {
      const n = normAlias(a);
      if (!n) return;
      (aliasOwners[n] ||= new Set()).add(e.id);
    })
  );
  const duplicateAliases = Object.fromEntries(
    Object.entries(aliasOwners)
      .filter(([, s]) => s.size > 1)
      .map(([n, s]) => [n, Array.from(s)])
  );

  return { missingCanonical, duplicateKeys, duplicateAliases };
}
