'use client';
// ═══════════════════════════════════════════════════════════════════
// app/admin/product-map/page.tsx
// ניהול מפת המוצרים בתבניות העמלות (commissionTemplates):
//   fallbackProduct · defaultPremiumField · productMap (מוצר, שדה פרמיה, aliases)
// + ערכי המוצר שנקלטו בפועל, עם סיווג חי לפי הטיוטה ומיפוי בלחיצה.
// אחרי שמירה — מטמון הסקירה (agentInsightsCache) מתבטל לבד, כי החתימה שלו
// כוללת את הגדרות התבנית.
// ═══════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, deleteField, doc, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from '@/lib/firebase/AuthContext';
import useFetchMD from '@/hooks/useMD';
import AdminGuard from '@/app/admin/_components/AdminGuard';
import ProductMapEditor from '@/components/admin/productMap/ProductMapEditor';
import RawValuesPanel, { type RawValue } from '@/components/admin/productMap/RawValuesPanel';
import {
  KNOWN_PREMIUM_FIELDS,
  draftFromTemplate,
  draftSignature,
  newId,
  normAlias,
  premiumFieldLabel,
  previewTemplate,
  productMapFromDraft,
  validateDraft,
  type Draft,
  type MapEntry,
} from '@/components/admin/productMap/model';

type TemplateItem = { id: string; data: any; companyName: string; label: string };

const EMPTY_DRAFT: Draft = { fallbackProduct: '', defaultPremiumField: '', entries: [] };

export default function ProductMapAdminPage() {
  const { detail } = useAuth() as any;
  const { productToGroupMap } = useFetchMD() as any;

  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [initialSig, setInitialSig] = useState(draftSignature(EMPTY_DRAFT));
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [raw, setRaw] = useState<{ values: RawValue[]; scanned: number; truncated: boolean }>({ values: [], scanned: 0, truncated: false });
  const [rawLoading, setRawLoading] = useState(false);
  const [rawError, setRawError] = useState<string | null>(null);

  const selected = templates.find((t) => t.id === selectedId) ?? null;
  const dirty = !!selected && draftSignature(draft) !== initialSig;
  const issues = useMemo(() => validateDraft(draft), [draft]);
  const preview = useMemo(() => (selected ? previewTemplate(selected.data, draft) : null), [selected, draft]);

  // ─── טעינת תבניות + חברות ───────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [tSnap, cSnap] = await Promise.all([
          getDocs(collection(db, 'commissionTemplates')),
          getDocs(collection(db, 'company')),
        ]);
        const companyById: Record<string, string> = {};
        cSnap.forEach((d) => {
          companyById[d.id] = String((d.data() as any)?.companyName ?? d.id);
        });
        const list: TemplateItem[] = tSnap.docs.map((d) => {
          const data: any = d.data();
          const companyName = companyById[String(data.companyId ?? '')] || String(data.companyName ?? '');
          return { id: d.id, data, companyName, label: `${companyName ? `${companyName} – ` : ''}${data.Name || data.type || d.id}` };
        });
        list.sort((a, b) => a.label.localeCompare(b.label, 'he'));
        setTemplates(list);
      } finally {
        setLoadingTemplates(false);
      }
    })();
  }, []);

  // ─── אזהרה ביציאה עם שינויים לא שמורים ──────────────────────────────
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  // ─── ערכי מוצר שנקלטו ───────────────────────────────────────────────
  const loadRaw = useCallback(async (templateId: string) => {
    setRawLoading(true);
    setRawError(null);
    try {
      const res = await fetch('/api/admin/template-product-values', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || String(res.status));
      setRaw({ values: d.values ?? [], scanned: d.scanned ?? 0, truncated: !!d.truncated });
    } catch (e: any) {
      setRawError(`לא הצלחנו לטעון את הערכים: ${e?.message ?? e}`);
      setRaw({ values: [], scanned: 0, truncated: false });
    } finally {
      setRawLoading(false);
    }
  }, []);

  const selectTemplate = (id: string) => {
    if (dirty && !window.confirm('יש שינויים שלא נשמרו. לעבור תבנית ולאבד אותם?')) return;
    setSelectedId(id);
    setMessage(null);
    setHighlightId(null);
    const t = templates.find((x) => x.id === id);
    const d = t ? draftFromTemplate(t.data) : EMPTY_DRAFT;
    setDraft(d);
    setInitialSig(draftSignature(d));
    if (id) loadRaw(id);
    else setRaw({ values: [], scanned: 0, truncated: false });
  };

  // ─── אפשרויות לבחירה (נגזרות מהנתונים הקיימים) ─────────────────────
  // שדות מוכרים (לפי הסדר המוגדר) + שדות נוספים שכבר קיימים בתבניות
  const premiumFieldOptions = useMemo(() => {
    const known = Object.keys(KNOWN_PREMIUM_FIELDS);
    const extra = new Set<string>();
    templates.forEach(({ data }) => {
      if (data.defaultPremiumField) extra.add(String(data.defaultPremiumField));
      Object.values(data.productMap ?? {}).forEach((e: any) => e?.premiumField && extra.add(String(e.premiumField)));
    });
    known.forEach((k) => extra.delete(k));
    return [...known, ...Array.from(extra).sort()];
  }, [templates]);

  const canonicalOptions = useMemo(() => {
    const s = new Set<string>(Object.keys(productToGroupMap ?? {}));
    templates.forEach(({ data }) => {
      if (data.fallbackProduct) s.add(String(data.fallbackProduct));
      Object.values(data.productMap ?? {}).forEach((e: any) => e?.canonicalProduct && s.add(String(e.canonicalProduct)));
    });
    draft.entries.forEach((e) => e.canonicalProduct.trim() && s.add(e.canonicalProduct.trim()));
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'he'));
  }, [templates, productToGroupMap, draft.entries]);

  const productGroupKnown = useCallback(
    (canonical: string) => !productToGroupMap || Object.keys(productToGroupMap).length === 0 || !!productToGroupMap[canonical],
    [productToGroupMap]
  );

  // ─── פעולות מתוך פאנל הערכים ─────────────────────────────────────────
  const focusEntry = (id: string) => {
    setHighlightId(id);
    setTimeout(() => document.getElementById(`entry-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    setTimeout(() => setHighlightId((cur) => (cur === id ? null : cur)), 2500);
  };

  const addAlias = (entryId: string, value: string) => {
    setDraft((d) => ({
      ...d,
      entries: d.entries.map((e) =>
        e.id === entryId && !e.aliases.some((a) => normAlias(a) === normAlias(value)) ? { ...e, aliases: [...e.aliases, value] } : e
      ),
    }));
    focusEntry(entryId);
  };

  const newEntryFor = (value: string) => {
    const id = newId();
    const entry: MapEntry = { id, key: '', canonicalProduct: '', premiumField: '', aliases: [value], extra: {} };
    setDraft((d) => ({ ...d, entries: [...d.entries, entry] }));
    focusEntry(id);
  };

  // ─── שמירה ───────────────────────────────────────────────────────────
  const save = async () => {
    if (!selected) return;
    if (issues.missingCanonical.length) {
      setMessage({ type: 'err', text: `יש ${issues.missingCanonical.length} מוצרים בלי שם מוצר מסווג — יש להשלים לפני שמירה.` });
      return;
    }
    const dupCount = Object.keys(issues.duplicateAliases).length;
    if (dupCount && !window.confirm(`${dupCount} ערכים מופיעים ביותר ממוצר אחד (מסומנים באדום). המוצר הראשון ברשימה ינצח. לשמור בכל זאת?`)) return;

    setSaving(true);
    setMessage(null);
    try {
      const productMap = productMapFromDraft(draft);
      const fallback = draft.fallbackProduct.trim();
      const defField = draft.defaultPremiumField.trim();
      await updateDoc(doc(db, 'commissionTemplates', selected.id), {
        productMap,
        fallbackProduct: fallback || deleteField(),
        defaultPremiumField: defField || deleteField(),
        productMapUpdatedAt: serverTimestamp(),
        productMapUpdatedBy: String(detail?.email || detail?.name || ''),
      });

      const newData = { ...selected.data, productMap, fallbackProduct: fallback || undefined, defaultPremiumField: defField || undefined };
      setTemplates((list) => list.map((t) => (t.id === selected.id ? { ...t, data: newData } : t)));
      const d = draftFromTemplate(newData);
      setDraft(d);
      setInitialSig(draftSignature(d));
      setMessage({ type: 'ok', text: 'נשמר. הסקירה תחושב מחדש בטעינה הבאה שלה.' });
    } catch (e: any) {
      setMessage({ type: 'err', text: `השמירה נכשלה: ${e?.message ?? e}` });
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    if (!selected || !window.confirm('לבטל את כל השינויים שלא נשמרו?')) return;
    const d = draftFromTemplate(selected.data);
    setDraft(d);
    setInitialSig(draftSignature(d));
    setMessage(null);
  };

  const visibleTemplates = templates.filter(
    (t) =>
      (showInactive || t.data.isactive || t.id === selectedId) &&
      (!templateSearch.trim() || t.label.toLowerCase().includes(templateSearch.trim().toLowerCase()))
  );

  const dupAliasCount = Object.keys(issues.duplicateAliases).length;

  return (
    <AdminGuard>
      <div className="p-6 max-w-[1500px] mx-auto text-right" dir="rtl">
        <h1 className="text-2xl font-bold mb-1">ניהול מפת מוצרים בתבניות</h1>
        <p className="text-sm text-slate-500 mb-5">
          קובע איך ערך המוצר מהקובץ מתורגם למוצר מסווג ולשדה פרמיה — משפיע על הסקירה, המוצרים והדרילים.
        </p>

        {/* ─── בחירת תבנית ─── */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-5 flex flex-wrap items-end gap-3">
          <div className="w-56">
            <label className="block text-xs font-bold text-slate-500 mb-1">חיפוש תבנית</label>
            <input
              value={templateSearch}
              onChange={(e) => setTemplateSearch(e.target.value)}
              placeholder="חברה או שם תבנית"
              className="w-full border rounded-lg px-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex-1 min-w-[280px]">
            <label className="block text-xs font-bold text-slate-500 mb-1">תבנית</label>
            <select
              value={selectedId}
              onChange={(e) => selectTemplate(e.target.value)}
              disabled={loadingTemplates}
              className="w-full border rounded-lg px-2 py-1.5 text-sm bg-white"
            >
              <option value="">{loadingTemplates ? 'טוען…' : `בחרי תבנית (${visibleTemplates.length})`}</option>
              {visibleTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                  {!t.data.isactive ? ' · לא פעילה' : ''}
                  {t.data.hekefType ? ' · היקף' : ''}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer pb-1.5">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            הצג גם תבניות לא פעילות
          </label>
        </div>

        {!selected ? (
          <div className="p-10 text-center text-slate-500 border border-dashed rounded-2xl">בחרי תבנית כדי להתחיל.</div>
        ) : (
          <>
            {/* ─── סרגל שמירה ─── */}
            <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border border-slate-200 rounded-2xl px-4 py-3 mb-5 flex flex-wrap items-center justify-between gap-3 shadow-sm">
              <div className="text-sm">
                <span className="font-bold text-slate-800">{selected.label}</span>
                <span className="text-slate-400 font-mono text-xs mr-2" dir="ltr">
                  {selected.id}
                </span>
                {dirty ? (
                  <span className="mr-3 text-amber-700 font-bold">● שינויים לא שמורים</span>
                ) : (
                  <span className="mr-3 text-slate-400">אין שינויים</span>
                )}
                {dupAliasCount > 0 && <span className="mr-3 text-red-600">{dupAliasCount} ערכים כפולים</span>}
                {issues.missingCanonical.length > 0 && (
                  <span className="mr-3 text-red-600">{issues.missingCanonical.length} מוצרים בלי שם</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {message && (
                  <span className={`text-sm ${message.type === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>{message.text}</span>
                )}
                <button
                  type="button"
                  onClick={discard}
                  disabled={!dirty || saving}
                  className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40"
                >
                  בטל שינויים
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={!dirty || saving}
                  className="px-4 py-1.5 rounded-lg text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"
                >
                  {saving ? 'שומר…' : 'שמירה'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
              {/* ─── הגדרות + מפה ─── */}
              <div className="xl:col-span-7 space-y-5">
                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                  <div className="font-bold text-slate-700 mb-3">ברירות מחדל של התבנית</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">מוצר ברירת מחדל (fallbackProduct)</label>
                      <input
                        list="canonical-products"
                        value={draft.fallbackProduct}
                        onChange={(e) => setDraft((d) => ({ ...d, fallbackProduct: e.target.value }))}
                        className="w-full border rounded-lg px-3 py-1.5 text-sm"
                        placeholder="למשל: ביטוח חיים"
                      />
                      <div className="text-[11px] text-slate-400 mt-1">
                        ניתן לשורה שהערך שלה ריק או לא נמצא במפה
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">שדה פרמיה ברירת מחדל (defaultPremiumField)</label>
                      <select
                        value={draft.defaultPremiumField}
                        onChange={(e) => setDraft((d) => ({ ...d, defaultPremiumField: e.target.value }))}
                        className="w-full border rounded-lg px-2 py-1.5 text-sm bg-white"
                      >
                        <option value="">(ללא)</option>
                        {premiumFieldOptions.map((f) => (
                          <option key={f} value={f}>
                            {premiumFieldLabel(f)}
                          </option>
                        ))}
                      </select>
                      <div className="text-[11px] text-slate-400 mt-1">
                        קובע לאיזו קוביה נכנסת שורה, כשלמוצר שלה אין שדה פרמיה משלו
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-baseline justify-between mb-2">
                    <div className="font-bold text-slate-700">מפת מוצרים · {draft.entries.length}</div>
                    <div className="text-xs text-slate-500">ההתאמה לפי ערך מלא (לא חלקי), בלי תלות ברווחים ובאותיות גדולות/קטנות</div>
                  </div>
                  <ProductMapEditor
                    draft={draft}
                    issues={issues}
                    premiumFieldOptions={premiumFieldOptions}
                    productGroupKnown={productGroupKnown}
                    highlightId={highlightId}
                    onChange={(entries) => setDraft((d) => ({ ...d, entries }))}
                  />
                </div>
              </div>

              {/* ─── ערכים מהנתונים ─── */}
              <div className="xl:col-span-5 xl:sticky xl:top-20">
                <RawValuesPanel
                  values={raw.values}
                  scanned={raw.scanned}
                  truncated={raw.truncated}
                  loading={rawLoading}
                  error={rawError}
                  preview={preview}
                  draft={draft}
                  onAddAlias={addAlias}
                  onNewEntry={newEntryFor}
                  onRefresh={() => loadRaw(selected.id)}
                />
              </div>
            </div>

            <datalist id="canonical-products">
              {canonicalOptions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </>
        )}
      </div>
    </AdminGuard>
  );
}