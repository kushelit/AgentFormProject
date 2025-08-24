'use client';

import React, { useMemo, useState } from 'react';

/** ----- Types ----- */
export type ExternalRow = {
  id: string;
  company?: string | null;
  validMonth?: string | null;   // YYYY-MM
  reportMonth: string;          // YYYY-MM
  commissionAmount?: number | null;
  linkedSaleId?: string | null; // when already linked
};

export type SaleOption = {
  saleId: string;
  customerName: string;
  company: string;
  product: string;
  policyMonth: string; // YYYY-MM
};

export type Candidate = {
  ext: ExternalRow;
  saleOptions: SaleOption[];
  suggestedSaleId?: string; // optional suggestion
};

type Props = {
  data?: Candidate[];
  onLink?: (extId: string, saleId: string) => Promise<void> | void;
  onUnlink?: (extId: string) => Promise<void> | void;
  onCreate?: (ext: ExternalRow) => Promise<void> | void; // create SALE for this external
};

/** ----- UI helpers ----- */
const money = (n?: number | null) =>
  typeof n === 'number' && !Number.isNaN(n) ? n.toLocaleString() : '—';

function Badge({
  children,
  tone = 'default',
}: {
  children: React.ReactNode;
  tone?: 'default' | 'success' | 'warn' | 'muted';
}) {
  const cls =
    tone === 'success'
      ? 'bg-green-100 text-green-700'
      : tone === 'warn'
      ? 'bg-yellow-100 text-yellow-800'
      : tone === 'muted'
      ? 'bg-gray-100 text-gray-600'
      : 'bg-blue-100 text-blue-800';
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs ${cls}`}>{children}</span>
  );
}

/** ----- Component ----- */
export default function ReconcileMock({
  data = [],
  onLink,
  onUnlink,
  onCreate,
}: Props) {
  /** מאחדים מועמדים עם אותו ext.id כדי למנוע כפל */
  const uniqueItems = useMemo(() => {
    const map = new Map<string, Candidate>();
    data.forEach((c) => {
      const key = c.ext.id;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          ext: { ...c.ext },
          saleOptions: [...c.saleOptions],
          suggestedSaleId: c.suggestedSaleId,
        });
      } else {
        // מאחדים אפשרויות SALE (ללא כפילויות)
        const seen = new Set(existing.saleOptions.map((s) => s.saleId));
        c.saleOptions.forEach((s) => {
          if (!seen.has(s.saleId)) existing.saleOptions.push(s);
        });
        // אם באחד המועמדים הרשומה כבר משויכת — נסמן כך
        if (!existing.ext.linkedSaleId && c.ext.linkedSaleId) {
          existing.ext.linkedSaleId = c.ext.linkedSaleId;
        }
        // שומרים הצעה אם אין קיימת
        if (!existing.suggestedSaleId && c.suggestedSaleId) {
          existing.suggestedSaleId = c.suggestedSaleId;
        }
      }
    });
    return [...map.values()];
  }, [data]);

  /** סכום נפרעים ייחודי */
  const totalExternal = useMemo(
    () =>
      uniqueItems.reduce(
        (sum, c) => sum + (typeof c.ext.commissionAmount === 'number' ? c.ext.commissionAmount : 0),
        0
      ),
    [uniqueItems]
  );

  /** חלוקה ללשוניות */
  const partitions = useMemo(() => {
    const linked: Candidate[] = [];
    const todo: Candidate[] = [];
    const nope: Candidate[] = [];
    uniqueItems.forEach((c) => {
      if (c.ext.linkedSaleId) linked.push(c);
      else if (c.saleOptions.length === 0) nope.push(c);
      else todo.push(c);
    });
    return { linked, todo, nope };
  }, [uniqueItems]);

  const [tab, setTab] = useState<'todo' | 'linked' | 'nope'>('todo');

  /** בחירת SALE לכל External */
  const [selected, setSelected] = useState<Record<string, string>>({});
  React.useEffect(() => {
    // ברירת מחדל — הצעת שיוך אם קיימת
    const init: Record<string, string> = {};
    uniqueItems.forEach((c) => {
      if (!c.ext.linkedSaleId && c.suggestedSaleId) {
        init[c.ext.id] = c.suggestedSaleId;
      }
    });
    setSelected((prev) => ({ ...init, ...prev }));
  }, [uniqueItems.map((x) => x.ext.id).join(',')]);

  const active =
    tab === 'todo' ? partitions.todo : tab === 'linked' ? partitions.linked : partitions.nope;

  return (
    <div dir="rtl" className="space-y-4">
      {/* סיכום עליון */}
      <div className="grid grid-cols-3 gap-3">
        <div className="border rounded-xl p-4 bg-white">
          <div className="text-xs text-gray-500 mb-1">נותרו לשיוך</div>
          <div className="text-2xl font-bold">
            {partitions.todo.length + partitions.nope.length}
          </div>
          {partitions.todo.length + partitions.nope.length > 0 && (
            <div className="mt-1"><Badge tone="warn">דורש פעולה</Badge></div>
          )}
        </div>
        <div className="border rounded-xl p-4 bg-white">
          <div className="text-xs text-gray-500 mb-1">שויכו</div>
          <div className="text-2xl font-bold">{partitions.linked.length}</div>
          {partitions.linked.length > 0 && (
            <div className="mt-1"><Badge tone="success">משויך ✓</Badge></div>
          )}
        </div>
        <div className="border rounded-xl p-4 bg-white">
          <div className="text-xs text-gray-500 mb-1">נפרעים — EXTERNAL</div>
          <div className="text-2xl font-bold">{totalExternal.toLocaleString()}</div>
          <div className="text-xs text-gray-500 mt-1">סכום מהקבצים עבור המסננים</div>
        </div>
      </div>

      {/* לשוניות */}
      <div className="flex items-center gap-2">
        <button
          className={`px-3 py-1 rounded-full text-sm border ${tab === 'todo' ? 'bg-blue-600 text-white' : 'bg-white'}`}
          onClick={() => setTab('todo')}
        >
          מועמדים לשיוך ({partitions.todo.length})
        </button>
        <button
          className={`px-3 py-1 rounded-full text-sm border ${tab === 'linked' ? 'bg-blue-600 text-white' : 'bg-white'}`}
          onClick={() => setTab('linked')}
        >
          משויכים ({partitions.linked.length})
        </button>
        <button
          className={`px-3 py-1 rounded-full text-sm border ${tab === 'nope' ? 'bg-blue-600 text-white' : 'bg-white'}`}
          onClick={() => setTab('nope')}
        >
          ללא התאמה ({partitions.nope.length})
        </button>
      </div>

      {/* רשימת הכרטיסים */}
      <div className="space-y-3">
        {active.map((c) => {
          const isLinked = !!c.ext.linkedSaleId;
          const sID = selected[c.ext.id] || '';

          return (
            <div key={c.ext.id} className="bg-white border rounded-xl overflow-hidden">
              {/* כותרת הכרטיס */}
              <div className="flex items-center justify-between p-3 bg-gray-50">
                <div className="flex items-center gap-2">
                  <Badge>מקור: EXTERNAL</Badge>
                  <span className="text-sm text-gray-600">
                    {c.ext.company || '—'} • valid: <b>{c.ext.validMonth || '—'}</b> • report:{' '}
                    <b>{c.ext.reportMonth || '—'}</b>
                  </span>
                  <span className="text-sm text-gray-600">
                    נפרעים: <b>{money(c.ext.commissionAmount)}</b>
                  </span>
                </div>
                <div>
                  {isLinked ? (
                    <Badge tone="success">משויך ✓</Badge>
                  ) : c.saleOptions.length === 0 ? (
                    <Badge tone="muted">אין פוליסה מתאימה</Badge>
                  ) : (
                    <Badge tone="warn">דורש שיוך</Badge>
                  )}
                </div>
              </div>

              {/* גוף: מקור ← יעד */}
              <div className="p-3 grid md:grid-cols-2 gap-3">
                {/* מקור */}
                <div className="rounded border p-3">
                  <div className="text-xs text-gray-500 mb-1">מקור (EXTERNAL)</div>
                  <div className="text-sm text-gray-700">
                    חברת ביטוח: <b>{c.ext.company || '—'}</b>
                    <br />
                    חודש פוליסה (valid): <b>{c.ext.validMonth || '—'}</b>
                    <br />
                    חודש דיווח (report): <b>{c.ext.reportMonth || '—'}</b>
                    <br />
                    נפרעים: <b>{money(c.ext.commissionAmount)}</b>
                  </div>
                </div>

                {/* יעד */}
                <div className="rounded border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs text-gray-500">יעד: SALE (MAGIC)</div>
                    {!isLinked && (
                    <button
                      className="px-3 py-1.5 rounded border"
                      onClick={() => onCreate?.(c.ext)}
                    >
                      צור פוליסה חדשה
                    </button>
                     )}
                  </div>
                  {isLinked ? (
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-gray-700">
                        הרשומה משויכת לפוליסה במערכת.
                      </div>
                      <button
                        className="px-3 py-1.5 rounded border"
                        onClick={() => onUnlink?.(c.ext.id)}
                      >
                        נתק
                      </button>
                    </div>
                  ) : c.saleOptions.length === 0 ? (
                    <div className="text-sm text-gray-500">
                      לא נמצאה פוליסה קיימת. ניתן ליצור חדשה ולשייך.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-500">
                          בחרי פוליסה קיימת ב-SALE לשיוך
                        </label>
                        <select
                          className="px-3 py-2 rounded border max-w-xl"
                          value={sID}
                          onChange={(e) =>
                            setSelected((prev) => ({
                              ...prev,
                              [c.ext.id]: e.target.value,
                            }))
                          }
                        >
                          <option value="">בחרי…</option>
                          {c.saleOptions.map((s) => (
                            <option key={s.saleId} value={s.saleId}>
                              {s.customerName} • {s.company} • {s.product} • {s.policyMonth}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
                          disabled={!sID}
                          onClick={() => sID && onLink?.(c.ext.id, sID)}
                        >
                          שיוך
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {active.length === 0 && (
          <div className="text-gray-500 bg-white border rounded-xl p-6 text-center">
            אין פריטים להצגה בלשונית זו.
          </div>
        )}
      </div>
    </div>
  );
}
