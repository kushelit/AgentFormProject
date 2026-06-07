'use client';
// components/ElementaryContractsTab/ElementaryContractsTab.tsx

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  collection, query, where, getDocs,
  writeBatch, doc, orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { Button } from '@/components/Button/Button';
import { ToastNotification } from '@/components/ToastNotification';
import { useToast } from '@/hooks/useToast';
import {
  calcElementaryCommission,
  type ElementaryProductGroup,
  type ElementaryProduct,
} from '@/config/elementaryContractsConfig';

// ─── Types ───────────────────────────────────────────────────────────────────

type CompanyRow = {
  id: string;
  companyName: string;
  elementaryManual?: boolean;
};

type RateMap = Record<string, Record<string, string>>;
// { [productId__mozal?]: { [companyName]: "22" } }

type ElementaryContractDoc = {
  id: string;
  agentId: string;
  productId: string;
  track: 'מוזל' | 'רגיל' | '';
  companyName: string;
  commissionRate: string;
};

type Props = {
  agentId: string;
};

// ─── rate key: productId + track ─────────────────────────────────────────────
const rateKey = (productId: string, track: 'מוזל' | 'רגיל' | '') =>
  track ? `${productId}__${track}` : productId;

// ─── Component ───────────────────────────────────────────────────────────────

const ElementaryContractsTab: React.FC<Props> = ({ agentId }) => {
  const { toasts, addToast, setToasts } = useToast();

  const [groups, setGroups] = useState<ElementaryProductGroup[]>([]);
  const [products, setProducts] = useState<ElementaryProduct[]>([]);
  const [autoCompanies, setAutoCompanies] = useState<CompanyRow[]>([]);
  const [manualCompanies, setManualCompanies] = useState<CompanyRow[]>([]);
  const [rates, setRates] = useState<RateMap>({});
  const [originalRates, setOriginalRates] = useState<RateMap>({});
  const [existingDocs, setExistingDocs] = useState<ElementaryContractDoc[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const ratesRef = useRef<RateMap>({});
  useEffect(() => { ratesRef.current = rates; }, [rates]);

  // ─── Fetch meta ───────────────────────────────────────────────────────────
  const fetchMeta = useCallback(async () => {
    const [groupsSnap, productsSnap, companiesSnap] = await Promise.all([
      getDocs(query(collection(db, 'elementaryProductGroups'), orderBy('order'))),
      getDocs(query(collection(db, 'elementaryProducts'), orderBy('order'))),
      getDocs(query(collection(db, 'company'), where('supportsElementary', '==', true))),
    ]);

    setGroups(groupsSnap.docs.map(d => ({ id: d.id, ...d.data() } as ElementaryProductGroup)));
setProducts(productsSnap.docs
  .map(d => ({ id: d.id, ...d.data() } as ElementaryProduct))
  .filter(p => !p.isManual)
);
    const all: CompanyRow[] = companiesSnap.docs.map(d => ({
      id: d.id,
      companyName: d.data().companyName,
      elementaryManual: d.data().elementaryManual ?? false,
    }));
    setAutoCompanies(all.filter(c => !c.elementaryManual));
    setManualCompanies(all.filter(c => c.elementaryManual));
  }, []);

  // ─── Fetch saved rates ────────────────────────────────────────────────────
  const fetchContracts = useCallback(async () => {
    if (!agentId) return;
    const snap = await getDocs(query(
      collection(db, 'elementaryContracts'),
      where('agentId', '==', agentId)
    ));
    const docs: ElementaryContractDoc[] = snap.docs.map(d => ({
      id: d.id,
      ...(d.data() as Omit<ElementaryContractDoc, 'id'>),
    }));
    setExistingDocs(docs);

    const next: RateMap = {};
    docs.forEach(d => {
      const k = rateKey(d.productId, d.track);
      if (!next[k]) next[k] = {};
      next[k][d.companyName] = d.commissionRate;
    });

    setRates(next);
    setOriginalRates(JSON.parse(JSON.stringify(next)));
  }, [agentId]);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);
  useEffect(() => { if (agentId) fetchContracts(); }, [fetchContracts, agentId]);

  // ─── Dirty check ─────────────────────────────────────────────────────────
  const isCellDirty = (key: string, company: string, value: string) =>
    (originalRates[key]?.[company] ?? '') !== (value ?? '');

  // ─── Save ─────────────────────────────────────────────────────────────────
  const saveContracts = async () => {
    if (!agentId) { addToast('error', 'חסר סוכן'); return; }
    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      let writeCount = 0;

      // map existing docs for quick lookup
      const existingMap: Record<string, string> = {};
      existingDocs.forEach(d => {
        existingMap[`${rateKey(d.productId, d.track)}__${d.companyName}`] = d.id;
      });

      const current = ratesRef.current;

      products.forEach(product => {
        const tracks: Array<'מוזל' | 'רגיל' | ''> = product.hasMozalTrack
          ? ['מוזל', 'רגיל']
          : [''];

        tracks.forEach(track => {
          const k = rateKey(product.id, track);
          autoCompanies.forEach(company => {
            const value = (current[k]?.[company.companyName] ?? '').trim();
            const lookupKey = `${k}__${company.companyName}`;
            const existingId = existingMap[lookupKey];

            if (value) {
              const payload = {
                agentId,
                productId: product.id,
                productLabel: product.label,
                productGroupId: product.productGroupId,
                track: track,
                companyName: company.companyName,
                commissionRate: value,
              };
              if (existingId) {
                batch.update(doc(db, 'elementaryContracts', existingId), payload);
              } else {
                batch.set(doc(collection(db, 'elementaryContracts')), payload);
              }
              writeCount++;
            } else if (existingId) {
              batch.delete(doc(db, 'elementaryContracts', existingId));
              writeCount++;
            }
          });
        });
      });

      if (writeCount === 0) { addToast('error', 'לא נמצאו שינויים לשמירה'); return; }
      await batch.commit();
      setOriginalRates(JSON.parse(JSON.stringify(current)));
      addToast('success', 'נשמר בהצלחה');
      await fetchContracts();
    } catch {
      addToast('error', 'שגיאה בשמירה');
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div dir="rtl" style={{ paddingBottom: '2rem' }}>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderBottom: '1px solid #D3D1C7', alignItems: 'center' }}>
        <Button
          onClick={agentId && !isSaving ? saveContracts : undefined}
          text={isSaving ? 'שומר...' : 'שמור'}
          type="primary" icon="off"
          state={!agentId || isSaving ? 'disabled' : 'default'}
        />
        <span style={{ fontSize: 12, color: '#5F5E5A' }}>
          ניתן לערוך בכל שלב. שינוי משפיע על חישובים עתידיים בלבד.
        </span>
      </div>

      {/* Table per group */}
      {groups.map(group => {
        const groupProducts = products.filter(p => p.productGroupId === group.id);
        if (!groupProducts.length) return null;

        return (
          <div key={group.id} style={{ marginBottom: 24, padding: '0 16px' }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#1A1A2E', margin: '16px 0 8px' }}>
              {group.label}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>מוצר</th>
                    <th style={thStyle}>מסלול</th>
                    {autoCompanies.map(c => (
                      <th key={c.id} style={thStyle}>{c.companyName}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groupProducts.map(product => {
                    const tracks: Array<'מוזל' | 'רגיל' | ''> = product.hasMozalTrack
                      ? ['מוזל', 'רגיל']
                      : [''];

                    return tracks.map((track, ti) => {
                      const k = rateKey(product.id, track);
                      const ri = groupProducts.indexOf(product) * (product.hasMozalTrack ? 2 : 1) + ti;
                      const bg = ri % 2 === 0 ? '#fff' : '#F5F7FA';

                      return (
                        <tr key={k}>
                          {/* מוצר — span 2 שורות אם יש מסלול */}
                          {(!product.hasMozalTrack || track === 'מוזל') && (
                            <td
                              rowSpan={product.hasMozalTrack ? 2 : 1}
                              style={{ ...tdStyle, fontWeight: 600, background: bg, verticalAlign: 'middle' }}
                            >
                              {product.label}
                            </td>
                          )}
                          <td style={{ ...tdStyle, background: bg, color: '#5F5E5A', fontSize: 11 }}>
                            {track || '—'}
                          </td>
                          {autoCompanies.map(company => {
                            const value = rates[k]?.[company.companyName] ?? '';
                            const dirty = isCellDirty(k, company.companyName, value);
                            return (
                              <td key={company.id} style={{ ...tdStyle, background: bg }}>
                                <input
                                  value={value}
                                  placeholder="0"
                                  disabled={!agentId}
                                  onChange={e => {
                                    const v = e.target.value;
                                    setRates(prev => ({
                                      ...prev,
                                      [k]: { ...prev[k], [company.companyName]: v },
                                    }));
                                  }}
                                  style={{
                                    width: 46, fontSize: 11, padding: '3px 5px',
                                    border: dirty ? '1px solid #185FA5' : '1px solid #B4B2A9',
                                    borderRadius: 4,
                                    background: dirty ? '#EEF5FF' : 'white',
                                    textAlign: 'center',
                                  }}
                                />
                                {value && (
                                  <div style={{ fontSize: 10, color: '#888780', marginTop: 2, textAlign: 'center' }}>
                                    %{value}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    });
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* Manual companies */}
      {manualCompanies.length > 0 && (
        <div style={{ padding: '0 16px', marginTop: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#5F5E5A', marginBottom: 6 }}>
            חברות ידניות — אחוז עמלה מוזן ידנית לכל עסקה
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {manualCompanies.map(c => (
              <span key={c.id} style={{ fontSize: 11, padding: '3px 9px', background: '#F5F7FA', border: '1px solid #D3D1C7', borderRadius: 4 }}>
                {c.companyName}
              </span>
            ))}
            <span style={{ fontSize: 11, padding: '3px 9px', background: '#F5F7FA', border: '1px solid #D3D1C7', borderRadius: 4 }}>
              כתב שירות
            </span>
          </div>
        </div>
      )}

      {toasts.map(t => (
        <ToastNotification key={t.id} type={t.type} className={t.isHiding ? 'hide' : ''} message={t.message} onClose={() => setToasts(p => p.filter(x => x.id !== t.id))} />
      ))}
    </div>
  );
};

const thStyle: React.CSSProperties = {
  background: '#1E5FA8', color: 'white',
  padding: '6px 8px', textAlign: 'right',
  fontSize: 11, fontWeight: 500,
  whiteSpace: 'nowrap', borderBottom: '1px solid #D3D1C7',
};

const tdStyle: React.CSSProperties = {
  padding: '6px 8px',
  borderBottom: '1px solid #E8E6DF',
  verticalAlign: 'middle',
};

export default ElementaryContractsTab;
