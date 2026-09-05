'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  collection, doc, getDoc, getDocs, query, where, updateDoc, serverTimestamp, limit,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from '@/lib/firebase/AuthContext';
import useFetchMD from '@/hooks/useMD';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import { usePermission } from '@/hooks/usePermission';
import { fetchExternalForCustomers } from '@/services/externalQueries';
import { Button } from '@/components/Button/Button';
import { ToastNotification } from '@/components/ToastNotification';
import { useToast } from '@/hooks/useToast';
import { resolveFromTemplate } from '@/utils/contractCommissionResolvers';
import './CustomerPage.css';
import CustomerNotes from './CustomerNotes';
import CustomerTasks from './CustomerTasks';
import CustomerMeetingFlow from './CustomerMeetingFlow';

// ─── טיפוסים ──────────────────────────────────────────────────────────────────

interface CustomerDoc {
  id: string;
  IDCustomer: string;
  firstNameCustomer: string;
  lastNameCustomer: string;
  fullNameCustomer?: string;
  birthday?: string;
  familyStatus?: string;
  gender?: string;
  phone?: string;
  mail?: string;
  address?: string;
  sourceValue?: string;
  sourceLead?: string;
  notes?: string;
  parentID?: string;
  parentFullName?: string;
  shortNote?: string;
  customerTier?: 'premium' | 'gold' | 'silver' | 'standard';
  tierNifraim?: number;
  AgentId: string;
  issueDay?: string;
  responsibleUserId?: string;
  responsibleUserName?: string;
}

interface SaleRow {
  _id: string;
  IDCustomer: string;
  product: string;
  company: string;
  mounth?: string;
  month?: string;
  statusPolicy?: string;
  insPremia?: string;
  pensiaPremia?: string;
  pensiaZvira?: string;
  finansimPremia?: string;
  finansimZvira?: string;
  minuySochen?: boolean;
  commissionHekef?: number;
  commissionNifraim?: number;
  sumPremia?: number;
  sumTzvira?: number;
  customerName?: string; // ← מוצג רק כשמציגים ריכוז תא משפחתי, כדי לדעת של מי כל שורה
}

interface ExternalRow {
  company: string;
  product?: string;
  policyNumber?: string;
  commissionAmount: number;
  totalPremiumAmount?: number;
  reportMonth?: string;
  templateId?: string;
  customerId?: string | null; // ← מ-policyCommissionSummaries, לשיוך לבן משפחה כש-includeFamily פעיל
  customerName?: string;
}

interface FamilyMember {
  id: string;
  IDCustomer: string;
  firstNameCustomer: string;
  lastNameCustomer: string;
  parentID?: string;
}

interface AgentUser {
  id: string;
  name?: string;
  displayName?: string;
  email?: string;
}

type TabKey = 'magic' | 'nifraim' | 'family' | 'notes' | 'tasks' | 'meeting';

// ─── עזרים ────────────────────────────────────────────────────────────────────

const normIdDigits = (v: any) => String(v ?? '').trim().replace(/\D/g, '');
const pad9 = (v: string) => v.padStart(9, '0');
const stripZeros = (v: string) => v.replace(/^0+/, '');
const canonId = (v: any) => stripZeros(normIdDigits(v));

const idVariants = (v: any): string[] => {
  const d = normIdDigits(v);
  if (!d) return [];
  return Array.from(new Set([d, pad9(d), stripZeros(d)].filter(Boolean)));
};

const saleKey = (s: any) =>
  [
    String(s.company ?? '').trim(),
    String(s.product ?? '').trim(),
    String((s.mounth || s.month || '')).slice(0, 7),
    canonId(s.IDCustomer),
    String((s.policyNumber || s._id || '')).trim(),
  ].join('|');

const dedupeSales = (rows: any[]) => {
  const m = new Map<string, any>();
  for (const r of rows) {
    const k = saleKey(r);
    if (!m.has(k)) m.set(k, r);
  }
  return Array.from(m.values());
};

const prevMonth = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const initials = (first: string, last: string) =>
  `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();

const calculateAge = (birthday?: string): number | null => {
  if (!birthday) return null;
  const b = new Date(birthday);
  if (isNaN(b.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - b.getFullYear();
  const m = today.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
  return age >= 0 ? age : null;
};

// ─── קומפוננט ראשי ────────────────────────────────────────────────────────────

export default function CustomerPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, detail } = useAuth();
  const { formatIsraeliDateOnly, sourceLeadMap, fetchSourceLeadMap, productToGroupMap } = useFetchMD();
  const { toasts, addToast, setToasts } = useToast();

  const { agents, selectedAgentId, handleAgentChange } = useFetchAgentData();

  const { canAccess: canViewCommissions } = usePermission('view_commissions_field');

  // ─── מזהה לקוח מה-URL ────────────────────────────────────────────────────────
  const customerId = Array.isArray(params?.id) ? params.id[0] : (params?.id ?? '');

  // ─── סטייט ───────────────────────────────────────────────────────────────────
  const [customer, setCustomer] = useState<CustomerDoc | null>(null);
  const [loadingCustomer, setLoadingCustomer] = useState(true);

  const [activeTab, setActiveTab] = useState<TabKey>('tasks');

  // ── ריכוז תא משפחתי — משותף בין "עסקאות Magic" ו"פוליסות מטעינה" (אותה כוונה, אותו טוגל) ──
  const [includeFamily, setIncludeFamily] = useState(false);

  // עריכת פרטי לקוח
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<CustomerDoc>>({});
  const [isSaving, setIsSaving] = useState(false);

  const startEdit = () => {
    if (!customer) return;
    setEditData({
      firstNameCustomer: customer.firstNameCustomer,
      lastNameCustomer: customer.lastNameCustomer,
      IDCustomer: customer.IDCustomer,
      birthday: customer.birthday ?? '',
      familyStatus: customer.familyStatus ?? '',
      gender: customer.gender ?? '',
      phone: customer.phone ?? '',
      mail: customer.mail ?? '',
      address: customer.address ?? '',
      notes: customer.notes ?? '',
      shortNote: customer.shortNote ?? '',
      issueDay: customer.issueDay ?? '',
      responsibleUserId: customer.responsibleUserId ?? '',
    });
    setIsEditing(true);
  };

  const cancelEdit = () => { setIsEditing(false); setEditData({}); };

  const saveEdit = async () => {
    if (!customer) return;
    setIsSaving(true);
    try {
      const fullName = (editData.firstNameCustomer ?? '') + ' ' + (editData.lastNameCustomer ?? '');
      const responsibleUser = agentUsers.find(u => u.id === editData.responsibleUserId);
      const responsibleUserName = responsibleUser
        ? (responsibleUser.name || responsibleUser.displayName || responsibleUser.email || '')
        : '';
      await updateDoc(doc(db, 'customer', customer.id), {
        ...editData,
        fullNameCustomer: fullName.trim(),
        responsibleUserName,
        lastUpdateDate: serverTimestamp(),
      });
      setCustomer(prev => prev ? { ...prev, ...editData, fullNameCustomer: fullName.trim(), responsibleUserName } : prev);
      setIsEditing(false);
      setEditData({});
      addToast('success', 'פרטי הלקוח עודכנו בהצלחה');
    } catch {
      addToast('error', 'כשל בשמירת הנתונים');
    } finally {
      setIsSaving(false);
    }
  };

  // עסקאות Magic
  const [magicSales, setMagicSales] = useState<SaleRow[]>([]);
  const [loadingMagic, setLoadingMagic] = useState(false);
  const [contracts, setContracts] = useState<any[]>([]);
  const [productMap, setProductMap] = useState<Record<string, any>>({});
  const [templatesById, setTemplatesById] = useState<Record<string, any>>({});

  // פוליסות מטעינה
  const [reportMonth, setReportMonth] = useState(prevMonth);
  const [nifraimFilterMode, setNifraimFilterMode] = useState<'report' | 'publish'>('report');
  const [externalRows, setExternalRows] = useState<ExternalRow[]>([]);
  const [loadingExternal, setLoadingExternal] = useState(false);

  // פערים
  const [magicNifraim, setMagicNifraim] = useState(0);
  const [externalTotal, setExternalTotal] = useState(0);

  // קשרים משפחתיים
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [loadingFamily, setLoadingFamily] = useState(false);

  // ── חיפוש והוספת בן משפחה (לשונית "קשרים משפחתיים") ──
  const [familySearchQuery, setFamilySearchQuery] = useState('');
  const [familySearchResults, setFamilySearchResults] = useState<FamilyMember[]>([]);
  const [searchingFamily, setSearchingFamily] = useState(false);
  const [addingFamilyMemberId, setAddingFamilyMemberId] = useState<string | null>(null);

  // אנשי צוות הסוכנות — לבחירת "אחראי" ברמת לקוח (אותה רשימה כמו באחראי משימה)
  const [agentUsers, setAgentUsers] = useState<AgentUser[]>([]);

  // ─── טעינת נתוני לקוח ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!customerId) return;
    const load = async () => {
      setLoadingCustomer(true);
      try {
        const snap = await getDoc(doc(db, 'customer', customerId));
        if (snap.exists()) {
          setCustomer({ id: snap.id, ...(snap.data() as Omit<CustomerDoc, 'id'>) });
        }
      } finally {
        setLoadingCustomer(false);
      }
    };
    load();
  }, [customerId]);

  // ─── טעינת חוזים ומוצרים (חד-פעמי) ─────────────────────────────────────────
  useEffect(() => {
   const fetchContracts = async () => {
  const snap = await getDocs(collection(db, 'contracts'));
  setContracts(snap.docs.map(d => {
    const data = d.data() as any;
    return {
      id: d.id,
      ...data,
      agentId: data.AgentId ?? data.agentId, // ← נרמול
    };
  }));
};
    const fetchProducts = async () => {
      const snap = await getDocs(collection(db, 'product'));
      const map: Record<string, any> = {};
      snap.docs.forEach(d => {
        const pd = d.data() as any;
        map[pd.productName] = pd;
      });
      setProductMap(map);
    };
    const fetchTemplates = async () => {
      const snap = await getDocs(collection(db, 'commissionTemplates'));
      const map: Record<string, any> = {};
      snap.docs.forEach(d => { map[d.id] = d.data(); });
      setTemplatesById(map);
    };
    fetchContracts();
    fetchProducts();
    fetchTemplates();
  }, []);

  // ─── sourceLeadMap ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (customer?.AgentId) fetchSourceLeadMap(customer.AgentId);
  }, [customer?.AgentId]);

  // ─── אנשי צוות הסוכנות (לשדה "אחראי" ברמת לקוח) ────────────────────────────────
  useEffect(() => {
    if (!customer?.AgentId) return;
    const loadUsers = async () => {
      const q = query(
        collection(db, 'users'),
        where('agentId', '==', customer.AgentId),
        where('isActive', '==', true),
      );
      const snap = await getDocs(q);
      setAgentUsers(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    };
    loadUsers();
  }, [customer?.AgentId]);

  // ─── חישוב עמלות ─────────────────────────────────────────────────────────────
const calculateCommissions = (sale: any, contractMatch: any) => {
  const product = productMap[sale.product];
  const isOneTime = product?.isOneTime ?? false;
  const multiplier = isOneTime ? 1 : 12;
  const toNum = (v: any) => parseInt(v) || 0;

  // fallback לקבוצת מוצר אם אין התאמה מדויקת
  const effectiveMatch = contractMatch ?? contracts.find(
    c =>
      c.productsGroup === product?.productGroup &&
      c.agentId === customer?.AgentId &&
      (c.minuySochen === sale.minuySochen ||
        (c.minuySochen === undefined && !sale.minuySochen)),
  );

  if (!effectiveMatch) return { commissionHekef: 0, commissionNifraim: 0 };

  const hekef =
    toNum(sale.insPremia)     * effectiveMatch.commissionHekef / 100 * multiplier +
    toNum(sale.pensiaPremia)  * effectiveMatch.commissionHekef / 100 * multiplier +
    toNum(sale.pensiaZvira)   * effectiveMatch.commissionNiud  / 100 +
    toNum(sale.finansimPremia)* effectiveMatch.commissionHekef / 100 * multiplier +
    toNum(sale.finansimZvira) * effectiveMatch.commissionNiud  / 100;

  const nifraim = isOneTime ? 0 : (
    toNum(sale.insPremia)    * effectiveMatch.commissionNifraim / 100 +
    toNum(sale.pensiaPremia) * effectiveMatch.commissionNifraim / 100 +
    toNum(sale.finansimZvira)* effectiveMatch.commissionNifraim / 100 / 12
  );

  return {
    commissionHekef: Math.round(hekef),
    commissionNifraim: Math.round(nifraim),
  };
};

  // ─── טעינת תא משפחתי - תמיד כשיש parentID, לא רק בלשונית "family" -
  // כי גם לשוניות "עסקאות Magic" ו"פוליסות מטעינה" צריכות את הרשימה לריכוז ──
  const loadFamilyMembers = async () => {
    if (!customer?.parentID) { setFamilyMembers([]); return; }
    setLoadingFamily(true);
    try {
      const q = query(
        collection(db, 'customer'),
        where('AgentId', '==', customer.AgentId),
        where('parentID', '==', customer.parentID),
      );
      const snap = await getDocs(q);
      setFamilyMembers(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    } finally {
      setLoadingFamily(false);
    }
  };

  useEffect(() => {
    if (!customer?.parentID) { setFamilyMembers([]); return; }
    loadFamilyMembers();
  }, [customer]);

  // ── מזהי התא המשפחתי (לרבות הלקוח הנוכחי עצמו), לצורך ריכוז Magic + מטעינה ──
  const familyCanonSet = useMemo(() => {
    if (!customer) return new Set<string>();
    const ids = includeFamily
      ? [customer.IDCustomer, ...familyMembers.map(m => m.IDCustomer)]
      : [customer.IDCustomer];
    return new Set(ids.map(canonId).filter(Boolean));
  }, [includeFamily, customer, familyMembers]);

  // Firestore 'in' תומך עד 10 ערכים - מפצלים לצ'אנקים של 10 את כל וריאנטי הת"ז (עם/בלי 0 מוביל)
  const familyIdVariantChunks = useMemo(() => {
    if (!customer) return [] as string[][];
    const ids = includeFamily
      ? [customer.IDCustomer, ...familyMembers.map(m => m.IDCustomer)]
      : [customer.IDCustomer];
    const allVariants = Array.from(new Set(ids.flatMap(idVariants)));
    const chunks: string[][] = [];
    for (let i = 0; i < allVariants.length; i += 10) chunks.push(allVariants.slice(i, i + 10));
    return chunks;
  }, [includeFamily, customer, familyMembers]);

  // שם מלא לפי ת"ז מנורמלת - להצגת "של מי" כל שורה כשמריכזים תא משפחתי
  const familyNameByCanon = useMemo(() => {
    const map = new Map<string, string>();
    if (customer) map.set(canonId(customer.IDCustomer), `${customer.firstNameCustomer} ${customer.lastNameCustomer}`.trim());
    familyMembers.forEach(m => map.set(canonId(m.IDCustomer), `${m.firstNameCustomer} ${m.lastNameCustomer}`.trim()));
    return map;
  }, [customer, familyMembers]);

  // ─── טעינת עסקאות Magic (הלקוח הנוכחי, או כל התא המשפחתי כש-includeFamily פעיל) ──
  useEffect(() => {
    if (!customer || familyIdVariantChunks.length === 0) return;
    const agentId = customer.AgentId;

    const load = async () => {
      setLoadingMagic(true);
      try {
        const snaps = await Promise.all(familyIdVariantChunks.map(chunk => getDocs(query(
          collection(db, 'sales'),
          where('AgentId', '==', agentId),
          where('statusPolicy', 'in', ['פעילה', 'הצעה']),
          where('IDCustomer', 'in', chunk),
        ))));

        const docs = snaps
          .flatMap(snap => snap.docs)
          .map(d => ({ _id: d.id, ...(d.data() as any) }))
          .filter(s => familyCanonSet.has(canonId(s.IDCustomer)));
        const rows = dedupeSales(docs);

        const enriched = rows.map(s => {
          const effectiveMonth = s.mounth || s.month;
          const contractMatch = contracts.find(
            c =>
              c.agentId === agentId &&
              c.product === s.product &&
              c.company === s.company &&
              (c.minuySochen === s.minuySochen || (c.minuySochen === undefined && !s.minuySochen)),
          );
          const commissions = calculateCommissions(s, contractMatch);
          const sumPremia = (parseInt(s.insPremia) || 0) + (parseInt(s.pensiaPremia) || 0) + (parseInt(s.finansimPremia) || 0);
          const sumTzvira = (parseInt(s.pensiaZvira) || 0) + (parseInt(s.finansimZvira) || 0);
          const customerName = familyNameByCanon.get(canonId(s.IDCustomer)) || '';
          return { ...s, month: effectiveMonth, ...commissions, sumPremia, sumTzvira, customerName };
        });

        setMagicSales(enriched);
        const totalNifraim = enriched.reduce((a, r) => a + (r.commissionNifraim || 0), 0);
        setMagicNifraim(totalNifraim);
      } catch (e) {
        addToast('error', 'כשל בטעינת עסקאות');
      } finally {
        setLoadingMagic(false);
      }
    };

    if (contracts.length > 0) load();
  }, [customer, contracts, productMap, familyIdVariantChunks, familyCanonSet, familyNameByCanon]);

  // ─── טעינת פוליסות מטעינה (הלקוח הנוכחי, או כל התא המשפחתי כש-includeFamily פעיל) ──
  // שני מצבי סינון: "לפי חודש דיווח" (reportMonth, כרגיל) או "לפי חודש פרסום" (ym) -
  // האחרון דורש join ידני: policyCommissionSummaries.runId -> commissionImportRuns/{runId}.ym
  // (בדיוק כמו commitRun בבקאנד - runId הוא מזהה המסמך ב-commissionImportRuns, לא portalImportRuns).
  // שורות בלי ym (בד"כ ייבוא ידני, שלא כותב ym) לא נכללות בתצוגה הזו - נספרות בנפרד לשקיפות.
  const loadExternal = async () => {
    if (!customer) return;
    setLoadingExternal(true);
    try {
      const rawIds = includeFamily
        ? [customer.IDCustomer, ...familyMembers.map(m => m.IDCustomer)]
        : [customer.IDCustomer];
      const padded = Array.from(
        new Set(rawIds.flatMap(idVariants).map(v => v.padStart(9, '0'))),
      ).filter(Boolean);

      if (nifraimFilterMode === 'report') {
        const buckets = await fetchExternalForCustomers({
          agentId: customer.AgentId,
          customerIds: padded,
          reportFromYm: reportMonth,
          reportToYm: reportMonth,
        });

        const rows: ExternalRow[] = [];
        let total = 0;
        for (const b of buckets) {
          for (const r of b.rows) {
            const amt = Number(r.commissionAmount || 0);
            rows.push({
              company: r.company ?? '',
              product: r.product ?? '',
              policyNumber: r.policyNumber ?? '',
              commissionAmount: amt,
              totalPremiumAmount: Number(r.totalPremiumAmount || 0),
              reportMonth: r.reportMonth,
              templateId: r.templateId ?? undefined,
              customerId: r.customerId ?? null,
              customerName: r.customerId ? (familyNameByCanon.get(canonId(r.customerId)) || '') : '',
            });
            total += amt;
          }
        }
        setExternalRows(rows);
        setExternalTotal(Number(total.toFixed(2)));
      } else {
        // ── מצב "לפי חודש פרסום" — קורא ל-API ייעודי שמשכפל את אותו join מאומת
        // שכבר קיים ב-commission-summary-drilldown (portalImportRuns -> jobIds -> externalCommissions),
        // רק מסונן לפי customerId-ים במקום agentCode+companyId בודדים ──
        const res = await fetch('/api/customer-commission-by-ym', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: customer.AgentId,
            customerIds: padded,
            ym: reportMonth, // "reportMonth" בשדה ה-UI מתפרש כאן כחודש הפרסום שנבחר
          }),
        });

        if (!res.ok) {
          addToast('error', 'כשל בטעינת פוליסות לפי חודש פרסום');
          setExternalRows([]);
          setExternalTotal(0);
          return;
        }

        const data = await res.json();
        const rawRows: any[] = data.rows || [];

        const rows: ExternalRow[] = rawRows.map((r) => ({
          company: r.company ?? '',
          product: r.product ?? '',
          policyNumber: r.policyNumberKey ?? '',
          commissionAmount: Number(r.totalCommissionAmount || 0),
          totalPremiumAmount: Number(r.totalPremiumAmount || 0),
          reportMonth: r.reportMonth,
          templateId: r.templateId ?? undefined,
          customerId: r.customerId ?? null,
          customerName: r.customerId ? (familyNameByCanon.get(canonId(r.customerId)) || '') : '',
        }));

        const total = rows.reduce((sum, r) => sum + r.commissionAmount, 0);
        setExternalRows(rows);
        setExternalTotal(Number(total.toFixed(2)));
      }
    } catch {
      addToast('error', 'כשל בטעינת פוליסות מטעינה');
    } finally {
      setLoadingExternal(false);
    }
  };

  // ── פילטר חברה ומיון לטבלת פוליסות מטעינה (client-side - הדאטה כבר נטענה) ──
  const [nifraimCompanyFilter, setNifraimCompanyFilter] = useState('');
  const [nifraimSort, setNifraimSort] = useState<{ key: 'customerName' | 'company' | null; dir: 'asc' | 'desc' }>({ key: null, dir: 'asc' });

  const handleNifraimSort = (key: 'customerName' | 'company') => {
    setNifraimSort(prev => prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'asc' });
  };

  // ── מיון לטבלת עסקאות Magic (client-side, אותו דפוס בדיוק) ──
  const [magicSort, setMagicSort] = useState<{ key: 'customerName' | 'company' | null; dir: 'asc' | 'desc' }>({ key: null, dir: 'asc' });

  const handleMagicSort = (key: 'customerName' | 'company') => {
    setMagicSort(prev => prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'asc' });
  };

  useEffect(() => {
    if (activeTab === 'nifraim') loadExternal();
  }, [activeTab, reportMonth, customer, includeFamily, familyMembers, nifraimFilterMode]);

  // ─── חיפוש בן משפחה להוספה ────────────────────────────────────────────────────
  // ⚠️ הגבלה: Firestore לא תומך בחיפוש "מכיל" חופשי על אוסף גדול בלי שירות חיפוש חיצוני
  // (כמו Algolia). זה חיפוש לפי prefix על שם פרטי/משפחה, ולפי ת"ז מדויקת (עם idVariants) -
  // לא "מכיל בכל מקום". מספיק טוב לרוב המקרים, אבל שם חלקי שלא מתחיל באות שהוקלדה לא יימצא.
  useEffect(() => {
    if (activeTab !== 'family' || !customer) { setFamilySearchResults([]); return; }
    const raw = familySearchQuery.trim();
    if (!raw) { setFamilySearchResults([]); return; }

    let cancelled = false;
    const t = setTimeout(async () => {
      setSearchingFamily(true);
      try {
        const digitsOnly = normIdDigits(raw);
        let docsRaw: any[] = [];

        if (digitsOnly.length >= 3) {
          // חיפוש לפי ת"ז - כל הפורמטים האפשריים (עם/בלי 0 מוביל)
          const variants = idVariants(digitsOnly);
          const q1 = query(
            collection(db, 'customer'),
            where('AgentId', '==', customer.AgentId),
            where('IDCustomer', 'in', variants.slice(0, 10)),
          );
          const snap1 = await getDocs(q1);
          docsRaw = snap1.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        } else {
          // חיפוש לפי prefix על שם פרטי ושם משפחה (שתי שאילתות, ממוזגות)
          const [snapFirst, snapLast] = await Promise.all([
            getDocs(query(
              collection(db, 'customer'),
              where('AgentId', '==', customer.AgentId),
              where('firstNameCustomer', '>=', raw),
              where('firstNameCustomer', '<=', raw + '\uf8ff'),
              limit(10),
            )),
            getDocs(query(
              collection(db, 'customer'),
              where('AgentId', '==', customer.AgentId),
              where('lastNameCustomer', '>=', raw),
              where('lastNameCustomer', '<=', raw + '\uf8ff'),
              limit(10),
            )),
          ]);
          const byId = new Map<string, any>();
          [...snapFirst.docs, ...snapLast.docs].forEach(d => byId.set(d.id, { id: d.id, ...(d.data() as any) }));
          docsRaw = Array.from(byId.values());
        }

        const existingMemberIds = new Set([customer.id, ...familyMembers.map(m => m.id)]);
        const results = docsRaw.filter(c => !existingMemberIds.has(c.id)).slice(0, 15);

        if (!cancelled) setFamilySearchResults(results as any);
      } catch {
        if (!cancelled) setFamilySearchResults([]);
      } finally {
        if (!cancelled) setSearchingFamily(false);
      }
    }, 350); // דיבאונס

    return () => { cancelled = true; clearTimeout(t); };
  }, [familySearchQuery, activeTab, customer, familyMembers]);

  // ─── הוספת בן משפחה נמצא לתא המשפחתי של הלקוח הנוכחי ──────────────────────────
  const addToFamily = async (candidate: FamilyMember) => {
    if (!customer) return;
    setAddingFamilyMemberId(candidate.id);
    try {
      // "הראשי" הנוכחי: אם ללקוח הזה אין עדיין תא משפחתי, הוא עצמו הופך לראשי;
      // אחרת - ה-parentID הקיים שלו.
      const mainId = customer.parentID || customer.id;

      // ולידציה: הראשי חייב להיות "עצמאי" (לא כבר ילד במשפחה אחרת) - זהה לבדיקה ב-FamilyLinkDialog.tsx
      const mainSnap = await getDoc(doc(db, 'customer', mainId));
      if (mainSnap.exists()) {
        const mainData = mainSnap.data() as any;
        if (mainData.parentID && mainData.parentID !== mainId) {
          addToast('error', `לא ניתן - ${mainData.firstNameCustomer} כבר חלק מחיבור משפחתי אחר`);
          return;
        }
      }

      // בדיקת קונפליקט: האם המועמד משמש כ"הורה" (ראשי) למשפחה אחרת כרגע
      const candidateSnap = await getDoc(doc(db, 'customer', candidate.id));
      if (candidateSnap.exists()) {
        const candidateData = candidateSnap.data() as any;
        const childCheckSnap = await getDocs(query(
          collection(db, 'customer'),
          where('AgentId', '==', candidateData.AgentId),
          where('parentID', '==', candidate.id),
        ));
        const otherChildren = childCheckSnap.docs.filter(d => d.id !== candidate.id);
        if (otherChildren.length > 0) {
          const confirmTransfer = confirm(
            `${candidateData.firstNameCustomer} כבר מקושר למשפחה אחרת כראשי (${otherChildren.length} בני משפחה). האם להעביר את כולם לתא המשפחתי הזה?`
          );
          if (!confirmTransfer) return;
          await Promise.all(otherChildren.map(d =>
            updateDoc(doc(db, 'customer', d.id), { parentID: mainId, lastUpdateDate: serverTimestamp() })
          ));
        }
      }

      // אם הלקוח הנוכחי עדיין לא היה בתא משפחתי (parentID עצמי/ריק) - הופך רשמית לראשי
      if (!customer.parentID || customer.parentID !== mainId) {
        await updateDoc(doc(db, 'customer', mainId), { parentID: mainId, lastUpdateDate: serverTimestamp() });
      }

      await updateDoc(doc(db, 'customer', candidate.id), { parentID: mainId, lastUpdateDate: serverTimestamp() });

      addToast('success', `${candidate.firstNameCustomer} ${candidate.lastNameCustomer} נוסף/ה לתא המשפחתי`);
      setFamilySearchQuery('');
      setFamilySearchResults([]);

      // רענון הנתונים המקומיים
      if (!customer.parentID || customer.parentID !== mainId) {
        setCustomer(prev => prev ? { ...prev, parentID: mainId } : prev);
      }
      await loadFamilyMembers();
    } catch {
      addToast('error', 'כשל בהוספת בן משפחה');
    } finally {
      setAddingFamilyMemberId(null);
    }
  };

  // ─── סיכומים ─────────────────────────────────────────────────────────────────
  const totalMagicHekef = useMemo(() => magicSales.reduce((a, r) => a + (r.commissionHekef || 0), 0), [magicSales]);

  const magicSalesSorted = useMemo(() => {
    if (!magicSort.key) return magicSales;
    const key = magicSort.key;
    const dirMul = magicSort.dir === 'asc' ? 1 : -1;
    return [...magicSales].sort((a, b) => {
      const av = (key === 'customerName' ? a.customerName : a.company) || '';
      const bv = (key === 'customerName' ? b.customerName : b.company) || '';
      return av.localeCompare(bv, 'he') * dirMul;
    });
  }, [magicSales, magicSort]);
  const delta = externalTotal - magicNifraim;

  // ─── פוליסות מטעינה — סינון + העשרה ─────────────────────────────────────────
  const nifraimWithGap = useMemo(() => {
    return externalRows
      .filter(ext => {
        if (!ext.templateId) return true;
        const template = templatesById[ext.templateId];
        if (!template) return true;
        const hekefType = String(template.hekefType ?? '').trim();
        return !hekefType;
      })
      .map(ext => {
        const magicMatch = magicSales.find(
          s => String(s.company || '').trim() === String(ext.company || '').trim() &&
               (!ext.product || String(s.product || '').trim() === String(ext.product || '').trim()),
        );
        const magicVal = magicMatch?.commissionNifraim ?? null;
        const gap = magicVal !== null ? ext.commissionAmount - magicVal : null;

        const template = ext.templateId ? templatesById[ext.templateId] : undefined;
        const resolved = resolveFromTemplate(template, ext.product);
        const displayProduct = resolved.canonicalProduct || ext.product || '—';

        return { ...ext, magicVal, gap, displayProduct };
      });
  }, [externalRows, magicSales, templatesById]);

  // רשימת חברות זמינות לפילטר - נגזרת מהדאטה שכבר נטענה, לא קריאה נוספת
  const nifraimCompanyOptions = useMemo(
    () => Array.from(new Set(externalRows.map(r => r.company).filter(Boolean))).sort(),
    [externalRows],
  );

  const nifraimFiltered = useMemo(() => {
    let rows = nifraimCompanyFilter
      ? nifraimWithGap.filter(r => r.company === nifraimCompanyFilter)
      : nifraimWithGap;

    if (nifraimSort.key) {
      const key = nifraimSort.key;
      const dirMul = nifraimSort.dir === 'asc' ? 1 : -1;
      rows = [...rows].sort((a, b) => {
        const av = (key === 'customerName' ? a.customerName : a.company) || '';
        const bv = (key === 'customerName' ? b.customerName : b.company) || '';
        return av.localeCompare(bv, 'he') * dirMul;
      });
    }

    return rows;
  }, [nifraimWithGap, nifraimCompanyFilter, nifraimSort]);

  // ── סיווג לקבוצת מוצר: פנסיה (1) / פיננסים (4) / סיכונים (כל השאר) - זהה להגדרה הקיימת
  // ב-PensionTab.tsx (excludeGroupIds=['1','4'] לטאב "סיכונים") ──
  type NifraimGroup = 'pension' | 'finance' | 'risk';
  const NIFRAIM_GROUP_LABEL: Record<NifraimGroup, string> = { pension: 'פנסיה', finance: 'פיננסים', risk: 'סיכונים' };

  const groupOfProduct = (productName?: string): NifraimGroup => {
    const gid = productToGroupMap?.[(productName || '').trim()] || '';
    if (gid === '1') return 'pension';
    if (gid === '4') return 'finance';
    return 'risk';
  };

  const [nifraimGroupFilter, setNifraimGroupFilter] = useState<NifraimGroup | null>(null);

  // סטטיסטיקות לשלושת הריבועים - תמיד מהדאטה המלאה (nifraimWithGap), לא מושפעות מפילטר החברה,
  // כך שהריבועים תמיד מציגים את התמונה המלאה ואפשר ללחוץ עליהם כדי לצמצם את הטבלה
  const nifraimGroupStats = useMemo(() => {
    const stats: Record<NifraimGroup, { count: number; total: number }> = {
      pension: { count: 0, total: 0 },
      finance: { count: 0, total: 0 },
      risk: { count: 0, total: 0 },
    };
    nifraimWithGap.forEach(r => {
      const g = groupOfProduct(r.displayProduct);
      stats[g].count += 1;
      stats[g].total += r.commissionAmount;
    });
    return stats;
  }, [nifraimWithGap, productToGroupMap]);

  const nifraimFilteredByGroup = useMemo(() => {
    if (!nifraimGroupFilter) return nifraimFiltered;
   return nifraimFiltered.filter(r => groupOfProduct(r.displayProduct) === nifraimGroupFilter);
  }, [nifraimFiltered, nifraimGroupFilter, productToGroupMap]);

  // ─── ניווט לדף השוואה מלאה ───────────────────────────────────────────────────
  const openFullCompare = () => {
    if (!customer) return;
    const p = new URLSearchParams({
      agentId: customer.AgentId,
      customerId: customer.IDCustomer,
      reportMonth,
      returnTo: `/customers/${customerId}`,
    });
    router.push(`/importCommissionHub/CompareRealToReported?${p.toString()}`);
  };

  // ─── UI ──────────────────────────────────────────────────────────────────────
  if (loadingCustomer) {
    return <div className="cp-loading">טוען נתוני לקוח...</div>;
  }

  if (!customer) {
    return (
      <div className="cp-loading">
        לקוח לא נמצא.{' '}
        <button onClick={() => router.back()}>חזרה</button>
      </div>
    );
  }

  const sourceName =
    (customer.sourceValue && sourceLeadMap[customer.sourceValue]) ||
    (customer.sourceLead && sourceLeadMap[customer.sourceLead]) ||
    '—';

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'tasks', label: 'משימות' },
    { key: 'meeting', label: 'תיאום פגישה' },
    { key: 'notes', label: 'הערות' },
    { key: 'magic', label: 'עסקאות Magic' },
    { key: 'nifraim', label: 'פוליסות מטעינה' },
    { key: 'family', label: 'קשרים משפחתיים' },
  ];

  // ── טוגל ריכוז תא משפחתי - זהה בשתי הלשוניות (עסקאות Magic + פוליסות מטעינה) ──
  const familyToggleBar = (
    <div className="cp-family-toggle-bar">
      <label className="cp-family-toggle">
        <input
          type="checkbox"
          checked={includeFamily}
          onChange={e => setIncludeFamily(e.target.checked)}
          disabled={!customer.parentID}
        />
        כולל תא משפחתי
        {includeFamily && familyMembers.length > 0 && ` (${familyMembers.length} בני משפחה)`}
      </label>
      {!customer.parentID && (
        <span className="cp-family-toggle-hint">ללקוח זה אין תא משפחתי מוגדר</span>
      )}
    </div>
  );

  return (
    <div className="cp-page" dir="rtl">
      {/* ── Back ── */}
      <button className="cp-back" onClick={() => router.back()}>
        ← חזרה לרשימת לקוחות
      </button>

      {/* ── Header card ── */}
      <div className="cp-header-card">
        <div className="cp-header-top">
          <div className="cp-avatar">
            {initials(
              isEditing ? (editData.firstNameCustomer ?? '') : customer.firstNameCustomer,
              isEditing ? (editData.lastNameCustomer ?? '') : customer.lastNameCustomer,
            )}
          </div>
          <div className="cp-name-block">
            {isEditing ? (
              <div className="cp-edit-name-row">
                <input
                  className="cp-edit-input"
                  value={editData.firstNameCustomer ?? ''}
                  onChange={e => setEditData(p => ({ ...p, firstNameCustomer: e.target.value }))}
                  placeholder="שם פרטי"
                />
                <input
                  className="cp-edit-input"
                  value={editData.lastNameCustomer ?? ''}
                  onChange={e => setEditData(p => ({ ...p, lastNameCustomer: e.target.value }))}
                  placeholder="שם משפחה"
                />
              </div>
            ) : (
              <div className="cp-fullname">
                {customer.firstNameCustomer} {customer.lastNameCustomer}
                {customer.customerTier && customer.customerTier !== 'standard' && (
                  <span className={`cp-tier-badge cp-tier-${customer.customerTier}`}>
                    {customer.customerTier === 'premium'
                      ? '♛ פרימיום'
                      : customer.customerTier === 'gold'
                      ? '★ זהב'
                      : '◆ כסף'}
                  </span>
                )}
              </div>
            )}
            <div className="cp-subline">
              {customer.phone && <span>{customer.phone}</span>}
              {customer.phone && customer.mail && <span> · </span>}
              {customer.mail && <span>{customer.mail}</span>}
            </div>
          </div>
          <div className="cp-header-actions">
            {isEditing ? (
              <>
                <button className="cp-btn-save" onClick={saveEdit} disabled={isSaving}>
                  {isSaving ? 'שומר...' : 'שמור'}
                </button>
                <button className="cp-btn-cancel" onClick={cancelEdit}>בטל</button>
              </>
            ) : (
              <button className="cp-btn-edit" onClick={startEdit}>✏ ערוך</button>
            )}
          </div>
        </div>

        <div className="cp-fields-grid">
          <div className="cp-field">
            <span className="cp-field-label">תעודת זהות</span>
            {isEditing ? (
              <input className="cp-edit-input-field" value={editData.IDCustomer ?? ''} onChange={e => setEditData(p => ({ ...p, IDCustomer: e.target.value }))} />
            ) : (
              <span className="cp-field-value">{customer.IDCustomer}</span>
            )}
          </div>
          <div className="cp-field">
            <span className="cp-field-label">תאריך לידה</span>
            {isEditing ? (
              <input type="date" className="cp-edit-input-field" value={editData.birthday ?? ''} onChange={e => setEditData(p => ({ ...p, birthday: e.target.value }))} />
            ) : (
              <span className="cp-field-value">{customer.birthday ? formatIsraeliDateOnly(customer.birthday) : '—'}</span>
            )}
          </div>
          <div className="cp-field">
            <span className="cp-field-label">גיל</span>
            <span className="cp-field-value">
              {(() => {
                const age = calculateAge(isEditing ? editData.birthday : customer.birthday);
                return age !== null ? age : '—';
              })()}
            </span>
          </div>
          <div className="cp-field">
            <span className="cp-field-label">סטטוס משפחתי</span>
            {isEditing ? (
              <select
                className="cp-edit-input-field"
                value={editData.familyStatus ?? ''}
                onChange={e => setEditData(p => ({ ...p, familyStatus: e.target.value }))}
              >
                <option value="">לא נבחר</option>
                <option value="רווק/ה">רווק/ה</option>
                <option value="נשוי/אה">נשוי/אה</option>
                <option value="גרוש/ה">גרוש/ה</option>
                <option value="אלמן/ה">אלמן/ה</option>
                <option value="ידוע/ה בציבור">ידוע/ה בציבור</option>
              </select>
            ) : (
              <span className="cp-field-value">{customer.familyStatus || '—'}</span>
            )}
          </div>
          <div className="cp-field">
  <span className="cp-field-label">תאריך הנפקת ת.ז</span>
  {isEditing ? (
    <input
      type="date"
      className="cp-edit-input-field"
      value={editData.issueDay ?? ''}
      onChange={e => setEditData(p => ({ ...p, issueDay: e.target.value }))}
    />
  ) : (
    <span className="cp-field-value">
      {customer.issueDay ? formatIsraeliDateOnly(customer.issueDay) : '—'}
    </span>
  )}
</div>
   <div className="cp-field">
            <span className="cp-field-label">מגדר</span>
            {isEditing ? (
              <select className="cp-edit-input-field" value={editData.gender ?? ''} onChange={e => setEditData(p => ({ ...p, gender: e.target.value }))}>
                <option value="">לא נבחר</option>
                <option value="זכר">זכר</option>
                <option value="נקבה">נקבה</option>
              </select>
            ) : (
              <span className="cp-field-value">{customer.gender || '—'}</span>
            )}
          </div>
          <div className="cp-field">
            <span className="cp-field-label">טלפון</span>
            {isEditing ? (
              <input className="cp-edit-input-field" value={editData.phone ?? ''} onChange={e => setEditData(p => ({ ...p, phone: e.target.value }))} />
            ) : (
              <span className="cp-field-value">{customer.phone || '—'}</span>
            )}
          </div>
          <div className="cp-field">
            <span className="cp-field-label">מייל</span>
            {isEditing ? (
              <input type="email" className="cp-edit-input-field" value={editData.mail ?? ''} onChange={e => setEditData(p => ({ ...p, mail: e.target.value }))} />
            ) : (
              <span className="cp-field-value">{customer.mail || '—'}</span>
            )}
          </div>
          <div className="cp-field">
            <span className="cp-field-label">כתובת</span>
            {isEditing ? (
              <input className="cp-edit-input-field" value={editData.address ?? ''} onChange={e => setEditData(p => ({ ...p, address: e.target.value }))} />
            ) : (
              <span className="cp-field-value">{customer.address || '—'}</span>
            )}
          </div>
          <div className="cp-field">
            <span className="cp-field-label">מקור ליד</span>
            <span className="cp-field-value">{sourceName}</span>
          </div>
          <div className="cp-field">
            <span className="cp-field-label">אחראי</span>
            {isEditing ? (
              <select
                className="cp-edit-input-field"
                value={editData.responsibleUserId ?? ''}
                onChange={e => setEditData(p => ({ ...p, responsibleUserId: e.target.value }))}
              >
                <option value="">בחר אחראי</option>
                {agentUsers.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.displayName || u.email}
                  </option>
                ))}
              </select>
            ) : (
              <span className="cp-field-value">{customer.responsibleUserName || '—'}</span>
            )}
          </div>
          <div className="cp-field cp-field-fill">
            <span className="cp-field-label">הערת רקע</span>
            {isEditing ? (
              <input
                className="cp-edit-input-field"
                placeholder="תזכורת קצרה על הלקוח..."
                value={editData.shortNote ?? ''}
                onChange={e => setEditData(p => ({ ...p, shortNote: e.target.value }))}
              />
            ) : (
              <span className="cp-field-value">{customer.shortNote || '—'}</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="cp-tabs">
        {tabs.map(t => (
          <button
            key={t.key}
            className={`cp-tab${activeTab === t.key ? ' cp-tab-active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="cp-tab-content">

        {/* ── עסקאות Magic ── */}
        {activeTab === 'magic' && (
          <div>
            {familyToggleBar}
            {loadingMagic ? (
              <div className="cp-loading-inline">טוען...</div>
            ) : magicSales.length === 0 ? (
              <div className="cp-empty">אין עסקאות פעילות ללקוח זה</div>
            ) : (
              <table className="cp-table">
                <thead>
                  <tr>
                    {includeFamily && (
                      <th className="cp-th-sortable" onClick={() => handleMagicSort('customerName')}>
                        לקוח {magicSort.key === 'customerName' ? (magicSort.dir === 'asc' ? '▲' : '▼') : ''}
                      </th>
                    )}
                    <th>מוצר</th>
                    <th className="cp-th-sortable" onClick={() => handleMagicSort('company')}>
                      חברה {magicSort.key === 'company' ? (magicSort.dir === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th>חודש תוקף</th>
                    <th>פרמיה</th>
                    <th>צבירה</th>
                    {canViewCommissions && <th>עמלת היקף</th>}
                    {canViewCommissions && <th>נפרעים</th>}
                  </tr>
                </thead>
                <tbody>
                  {magicSalesSorted.map((s, i) => (
                    <tr key={i}>
                      {includeFamily && <td>{s.customerName || '—'}</td>}
                      <td>{s.product}</td>
                      <td>{s.company}</td>
                      <td>{s.month ? formatIsraeliDateOnly(s.month) : '—'}</td>
                      <td>{s.sumPremia?.toLocaleString() ?? '—'}</td>
                      <td>{s.sumTzvira?.toLocaleString() ?? '—'}</td>
                      {canViewCommissions && <td>{s.commissionHekef?.toLocaleString()}</td>}
                      {canViewCommissions && <td>{s.commissionNifraim?.toLocaleString()}</td>}
                    </tr>
                  ))}
                </tbody>
                {canViewCommissions && (
                  <tfoot>
                    <tr>
                      <td colSpan={includeFamily ? 6 : 5} style={{ fontWeight: 'bold', textAlign: 'left' }}>
                        סה&quot;כ
                      </td>
                      <td style={{ fontWeight: 'bold' }}>{totalMagicHekef.toLocaleString()} ₪</td>
                      <td style={{ fontWeight: 'bold' }}>{magicNifraim.toLocaleString()} ₪</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </div>
        )}

        {/* ── פוליסות מטעינה ── */}
        {activeTab === 'nifraim' && (
          <div>
            {familyToggleBar}

            {/* ── 3 ריבועים קבועים לפי קבוצת מוצר - תמיד מוצגים, גם עם 0 ── */}
            <div className="cp-nifraim-group-cards">
              {(['pension', 'finance', 'risk'] as const).map(g => {
                const stat = nifraimGroupStats[g];
                const active = nifraimGroupFilter === g;
                return (
                  <div
                    key={g}
                    className={`cp-nifraim-group-card${active ? ' cp-nifraim-group-card-active' : ''}`}
                    onClick={() => setNifraimGroupFilter(prev => prev === g ? null : g)}
                    title="לחצי לסינון הטבלה לפי הקבוצה הזו"
                  >
                    <div className="cp-nifraim-group-label">{NIFRAIM_GROUP_LABEL[g]}</div>
                    <div className="cp-nifraim-group-count">{stat.count} פוליסות</div>
                    {canViewCommissions && (
                      <div className="cp-nifraim-group-total">{stat.total.toLocaleString()} ₪</div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="cp-month-bar">
              <div className="cp-nifraim-mode-toggle">
                <button
                  type="button"
                  className={`cp-mode-btn${nifraimFilterMode === 'report' ? ' cp-mode-btn-active' : ''}`}
                  onClick={() => setNifraimFilterMode('report')}
                >
                  לפי חודש דיווח
                </button>
                <button
                  type="button"
                  className={`cp-mode-btn${nifraimFilterMode === 'publish' ? ' cp-mode-btn-active' : ''}`}
                  onClick={() => setNifraimFilterMode('publish')}
                >
                  לפי חודש פרסום
                </button>
              </div>
              <span className="cp-month-bar-divider" />
              <label>{nifraimFilterMode === 'report' ? 'חודש דיווח:' : 'חודש פרסום:'}</label>
              <input
                type="month"
                value={reportMonth}
                onChange={e => setReportMonth(e.target.value)}
                className="cp-month-input"
              />
              <span className="cp-month-bar-divider" />
              <label>חברה:</label>
              <select
                className="cp-month-input"
                value={nifraimCompanyFilter}
                onChange={e => setNifraimCompanyFilter(e.target.value)}
              >
                <option value="">הכל</option>
                {nifraimCompanyOptions.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            {loadingExternal ? (
              <div className="cp-loading-inline">טוען...</div>
            ) : nifraimFilteredByGroup.length === 0 ? (
              <div className="cp-empty">אין נתוני פוליסות לחודש זה</div>
            ) : (
              <table className="cp-table">
                <thead>
                  <tr>
                    {includeFamily && (
                      <th className="cp-th-sortable" onClick={() => handleNifraimSort('customerName')}>
                        לקוח {nifraimSort.key === 'customerName' ? (nifraimSort.dir === 'asc' ? '▲' : '▼') : ''}
                      </th>
                    )}
                    <th className="cp-th-sortable" onClick={() => handleNifraimSort('company')}>
                      חברה {nifraimSort.key === 'company' ? (nifraimSort.dir === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th>מוצר</th>
                    <th>מספר פוליסה</th>
                    <th>פרמיה / צבירה</th>
                    {canViewCommissions && <th>עמלה</th>}
                  </tr>
                </thead>
                <tbody>
                  {nifraimFilteredByGroup.map((r, i) => (
                    <tr key={i}>
                      {includeFamily && <td>{r.customerName || '—'}</td>}
                      <td>{r.company}</td>
                      <td>{r.displayProduct}</td>
                      <td>{r.policyNumber || '—'}</td>
                      <td>
                        {r.totalPremiumAmount
                          ? r.totalPremiumAmount.toLocaleString()
                          : '—'}
                      </td>
                      {canViewCommissions && (
                        <td>{r.commissionAmount.toLocaleString()} ₪</td>
                      )}
                    </tr>
                  ))}
                </tbody>
                {canViewCommissions && (
                  <tfoot>
                    <tr>
                      <td colSpan={includeFamily ? 5 : 4} style={{ fontWeight: 'bold', textAlign: 'left' }}>
                        סה&quot;כ עמלות{(nifraimCompanyFilter || nifraimGroupFilter) ? ' (מסונן)' : ''}
                      </td>
                      <td style={{ fontWeight: 'bold' }}>
                        {nifraimFilteredByGroup.reduce((s, r) => s + r.commissionAmount, 0).toLocaleString()} ₪
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </div>
        )}

        {/* ── קשרים משפחתיים ── */}
        {activeTab === 'family' && (
          <div>
            {/* ── חיפוש והוספת בן משפחה ── */}
            <div className="cp-family-search">
              <input
                type="text"
                className="cp-family-search-input"
                placeholder="חפש לקוח לפי שם או ת&quot;ז כדי להוסיף לתא המשפחתי..."
                value={familySearchQuery}
                onChange={e => setFamilySearchQuery(e.target.value)}
              />
              {searchingFamily && <div className="cp-loading-inline">מחפש...</div>}
              {!searchingFamily && familySearchQuery.trim() && familySearchResults.length === 0 && (
                <div className="cp-empty cp-family-search-empty">לא נמצאו התאמות</div>
              )}
              {familySearchResults.length > 0 && (
                <div className="cp-family-search-results">
                  {familySearchResults.map(c => (
                    <div key={c.id} className="cp-family-search-row">
                      <div className="cp-fmember-info">
                        <span className="cp-fmember-name">{c.firstNameCustomer} {c.lastNameCustomer}</span>
                        <span className="cp-fmember-sub">ת&quot;ז {c.IDCustomer}</span>
                      </div>
                      <Button
                        onClick={() => addToFamily(c)}
                        text={addingFamilyMemberId === c.id ? 'מוסיף...' : 'הוסף לתא המשפחתי'}
                        type="primary"
                        icon="off"
                        state={addingFamilyMemberId ? 'disabled' : 'default'}
                        disabled={!!addingFamilyMemberId}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {loadingFamily ? (
              <div className="cp-loading-inline">טוען...</div>
            ) : familyMembers.length === 0 ? (
              <div className="cp-empty">לא הוגדר תא משפחתי</div>
            ) : (
              <div className="cp-family-list">
                {familyMembers.map(m => {
                  const isMain = m.parentID === m.id;
                  const isCurrent = m.id === customerId;
                  return (
                    <div
                      key={m.id}
                      className={`cp-family-row${isCurrent ? ' cp-family-row-current' : ''}`}
                      onClick={() => !isCurrent && router.push(`/customers/${m.id}`)}
                      style={{ cursor: isCurrent ? 'default' : 'pointer' }}
                    >
                      <div className="cp-fav">
                        {initials(m.firstNameCustomer, m.lastNameCustomer)}
                      </div>
                      <div className="cp-fmember-info">
                        <span className="cp-fmember-name">
                          {m.firstNameCustomer} {m.lastNameCustomer}
                          {isMain && <span className="cp-chip-main">ראשי</span>}
                          {isCurrent && <span className="cp-chip-current">נוכחי</span>}
                        </span>
                        <span className="cp-fmember-sub">ת&quot;ז {m.IDCustomer}</span>
                      </div>
                      {!isCurrent && <span className="cp-family-arrow">←</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── הערות ── */}
        {activeTab === 'notes' && (
          <CustomerNotes customerId={customerId} agentId={customer.AgentId} />
        )}

        {/* ── משימות ── */}
        {activeTab === 'tasks' && (
          <CustomerTasks customerId={customerId} agentId={customer.AgentId} />
        )}

        {/* ── תיאום פגישה ── */}
        {activeTab === 'meeting' && (
          <CustomerMeetingFlow customerId={customerId} agentId={customer.AgentId} />
        )}

      </div>

      {/* ── Toasts ── */}
      {toasts.map(t => (
        <ToastNotification
          key={t.id}
          type={t.type}
          message={t.message}
          className={t.isHiding ? 'hide' : ''}
          onClose={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
        />
      ))}
    </div>
  );
}
