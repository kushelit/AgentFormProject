'use client';
// src/components/admin/productMap/ProductMapEditor.tsx
import React from 'react';
import AliasInput from './AliasInput';
import { newId, normAlias, type Draft, type DraftIssues, type MapEntry } from './model';

interface Props {
  draft: Draft;
  issues: DraftIssues;
  premiumFieldOptions: string[];
  productGroupKnown: (canonical: string) => boolean;
  highlightId: string | null;
  onChange: (entries: MapEntry[]) => void;
}

const ProductMapEditor: React.FC<Props> = ({ draft, issues, premiumFieldOptions, productGroupKnown, highlightId, onChange }) => {
  const update = (id: string, patch: Partial<MapEntry>) =>
    onChange(draft.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const remove = (id: string) => {
    const e = draft.entries.find((x) => x.id === id);
    if (e && (e.aliases.length || e.canonicalProduct) && !window.confirm(`למחוק את "${e.canonicalProduct || e.key}"?`)) return;
    onChange(draft.entries.filter((x) => x.id !== id));
  };

  const addEntry = () =>
    onChange([...draft.entries, { id: newId(), key: '', canonicalProduct: '', premiumField: '', aliases: [], extra: {} }]);

  const dupAliasSet = new Set(Object.keys(issues.duplicateAliases));

  return (
    <div className="space-y-3">
      {draft.entries.length === 0 && (
        <div className="text-sm text-slate-500 p-4 border border-dashed rounded-xl text-center">
          אין מוצרים במפה. כל השורות יקבלו את מוצר ברירת המחדל.
        </div>
      )}

      {draft.entries.map((e) => {
        const missing = issues.missingCanonical.includes(e.id);
        const dupKey = issues.duplicateKeys.includes(e.id);
        const noGroup = !!e.canonicalProduct.trim() && !productGroupKnown(e.canonicalProduct.trim());
        const ownDup = new Set(e.aliases.map(normAlias).filter((a) => dupAliasSet.has(a)));

        return (
          <div
            key={e.id}
            id={`entry-${e.id}`}
            className={`border rounded-xl p-4 bg-white transition ${
              highlightId === e.id ? 'ring-2 ring-indigo-400' : ''
            } ${missing ? 'border-red-300' : 'border-slate-200'}`}
          >
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
              <div className="md:col-span-4">
                <label className="block text-xs font-bold text-slate-500 mb-1">מוצר מסווג (קנוני)</label>
                <input
                  list="canonical-products"
                  value={e.canonicalProduct}
                  onChange={(ev) => update(e.id, { canonicalProduct: ev.target.value })}
                  className={`w-full border rounded-lg px-3 py-1.5 text-sm ${missing ? 'border-red-400' : ''}`}
                  placeholder="למשל: קרן השתלמות"
                />
                {missing && <div className="text-[11px] text-red-600 mt-1">חובה למלא שם מוצר</div>}
                {noGroup && (
                  <div className="text-[11px] text-amber-700 mt-1">
                    לא משויך לקבוצת מוצר — יופיע בלשונית המוצרים כ&quot;ללא סיווג&quot;
                  </div>
                )}
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-bold text-slate-500 mb-1">שדה פרמיה</label>
                <select
                  value={e.premiumField}
                  onChange={(ev) => update(e.id, { premiumField: ev.target.value })}
                  className="w-full border rounded-lg px-2 py-1.5 text-sm bg-white"
                >
                  <option value="">ברירת המחדל של התבנית{draft.defaultPremiumField ? ` (${draft.defaultPremiumField})` : ''}</option>
                  {premiumFieldOptions.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-4">
                <label className="block text-xs font-bold text-slate-500 mb-1">מפתח</label>
                <input
                  value={e.key}
                  onChange={(ev) => update(e.id, { key: ev.target.value })}
                  className={`w-full border rounded-lg px-3 py-1.5 text-sm font-mono ${dupKey ? 'border-red-400' : ''}`}
                  placeholder="נוצר אוטומטית אם ריק"
                  dir="ltr"
                />
                {dupKey && <div className="text-[11px] text-red-600 mt-1">מפתח כפול</div>}
              </div>

              <div className="md:col-span-1 flex md:justify-end md:pt-6">
                <button type="button" onClick={() => remove(e.id)} className="text-xs text-red-600 hover:underline">
                  מחק
                </button>
              </div>

              <div className="md:col-span-12">
                <label className="block text-xs font-bold text-slate-500 mb-1">
                  ערכים מהקובץ (aliases) · {e.aliases.length}
                </label>
                <AliasInput aliases={e.aliases} duplicates={ownDup} onChange={(aliases) => update(e.id, { aliases })} />
              </div>
            </div>
          </div>
        );
      })}

      <button
        type="button"
        onClick={addEntry}
        className="w-full py-2.5 border-2 border-dashed border-slate-300 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50"
      >
        + מוצר חדש
      </button>
    </div>
  );
};

export default ProductMapEditor;
