'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ReconcileMock from '@/components/ReconcileMock';
import { buildCandidates } from '@/components/CustomerReconcilePanel/logic';
import { linkExternalToSale, unlinkExternalLink } from '@/services/reconcileLinks';
import { fetchExternalForCustomers } from '@/services/externalQueries';
import { db } from '@/lib/firebase/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { ym } from '@/utils/reconcile';
import type { ContractForCompareCommissions } from '@/types/Contract';

// -----------------------------
// Types
// -----------------------------
type Props = { searchParams: Record<string, string> };

type Product = {
  productName: string;
  productGroup: string;
  isOneTime?: boolean;
};

type CommissionSplit = {
  id: string;
  agentId: string;
  sourceLeadId: string;
  percentToAgent: number; // 0..100
};

type SaleBrief = {
  saleId: string;
  customerId: string;
  customerName: string;
  company: string;
  product: string;
  policyMonth: string; // YYYY-MM
  commissionNifraim?: number | null; // ערך מחושב
};

type SummaryRow = {
  extId: string;
  company: string;
  validMonth: string;
  reportMonth: string;
  amount: number;
  linkedSaleId?: string | null;
  status: 'linked' | 'pending';
  sale?: {
    saleId: string;
    product?: string;
    policyMonth?: string;
    customerName?: string;
  };
  magicNifraim?: number | null; // מחושב
};

// -----------------------------
// Simple in-memory cache (per tab/session)
// -----------------------------
const cache = {
  products: { data: {} as Record<string, Product>, loaded: false },
  contractsByAgent: new Map<string, ContractForCompareCommissions[]>(), // ← אחיד
  splitsByAgent: new Map<string, CommissionSplit[]>(),
  customers: new Map<string, { name: string; sourceValue?: string }>(), // key: IDCustomer
  sales: new Map<string, any>(), // key: saleId → sale doc
};

// -----------------------------
// Firestore helpers with caching
// -----------------------------
async function getProductsMap(): Promise<Record<string, Product>> {
  if (cache.products.loaded) return cache.products.data;
  const snap = await getDocs(collection(db, 'product'));
  const map: Record<string, Product> = {};
  snap.docs.forEach((d) => {
    const p = d.data() as any;
    map[p.productName] = {
      productName: p.productName,
      productGroup: p.productGroup,
      isOneTime: !!p.isOneTime,
    };
  });
  cache.products.data = map;
  cache.products.loaded = true;
  return map;
}

async function getContractsForAgent(agentId: string): Promise<ContractForCompareCommissions[]> {
  const key = String(agentId || '');
  const cached = cache.contractsByAgent.get(key);
  if (cached) return cached;

  // מומלץ: לצמצם לחוזים של הסוכן
  const q = query(collection(db, 'contracts'), where('AgentId', '==', key));
  const snap = await getDocs(q);

  const rows: ContractForCompareCommissions[] = snap.docs.map((d) => {
    const x = d.data() as any;
    return {
      id: d.id,
      company: String(x.company || ''),
      product: String(x.product || ''),
      productsGroup: String(x.productsGroup || ''),
      AgentId: String(x.AgentId ?? x.agentId ?? ''), // ← AgentId תקין
      commissionHekef: Number(x.commissionHekef ?? 0),
      commissionNifraim: Number(x.commissionNifraim ?? 0),
      commissionNiud: Number(x.commissionNiud ?? 0),
      minuySochen: !!x.minuySochen,
    };
  });

  cache.contractsByAgent.set(key, rows);
  return rows;
}

async function getSplitsForAgent(agentId: string): Promise<CommissionSplit[]> {
  const key = String(agentId || '');
  if (cache.splitsByAgent.has(key)) return cache.splitsByAgent.get(key)!;

  const q = query(collection(db, 'commissionSplits'), where('agentId', '==', key));
  const snap = await getDocs(q);
  const rows: CommissionSplit[] = snap.docs.map((d) => ({
    id: d.id,
    agentId: String(d.data().agentId || ''),
    sourceLeadId: String(d.data().sourceLeadId || ''),
    percentToAgent: Number(d.data().percentToAgent || 0),
  }));
  cache.splitsByAgent.set(key, rows);
  return rows;
}

async function getCustomersMetaByIds(idCustomers: string[]) {
  const unknown = idCustomers.filter((id) => !cache.customers.has(id));
  for (let i = 0; i < unknown.length; i += 10) {
    const chunk = unknown.slice(i, i + 10);
    const cq = query(collection(db, 'customer'), where('IDCustomer', 'in', chunk));
    const cs = await getDocs(cq);
    cs.docs.forEach((d) => {
      const data = d.data() as any;
      const idc = String(data.IDCustomer || '');
      const name = `${data.firstNameCustomer ?? ''} ${data.lastNameCustomer ?? ''}`.trim() || idc;
      cache.customers.set(idc, { name, sourceValue: data.sourceValue || '' });
    });
  }
}

async function getSalesByIds(saleIds: string[]) {
  const missing = saleIds.filter((id) => !cache.sales.has(id));
  for (let i = 0; i < missing.length; i += 10) {
    const chunk = missing.slice(i, i + 10);
    await Promise.all(
      chunk.map(async (id) => {
        const sref = doc(db, 'sales', id);
        const snap = await getDoc(sref);
        if (snap.exists()) cache.sales.set(id, { id, ...(snap.data() as any) });
      })
    );
  }
}

// -----------------------------
// Domain logic: commissions (MAGIC — נפרעים)
// -----------------------------
function toNum(x: any): number {
  const n = Number(x);
  return isNaN(n) ? 0 : n;
}

function computeMagicNifraimForSale(
  sale: any,
  {
    contracts,
    productMap,
    customerSourceValue,
    splits,
    withSplit,
  }: {
    contracts: ContractForCompareCommissions[];
    productMap: Record<string, Product>;
    customerSourceValue?: string;
    splits: CommissionSplit[];
    withSplit: boolean;
  }
): number {
  const product = productMap[String(sale.product)];
  const isOneTime = product?.isOneTime ?? false;

  // מציאת חוזה: התאמה מדויקת מוצר+חברה, ואם אין — לפי קבוצת מוצרים
  const exact = contracts.find(
    (c) =>
      c.AgentId === String(sale.AgentId) &&
      c.product === String(sale.product) &&
      c.company === String(sale.company) &&
      (c.minuySochen === sale.minuySochen || (c.minuySochen === undefined && !sale.minuySochen))
  );

  let used = exact;
  if (!used && product?.productGroup) {
    used = contracts.find(
      (c) =>
        c.AgentId === String(sale.AgentId) &&
        c.productsGroup === product.productGroup &&
        (c.minuySochen === sale.minuySochen || (c.minuySochen === undefined && !sale.minuySochen))
    );
  }
  if (!used) return 0;

  // נפרעים מחשבים רק למוצרים שאינם חד-פעמיים
  if (isOneTime) return 0;

  const insPremia = toNum(sale.insPremia);
  const pensiaPremia = toNum(sale.pensiaPremia);
  const finansimZvira = toNum(sale.finansimZvira);

  let nifraim =
    (insPremia * used.commissionNifraim) / 100 +
    (pensiaPremia * used.commissionNifraim) / 100 +
    (finansimZvira * used.commissionNifraim) / 100 / 12;

  // פיצול (אם הופעל)
  if (withSplit && customerSourceValue) {
    const split = splits.find(
      (s) => s.agentId === String(sale.AgentId) && s.sourceLeadId === String(customerSourceValue)
    );
    if (split && split.percentToAgent >= 0) {
      nifraim = nifraim * (split.percentToAgent / 100);
    }
  }

  return Math.round(nifraim || 0);
}

// -----------------------------
// Enrich SALE briefs with computed MAGIC nifraim
// -----------------------------
async function enrichSaleBriefs(
  saleIds: string[],
  ctx: {
    contracts: ContractForCompareCommissions[];
    productMap: Record<string, Product>;
    splits: CommissionSplit[];
    withSplit: boolean;
  }
): Promise<Record<string, SaleBrief>> {
  await getSalesByIds(saleIds);
  const sales = saleIds.reduce<Record<string, any>>((acc, id) => {
    if (cache.sales.has(id)) acc[id] = cache.sales.get(id);
    return acc;
  }, {});

  const idCustomerList = Object.values(sales)
    .map((s: any) => String(s.IDCustomer || ''))
    .filter(Boolean);
  await getCustomersMetaByIds(idCustomerList);

  const out: Record<string, SaleBrief> = {};
  for (const sid of saleIds) {
    const s: any = cache.sales.get(sid);
    if (!s) continue;
    const idc = String(s.IDCustomer || '');
    const customerMeta = cache.customers.get(idc) || { name: idc, sourceValue: '' };

    out[sid] = {
      saleId: sid,
      customerId: idc,
      customerName: customerMeta.name,
      company: String(s.company || ''),
      product: String(s.product || ''),
      policyMonth: ym(String(s.month || s.mounth || '')),
      commissionNifraim: computeMagicNifraimForSale(s, {
        contracts: ctx.contracts,
        productMap: ctx.productMap,
        customerSourceValue: customerMeta.sourceValue,
        splits: ctx.splits,
        withSplit: ctx.withSplit,
      }),
    };
  }
  return out;
}

// שליפה בודדת (לרגע שיוך/ניתוק)
async function fetchSaleById(saleId: string) {
  if (!cache.sales.has(saleId)) {
    const snap = await getDoc(doc(db, 'sales', saleId));
    if (!snap.exists()) return null;
    cache.sales.set(saleId, { id: saleId, ...(snap.data() as any) });
  }
  const s: any = cache.sales.get(saleId);
  return {
    id: saleId,
    customerId: String(s.IDCustomer || ''),
    company: String(s.company || ''),
    policyMonth: ym(String(s.month || s.mounth || '')),
    AgentId: String(s.AgentId || ''),
  };
}

// -----------------------------
// Component
// -----------------------------
export default function ReconcilePageClient({ searchParams }: Props) {
  const agentId = searchParams.agentId || '';
  const company = (searchParams.company || '').trim();
  const repYm = searchParams.repYm || '';
  const withSplit = (searchParams.split ?? '1') !== '0'; // ברירת מחדל: כן פיצול

  const customerIds = useMemo(
    () => (searchParams.customerIds || '').split(',').map((s) => s.trim()).filter(Boolean),
    [searchParams.customerIds]
  );

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]); // לפאנלי השיוך

  // רצועת סיכום
  const [summaryRows, setSummaryRows] = useState<SummaryRow[]>([]);
  const [summaryExtTotal, setSummaryExtTotal] = useState<number>(0);

  // קאש סביבתי כדי לא למשוך שוב ושוב
  const envRef = useRef<{
    contracts?: ContractForCompareCommissions[];
    productMap?: Record<string, Product>;
    splits?: CommissionSplit[];
  }>({});

  // --- (A) סיכום EXTERNAL + MAGIC (מחושב עבור רשומות מקושרות) ---
  useEffect(() => {
    (async () => {
      if (!agentId || customerIds.length === 0 || !repYm) {
        setSummaryRows([]);
        setSummaryExtTotal(0);
        return;
      }

      // קונסול לעזרה בדיבוג פרמטרים
      console.log('[Reconcile] agentId=', agentId, 'customerIds=', customerIds, 'company=', company, 'repYm=', repYm, 'withSplit=', withSplit);

      // קאש סביבתי
      const contracts =
        envRef.current.contracts ?? (envRef.current.contracts = await getContractsForAgent(agentId));
      const productMap =
        envRef.current.productMap ?? (envRef.current.productMap = await getProductsMap());
      const splits =
        envRef.current.splits ?? (envRef.current.splits = await getSplitsForAgent(agentId));

      const buckets = await fetchExternalForCustomers({
        agentId,
        customerIds,
        reportFromYm: repYm,
        reportToYm: repYm,
        company: company || undefined,
      });

      const allRows = buckets.flatMap((b) => b.rows);
      const linkedSaleIds = Array.from(
        new Set(allRows.map((r: any) => r.linkedSaleId).filter(Boolean) as string[])
      );

      const briefs = linkedSaleIds.length
        ? await enrichSaleBriefs(linkedSaleIds, { contracts, productMap, splits, withSplit })
        : {};

      const list: SummaryRow[] = allRows
        .map((r: any) => {
          const amt =
            typeof r.commissionAmount === 'number'
              ? r.commissionAmount
              : Number(r.commissionAmount || 0);
          const brief = r.linkedSaleId ? briefs[r.linkedSaleId] : undefined;

          return {
            extId: r.id,
            company: String(r.company || ''),
            validMonth: ym(String(r.validMonth || '')),
            reportMonth: ym(String(r.reportMonth || '')),
            amount: amt || 0,
            linkedSaleId: r.linkedSaleId ?? null,
            status: r.linkedSaleId ? 'linked' : 'pending',
            sale: brief
              ? {
                  saleId: brief.saleId,
                  product: brief.product,
                  policyMonth: brief.policyMonth,
                  customerName: brief.customerName,
                }
              : undefined,
            magicNifraim: brief?.commissionNifraim ?? null,
          } as SummaryRow;
        })
        .sort(
          (a, b) =>
            a.company.localeCompare(b.company) ||
            a.validMonth.localeCompare(b.validMonth) ||
            a.extId.localeCompare(b.extId)
        );

      const total = list.reduce((acc, r) => acc + (r.amount || 0), 0);

      setSummaryRows(list);
      setSummaryExtTotal(total);
    })();
  }, [agentId, customerIds.join(','), company, repYm, withSplit]);

  // --- (B) טעינת מועמדים לפאנלים ---
  useEffect(() => {
    (async () => {
      if (!agentId || customerIds.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }
      setLoading(true);

      const contracts =
        envRef.current.contracts ?? (envRef.current.contracts = await getContractsForAgent(agentId));
      const productMap =
        envRef.current.productMap ?? (envRef.current.productMap = await getProductsMap());
      const splits =
        envRef.current.splits ?? (envRef.current.splits = await getSplitsForAgent(agentId));

      const res = await buildCandidates({ agentId, customerIds, company });
      const saleIds = Array.from(res.bySale.keys());
      const briefs = await enrichSaleBriefs(saleIds, { contracts, productMap, splits, withSplit });

      const uiItems = [...res.bySale.entries()].flatMap(([saleId, cands]) => {
        const brief = briefs[saleId];
        if (!brief) return [];
        return cands.map((c) => ({
          ext: {
            id: c.extId,
            company: c.company || brief.company || '',
            validMonth: c.validMonth || brief.policyMonth || '',
            reportMonth: c.reportMonth || repYm || '',
            commissionAmount: c.commissionAmount ?? 0,
            linkedSaleId: c.linkedSaleId ?? null,
          },
          saleOptions: [
            {
              saleId: brief.saleId,
              customerName: brief.customerName,
              company: brief.company,
              product: brief.product,
              policyMonth: brief.policyMonth,
            },
          ],
          suggestedSaleId: brief.saleId,
        }));
      });

      setItems(uiItems);
      setLoading(false);
    })();
  }, [agentId, company, customerIds.join(','), repYm, withSplit]);

  // --- פעולות שיוך/ניתוק ---
  async function handleLink(extId: string, saleId: string) {
    const s = await fetchSaleById(saleId);
    if (!s) return;

    await linkExternalToSale({
      extId,
      saleId,
      agentId,
      customerId: s.customerId,
      company: s.company,
      policyMonth: s.policyMonth,
      // אל תשלחי reportMonth אם החתימה לא כוללת אותו
    });

    // עדכון בפאנלים
    setItems((prev) =>
      prev.map((it) => (it.ext.id === extId ? { ...it, ext: { ...it.ext, linkedSaleId: saleId } } : it))
    );
    // עדכון ברצועת הסיכום (הופך ל-linked; חישוב MAGIC יתעדכן ברענון/טעינה מחודשת)
    setSummaryRows((prev) =>
      prev.map((r) =>
        r.extId === extId ? { ...r, linkedSaleId: saleId, status: 'linked' } : r
      )
    );
  }

  async function handleUnlink(extId: string) {
    await unlinkExternalLink(extId);
    setItems((prev) =>
      prev.map((it) => (it.ext.id === extId ? { ...it, ext: { ...it.ext, linkedSaleId: null } } : it))
    );
    setSummaryRows((prev) =>
      prev.map((r) =>
        r.extId === extId ? { ...r, linkedSaleId: null, status: 'pending', magicNifraim: null, sale: undefined } : r
      )
    );
  }

  // -----------------------------
  // UI
  // -----------------------------
  return (
    <div dir="rtl" className="p-6 bg-gray-100 min-h-screen">
      <h1 className="text-2xl font-bold mb-4">בדיקת התאמות ושיוך פוליסות</h1>

      <div className="mb-4 text-sm text-gray-600">
        {agentId && (
          <span className="mr-3">
            סוכן: <b>{agentId}</b>
          </span>
        )}
        {customerIds.length > 0 && (
          <span className="mr-3">
            לקוחות: <b>{customerIds.join(', ')}</b>
          </span>
        )}
        {company && (
          <span className="mr-3">
            חברה: <b>{company}</b>
          </span>
        )}
        {repYm && (
          <span className="mr-3">
            חודש דיווח: <b>{repYm}</b>
          </span>
        )}
        <span className="mr-3">
          פיצול עמלות: <b>{withSplit ? 'כן' : 'לא'}</b>
        </span>
      </div>

      {/* ===== רצועת סיכום עליונה ===== */}
      <div className="mb-6 bg-white border rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-4 mb-3 text-sm">
          <div>
            <b>סה״כ רשומות בקובץ:</b> {summaryRows.length}
          </div>
          <div>
            <b>סכום נפרעים (EXTERNAL):</b> {summaryExtTotal.toLocaleString()}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="p-2 text-right">סטטוס</th>
                <th className="p-2 text-right">חברה</th>
                <th className="p-2 text-right">חודש (valid/report)</th>
                <th className="p-2 text-right">נפרעים — EXTERNAL</th>
                <th className="p-2 text-right">פוליסה/מוצר — SALE</th>
                <th className="p-2 text-right">נפרעים — MAGIC</th>
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((r) => (
                <tr key={r.extId} className={r.status === 'linked' ? 'bg-green-50' : ''}>
                  <td className="p-2">{r.status === 'linked' ? 'משויך' : 'דורש שיוך'}</td>
                  <td className="p-2">{r.company || '-'}</td>
                  <td className="p-2">
                    {r.validMonth || '-'} / {r.reportMonth || '-'}
                  </td>
                  <td className="p-2">{(r.amount ?? 0).toLocaleString()}</td>
                  <td className="p-2">
                    {r.sale ? `${r.sale.product || ''} · ${r.sale.policyMonth || ''}` : '—'}
                  </td>
                  <td className="p-2">
                    {typeof r.magicNifraim === 'number' ? r.magicNifraim.toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
              {summaryRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-3 text-gray-500">
                    אין רשומות לתצוגה עבור המסננים שנבחרו.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== פאנלי השיוך ===== */}
      {loading ? (
        <div className="bg-white border rounded-xl p-6 text-gray-500">טוען…</div>
      ) : (
        <ReconcileMock data={items} onLink={handleLink} onUnlink={handleUnlink} />
      )}
    </div>
  );
}
