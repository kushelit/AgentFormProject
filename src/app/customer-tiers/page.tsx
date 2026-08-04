'use client';

import { useEffect, useState, useMemo } from 'react';
import { httpsCallable } from 'firebase/functions';
import {
  collection, query, where, getDocs, orderBy, limit,
  doc, getDoc, setDoc, updateDoc, writeBatch, serverTimestamp,
} from 'firebase/firestore';
import { db, functions } from '@/lib/firebase/firebase';
import { useRouter } from 'next/navigation';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import { useAuth } from '@/lib/firebase/AuthContext';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/useToast';
import { ToastNotification } from '@/components/ToastNotification';
import TableFooter from '@/components/TableFooter/TableFooter';
import './CustomerTiers.css';

type Tier = 'premium' | 'gold' | 'silver' | 'standard';
type SortColumn = 'customerName' | 'IDCustomer' | 'nifraimAmount' | 'currentTier' | 'proposedTier';
type SortOrder = 'asc' | 'desc';

interface TierFamilyMember {
  customerId: string;
  customerName: string;
  IDCustomer: string;
  currentTier: Tier;
  responsibleUserId: string | null;
  responsibleUserName: string | null;
}

interface TierRow {
  customerId: string;   // המבוטח הראשי (או היחיד)
  customerName: string;
  IDCustomer: string;
  familySize: number;
  nifraimAmount: number;
  currentTier: Tier;
  proposedTier: Tier;
  changed: boolean;
  responsibleUserId: string | null;
  responsibleUserName: string | null;
  members: TierFamilyMember[];
}

interface CalcResult {
  month: string;
  thresholds: { premium: number; gold: number; silver: number };
  totalCustomers: number; // לקוחות ייחודיים (אחרי דה-דופ)
  totalFamilies: number;  // שורות בפועל (משפחות + יחידים)
  changedCount: number;
  rows: TierRow[];
}

interface ResponsibleOption {
  id: string;
  name: string;
}

interface TierThresholds {
  premium: number;
  gold: number;
  silver: number;
}

const TIER_LABEL: Record<Tier, string> = {
  premium: 'פרימיום',
  gold: 'זהב',
  silver: 'כסף',
  standard: 'רגיל',
};

const TIER_CLASS: Record<Tier, string> = {
  premium: 'ct-tier-premium',
  gold: 'ct-tier-gold',
  silver: 'ct-tier-silver',
  standard: 'ct-tier-standard',
};

const TIER_ORDER: Tier[] = ['premium', 'gold', 'silver', 'standard'];

function prevMonth() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// ── זיהוי רשומות כפולות לפי ת"ז (עם/בלי 0 מוביל) - זהה ל-idVariants ב-NewCustomer.tsx ──
const normIdDigits = (v: any) => String(v ?? '').trim().replace(/\D/g, '');
const pad9 = (v: string) => v.padStart(9, '0');
const stripLeadingZeros = (v: string) => v.replace(/^0+/, '');
const idVariants = (v: any): string[] => {
  const d = normIdDigits(v);
  if (!d) return [];
  return Array.from(new Set([d, pad9(d), stripLeadingZeros(d)].filter(Boolean)));
};

export default function CustomerTiersPage() {
  const { agents, selectedAgentId, handleAgentChange } = useFetchAgentData();
  const { detail } = useAuth();
  const { canAccess: canAccessCustomerTiers } = usePermission('access_customer_tiers');
  const { toasts, addToast, setToasts } = useToast();
  const router = useRouter();

  const [month, setMonth] = useState(prevMonth());
  const [lastCalculated, setLastCalculated] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CalcResult | null>(null);

  // ── הגדרות סף דירוג (silver/gold/premium) — נטען/נשמר ב-tierThresholds/{agentId}, נופל ל-tierThresholds/default ──
  const [showThresholdSettings, setShowThresholdSettings] = useState(false);
  const [thresholdsLoading, setThresholdsLoading] = useState(false);
  const [thresholdsSaving, setThresholdsSaving] = useState(false);
  const [thresholdsSource, setThresholdsSource] = useState<'agent' | 'default' | null>(null);
  const [thresholdsDraft, setThresholdsDraft] = useState<{ premium: string; gold: string; silver: string }>({
    premium: '', gold: '', silver: '',
  });

  // ── סימון שורות: ברירת המחדל היא שכל שורה שמוצגת (לפי הסינון הפעיל) מסומנת אוטומטית — "מה שמסננים = מה שמסומן".
  // "overrides" שומר רק חריגות ידניות (שורה שספציפית סומנה/בוטלה ידנית) — כך שסינון לא "שוכח" בחירות,
  // אבל גם לא מוחק ביטולים ידניים כשעוברים בין סינונים. מתאפס עם כל חישוב חדש. ──
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const isRowSelected = (r: TierRow) => {
    const o = overrides[r.customerId];
    return o !== undefined ? o : true;
  };

  const [showAll, setShowAll] = useState(false);
  const [applying, setApplying] = useState(false);

  // ── סינון ──
  const [nameFilter, setNameFilter] = useState('');
  const [idFilter, setIdFilter] = useState('');
  const [currentTierFilter, setCurrentTierFilter] = useState('');
  const [proposedTierFilter, setProposedTierFilter] = useState('');
  const [responsibleFilter, setResponsibleFilter] = useState('');

  // ── מיון ──
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  // ── pagination ──
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  // ── אחראי לקוח ──
  const [responsibleList, setResponsibleList] = useState<ResponsibleOption[]>([]);
  const [responsibleByCustomer, setResponsibleByCustomer] = useState<Record<string, string>>({});
  const [savingResponsibleFor, setSavingResponsibleFor] = useState<string | null>(null);
  const [bulkResponsibleValue, setBulkResponsibleValue] = useState('');
  const [bulkAssigning, setBulkAssigning] = useState(false);

  // ── הרחבת תא משפחתי (הצגת בני המשפחה) ──
  const [expandedFamilyId, setExpandedFamilyId] = useState<string | null>(null);

  useEffect(() => {
    setShowThresholdSettings(false);
    setThresholdsSource(null);
  }, [selectedAgentId]);

  useEffect(() => {
    if (!selectedAgentId) return;
    const load = async () => {
      try {
        const q = query(
          collection(db, 'tierCalcRuns'),
          where('agentId', '==', selectedAgentId),
          orderBy('runAt', 'desc'),
          limit(1)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const last = snap.docs[0].data() as any;
          setLastCalculated(last.month);
          setMonth(last.month);
        } else {
          setLastCalculated(null);
        }
      } catch (err) {
        // אם אין index עדיין, ממשיכים עם ברירת המחדל
      }
    };
    load();
  }, [selectedAgentId]);

  // טעינת רשימת האחראים האפשריים (זהה ל-agentUsers ב-MeetingsDashboard.tsx)
  useEffect(() => {
    const fetchResponsibleList = async () => {
      if (!selectedAgentId) { setResponsibleList([]); return; }
      try {
        const q = query(
          collection(db, 'users'),
          where('agentId', '==', selectedAgentId),
          where('isActive', '==', true),
        );
        const snap = await getDocs(q);
        const data = snap.docs.map((d) => {
          const u = d.data() as any;
          return { id: d.id, name: u.name || u.displayName || u.email || '' };
        });
        setResponsibleList(data);
      } catch (err) {
        setResponsibleList([]);
      }
    };
    fetchResponsibleList();
  }, [selectedAgentId]);

  // ── טעינת הגדרות הסף לסוכן הנוכחי (agent-specific, ואם אין - default) ──
  const loadThresholdSettings = async () => {
    if (!selectedAgentId) return;
    setThresholdsLoading(true);
    try {
      const agentSnap = await getDoc(doc(db, 'tierThresholds', selectedAgentId));
      const snap = agentSnap.exists() ? agentSnap : await getDoc(doc(db, 'tierThresholds', 'default'));
      const source: 'agent' | 'default' = agentSnap.exists() ? 'agent' : 'default';
      if (snap.exists()) {
        const t = snap.data() as TierThresholds;
        setThresholdsDraft({
          premium: String(t.premium ?? ''),
          gold: String(t.gold ?? ''),
          silver: String(t.silver ?? ''),
        });
        setThresholdsSource(source);
      } else {
        setThresholdsDraft({ premium: '', gold: '', silver: '' });
        setThresholdsSource(null);
      }
    } catch (e: any) {
      addToast('error', 'כשל בטעינת הגדרות הדירוג: ' + ((e && e.message) || ''));
    } finally {
      setThresholdsLoading(false);
    }
  };

  const toggleThresholdSettings = () => {
    const next = !showThresholdSettings;
    setShowThresholdSettings(next);
    if (next) loadThresholdSettings();
  };

  const saveThresholdSettings = async () => {
    if (!selectedAgentId) return;

    const premium = Number(thresholdsDraft.premium);
    const gold = Number(thresholdsDraft.gold);
    const silver = Number(thresholdsDraft.silver);

    if ([premium, gold, silver].some((n) => Number.isNaN(n) || n < 0)) {
      addToast('error', 'יש להזין ערכים מספריים תקינים (0 ומעלה) לכל שדה');
      return;
    }
    if (!(silver < gold && gold < premium)) {
      addToast('error', 'הסדר חייב להיות עולה: סף כסף < סף זהב < סף פרימיום');
      return;
    }

    setThresholdsSaving(true);
    try {
      await setDoc(doc(db, 'tierThresholds', selectedAgentId), { premium, gold, silver }, { merge: true });
      setThresholdsSource('agent');
      addToast('success', 'הגדרות הדירוג נשמרו — יש להריץ חישוב מחדש כדי שהן ישפיעו על התוצאות');
    } catch (e: any) {
      addToast('error', 'כשל בשמירת הגדרות הדירוג: ' + ((e && e.message) || ''));
    } finally {
      setThresholdsSaving(false);
    }
  };

  const runCalculation = async () => {
    if (!selectedAgentId) { addToast('error', 'בחר סוכן'); return; }
    if (!month) { addToast('error', 'בחר חודש לחישוב'); return; }

    setLoading(true);
    setResult(null);
    setOverrides({});
    setCurrentPage(1);
    setNameFilter('');
    setIdFilter('');
    setCurrentTierFilter('');
    setProposedTierFilter('');
    setResponsibleFilter('');
    setExpandedFamilyId(null);

    try {
      const fn = httpsCallable(functions, 'calculateCustomerTiers');
      const res: any = await fn({ agentId: selectedAgentId, month: month });
      const data = res.data as CalcResult;
      setResult(data);

      const initialResponsible: Record<string, string> = {};
      data.rows.forEach(function (r) {
        if (r.responsibleUserId) initialResponsible[r.customerId] = r.responsibleUserId;
      });
      setResponsibleByCustomer(initialResponsible);
      setShowAll(false);

      if (data.changedCount === 0) {
        addToast('success', 'החישוב בוצע — אין שינויים מהדירוג הקיים');
      }
    } catch (e: any) {
      addToast('error', (e && e.message) || 'כשל בחישוב הדירוג');
    } finally {
      setLoading(false);
    }
  };

  // ── שורות אחרי "שינויים בלבד / הכל" ──
  const baseRows = useMemo(() => {
    if (!result) return [];
    return showAll ? result.rows : result.rows.filter(function (r) { return r.changed; });
  }, [result, showAll]);

  // ── שורות אחרי סינון - שם/ת"ז מתאימים גם אם ההתאמה היא לבן משפחה שאינו הראשי ──
  const filteredRows = useMemo(() => {
    const nameQ = nameFilter.toLowerCase().trim();
    const idQ = idFilter.trim();
    return baseRows.filter((r) => {
      const nameOk = !nameQ
        || r.customerName.toLowerCase().includes(nameQ)
        || r.members.some((m) => m.customerName.toLowerCase().includes(nameQ));
      const idOk = !idQ
        || r.IDCustomer.includes(idQ)
        || r.members.some((m) => m.IDCustomer.includes(idQ));
      const currOk = !currentTierFilter || r.currentTier === currentTierFilter;
      const propOk = !proposedTierFilter || r.proposedTier === proposedTierFilter;
      const respOk = !responsibleFilter
        || (responsibleFilter === '__none__' ? !r.responsibleUserId : r.responsibleUserId === responsibleFilter);
      return nameOk && idOk && currOk && propOk && respOk;
    });
  }, [baseRows, nameFilter, idFilter, currentTierFilter, proposedTierFilter, responsibleFilter]);

  // ── מיון ──
  const sortedRows = useMemo(() => {
    if (!sortColumn) return filteredRows;
    const arr = [...filteredRows];
    arr.sort((a, b) => {
      let av: string | number = a[sortColumn];
      let bv: string | number = b[sortColumn];
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av < bv) return sortOrder === 'asc' ? -1 : 1;
      if (av > bv) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filteredRows, sortColumn, sortOrder]);

  // ── שורות מסומנות מתוך מה שמוצג כרגע (לפי הסינון הפעיל) — זה הבסיס הן לספירה והן לפעולות אישור/שיבוץ ──
  const selectedVisibleRows = useMemo(
    () => sortedRows.filter((r) => isRowSelected(r)),
    [sortedRows, overrides],
  );

  const applyChanges = async () => {
    if (!result || !selectedAgentId) return;

    const approvedRows = selectedVisibleRows.map(function (r) {
      return { customerId: r.customerId, proposedTier: r.proposedTier, nifraimAmount: r.nifraimAmount };
    });

    if (approvedRows.length === 0) { addToast('error', 'לא נבחרו שורות לאישור'); return; }

    setApplying(true);
    try {
      const fn = httpsCallable(functions, 'applyCustomerTiers');
      const res: any = await fn({ agentId: selectedAgentId, month: result.month, approvedRows: approvedRows });
      addToast('success', 'עודכנו ' + res.data.updated + ' רשומות לקוח בהצלחה');
      setLastCalculated(result.month);
      setResult(null);
      setOverrides({});
    } catch (e: any) {
      addToast('error', (e && e.message) || 'כשל בעדכון הדירוג');
    } finally {
      setApplying(false);
    }
  };

  // מוצא את כל ה-doc id-ים (כולל כפילויות עם/בלי 0 מוביל) עבור ת"ז נתונה
  const findDuplicateIds = async (IDCustomer: string): Promise<string[]> => {
    const variants = idVariants(IDCustomer);
    if (!variants.length || !selectedAgentId) return [];
    const dupQuery = query(
      collection(db, 'customer'),
      where('AgentId', '==', selectedAgentId),
      where('IDCustomer', 'in', variants.slice(0, 10)),
    );
    const dupSnap = await getDocs(dupQuery);
    return dupSnap.docs.map((d) => d.id);
  };

  // מרחיב שורה (משפחה) לכל ה-doc id-ים שבאמת צריכים להתעדכן: כל בני המשפחה,
  // ולכל אחד מהם - גם הרשומות הכפולות שלו (אותה ת"ז מנורמלת בפורמט אחר).
  const expandRowToAllCustomerIds = async (row: TierRow): Promise<string[]> => {
    const idSet = new Set<string>();
    await Promise.all(row.members.map(async (m) => {
      idSet.add(m.customerId);
      const dupIds = await findDuplicateIds(m.IDCustomer);
      dupIds.forEach((id) => idSet.add(id));
    }));
    return Array.from(idSet);
  };

  // שיבוץ/שינוי אחראי לשורה (משפחה) - מסתנכרן לכל בני המשפחה ולרשומות הכפולות של כל אחד מהם
  const handleResponsibleChange = async (row: TierRow, value: string) => {
    const prev = responsibleByCustomer[row.customerId] || '';
    setResponsibleByCustomer((p) => ({ ...p, [row.customerId]: value }));
    setSavingResponsibleFor(row.customerId);
    try {
      const chosen = responsibleList.find((o) => o.id === value);
      const updatePayload = {
        responsibleUserId: value || null,
        responsibleUserName: chosen ? chosen.name : null,
        lastUpdateDate: serverTimestamp(),
      };

      const targetIds = await expandRowToAllCustomerIds(row);

      if (targetIds.length === 1) {
        await updateDoc(doc(db, 'customer', targetIds[0]), updatePayload);
      } else {
        const batch = writeBatch(db);
        targetIds.forEach((id) => batch.update(doc(db, 'customer', id), updatePayload));
        await batch.commit();
      }
    } catch (e: any) {
      setResponsibleByCustomer((p) => ({ ...p, [row.customerId]: prev }));
      addToast('error', 'כשל בעדכון אחראי: ' + ((e && e.message) || ''));
    } finally {
      setSavingResponsibleFor(null);
    }
  };

  // שיבוץ אחראי מרובה - לכל השורות המסומנות המוצגות כרגע (לפי הסינון הפעיל),
  // כולל כל בני המשפחה של כל שורה והכפילויות של כל אחד מהם
  const handleBulkAssignResponsible = async () => {
    if (!result || !selectedAgentId) return;
    const targetRows = selectedVisibleRows;
    if (targetRows.length === 0) { addToast('error', 'לא נבחרו שורות לשיבוץ'); return; }

    setBulkAssigning(true);
    try {
      const chosen = responsibleList.find((o) => o.id === bulkResponsibleValue);
      const updatePayload = {
        responsibleUserId: bulkResponsibleValue || null,
        responsibleUserName: chosen ? chosen.name : null,
        lastUpdateDate: serverTimestamp(),
      };

      const allTargetIds = new Set<string>();
      await Promise.all(targetRows.map(async (row) => {
        const ids = await expandRowToAllCustomerIds(row);
        ids.forEach((id) => allTargetIds.add(id));
      }));

      const idsArray = Array.from(allTargetIds);
      const batchSize = 400;
      for (let i = 0; i < idsArray.length; i += batchSize) {
        const chunk = idsArray.slice(i, i + batchSize);
        const batch = writeBatch(db);
        chunk.forEach((id) => batch.update(doc(db, 'customer', id), updatePayload));
        await batch.commit();
      }

      setResponsibleByCustomer((prev) => {
        const next = { ...prev };
        targetRows.forEach((r) => { next[r.customerId] = bulkResponsibleValue; });
        return next;
      });

      addToast('success', `שובצו ${targetRows.length} שורות (${idsArray.length} רשומות בפועל, כולל בני משפחה וכפילויות)`);
    } catch (e: any) {
      addToast('error', 'כשל בשיבוץ מרובה: ' + ((e && e.message) || ''));
    } finally {
      setBulkAssigning(false);
    }
  };

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortOrder('asc');
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [nameFilter, idFilter, currentTierFilter, proposedTierFilter, responsibleFilter, showAll]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / rowsPerPage));
  const indexOfLastRow = currentPage * rowsPerPage;
  const indexOfFirstRow = indexOfLastRow - rowsPerPage;
  const currentRows = sortedRows.slice(indexOfFirstRow, indexOfLastRow);

  const toggleRow = (r: TierRow) => {
    setOverrides((prev) => ({ ...prev, [r.customerId]: !isRowSelected(r) }));
  };

  // ── "בחר/בטל הכל" פועל רק על מה שמוצג כרגע (לפי הסינון הפעיל) ──
  const toggleAllFiltered = (checked: boolean) => {
    setOverrides((prev) => {
      const next = { ...prev };
      sortedRows.forEach(function (r) { next[r.customerId] = checked; });
      return next;
    });
  };

  const selectedCount = selectedVisibleRows.length;
  const allFilteredSelected = sortedRows.length > 0 && sortedRows.every((r) => isRowSelected(r));

  const sortArrow = (col: SortColumn) => {
    if (sortColumn !== col) return '';
    return sortOrder === 'asc' ? ' ▲' : ' ▼';
  };

  // ── טבלת ריכוז לפי דירוג נוכחי - נספר ברמת לקוח בודד (לא ברמת שורה/משפחה) ──
  const tierCounts = useMemo(() => {
    const counts: Record<Tier, number> = { premium: 0, gold: 0, silver: 0, standard: 0 };
    if (!result) return counts;
    result.rows.forEach((r) => {
      r.members.forEach((m) => {
        counts[m.currentTier] = (counts[m.currentTier] || 0) + 1;
      });
    });
    return counts;
  }, [result]);

  const goToCustomer = (customerId: string) => {
    router.push(`/customers/${customerId}`);
  };

  if (!canAccessCustomerTiers) {
    return (
      <div className="ct-page" dir="rtl">
        <div className="ct-empty">אין לך הרשאה לצפות בדף זה</div>
      </div>
    );
  }

  return (
    <div className="ct-page" dir="rtl">
      <div className="ct-header">
        <div>
          <div className="ct-title">חישוב דירוג לקוחות</div>
          <div className="ct-subtitle">
            {lastCalculated ? ('חודש אחרון שחושב: ' + lastCalculated) : 'לא בוצע חישוב עדיין לסוכן זה'}
          </div>
        </div>
        <button className="ct-btn-secondary" onClick={toggleThresholdSettings} disabled={!selectedAgentId}>
          ⚙ הגדרות דירוג
        </button>
      </div>

      {showThresholdSettings && (
        <div className="ct-threshold-panel">
          {thresholdsLoading ? (
            <div className="ct-threshold-loading">טוען הגדרות...</div>
          ) : (
            <>
              <div className="ct-threshold-header">
                <span className="ct-threshold-title">סף דירוג לקוחות (נפרעים משוקלל למשפחה, ₪)</span>
                {thresholdsSource === 'default' && (
                  <span className="ct-threshold-badge">
                    מוצגת כרגע ברירת המחדל הכללית — טרם הוגדר סף ייעודי לסוכן זה
                  </span>
                )}
              </div>
              <div className="ct-threshold-fields">
                <div className="ct-field">
                  <label className="ct-label">סף כסף</label>
                  <input
                    type="number"
                    className="input"
                    value={thresholdsDraft.silver}
                    onChange={(e) => setThresholdsDraft((p) => ({ ...p, silver: e.target.value }))}
                  />
                </div>
                <div className="ct-field">
                  <label className="ct-label">סף זהב</label>
                  <input
                    type="number"
                    className="input"
                    value={thresholdsDraft.gold}
                    onChange={(e) => setThresholdsDraft((p) => ({ ...p, gold: e.target.value }))}
                  />
                </div>
                <div className="ct-field">
                  <label className="ct-label">סף פרימיום</label>
                  <input
                    type="number"
                    className="input"
                    value={thresholdsDraft.premium}
                    onChange={(e) => setThresholdsDraft((p) => ({ ...p, premium: e.target.value }))}
                  />
                </div>
              </div>
              <div className="ct-threshold-actions">
                <button className="ct-btn-calc" onClick={saveThresholdSettings} disabled={thresholdsSaving}>
                  {thresholdsSaving ? 'שומר...' : 'שמור הגדרות'}
                </button>
                <button className="ct-btn-secondary" onClick={() => setShowThresholdSettings(false)}>
                  סגור
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="ct-controls">
        {detail && detail.role === 'admin' ? (
          <div className="ct-field">
            <label className="ct-label">סוכן</label>
            <select className="select-input" value={selectedAgentId} onChange={handleAgentChange}>
              <option value="">בחר סוכן</option>
              {agents.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
            </select>
          </div>
        ) : null}

        <div className="ct-field">
          <label className="ct-label">חודש לחישוב</label>
          <input type="month" className="input" value={month} onChange={function (e) { setMonth(e.target.value); }} />
        </div>

        <button className="ct-btn-calc" onClick={runCalculation} disabled={loading || !selectedAgentId}>
          {loading ? 'מחשב...' : 'חשב דירוג מטעינה'}
        </button>
      </div>

      {result ? (
        <div className="ct-results">
          {/* ── טבלת ריכוז לפי דירוג נוכחי (לפי לקוחות בודדים) ── */}
          <div className="ct-tier-summary">
            {TIER_ORDER.map((tier) => (
              <div
                key={tier}
                className={
                  'ct-tier-summary-card ' + TIER_CLASS[tier] +
                  (currentTierFilter === tier ? ' ct-tier-summary-active' : '')
                }
                onClick={() => {
                  setCurrentTierFilter((prev) => (prev === tier ? '' : tier));
                  setShowAll(true);
                }}
                title="לחצו לסינון הרשימה לפי דירוג זה"
              >
                <div className="ct-tier-summary-count">{tierCounts[tier]}</div>
                <div className="ct-tier-summary-label">{TIER_LABEL[tier]}</div>
              </div>
            ))}
          </div>

          <div className="ct-results-bar">
            <div className="ct-results-summary">
              <span>{result.totalCustomers} לקוחות נבדקו</span>
              <span className="ct-dot">·</span>
              <span>{result.totalFamilies} שורות (משפחות/יחידים)</span>
              <span className="ct-dot">·</span>
              <span className={result.changedCount > 0 ? 'ct-changed-count' : ''}>
                {result.changedCount} שינויים מהדירוג הקיים
              </span>
              <span className="ct-dot">·</span>
              <span>{sortedRows.length} מוצגים</span>
            </div>
            <label className="ct-show-all-toggle">
              <input type="checkbox" checked={showAll} onChange={function (e) { setShowAll(e.target.checked); }} />
              הצג את כל הלקוחות (גם ללא שינוי)
            </label>
          </div>

          {/* ── שורת סינון - זהה במבנה ל-NewCustomer.tsx ── */}
          <div className="filter-inputs-container">
            <div className="filter-select-container">
              <input className="filter-input" type="text" placeholder="שם לקוח (כולל בני משפחה)" value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} />
            </div>
            <div className="filter-select-container">
              <input className="filter-input" type="text" placeholder="תז לקוח (כולל בני משפחה)" value={idFilter} onChange={(e) => setIdFilter(e.target.value)} />
            </div>
            <div className="filter-select-container">
              <select className="select-input" value={currentTierFilter} onChange={(e) => setCurrentTierFilter(e.target.value)}>
                <option value="">דירוג קיים — הכל</option>
                <option value="premium">פרימיום</option>
                <option value="gold">זהב</option>
                <option value="silver">כסף</option>
                <option value="standard">רגיל</option>
              </select>
            </div>
            <div className="filter-select-container">
              <select className="select-input" value={proposedTierFilter} onChange={(e) => setProposedTierFilter(e.target.value)}>
                <option value="">דירוג מוצע — הכל</option>
                <option value="premium">פרימיום</option>
                <option value="gold">זהב</option>
                <option value="silver">כסף</option>
                <option value="standard">רגיל</option>
              </select>
            </div>
            <div className="filter-select-container">
              <select className="select-input" value={responsibleFilter} onChange={(e) => setResponsibleFilter(e.target.value)}>
                <option value="">אחראי — הכל</option>
                <option value="__none__">לא שובץ</option>
                {responsibleList.map((opt) => (<option key={opt.id} value={opt.id}>{opt.name}</option>))}
              </select>
            </div>
          </div>

          {/* ── שורת פעולה מאוחדת: שיבוץ אחראי + אישור דירוג, שני הכפתורים יחד למעלה ── */}
          {sortedRows.length > 0 && (
            <div className="ct-action-bar">
              <span className="ct-action-count">
                {selectedCount} שורות מסומנות (מתוך המוצג לפי הסינון הנוכחי)
              </span>
              <div className="ct-action-buttons">
                <button className="ct-btn-secondary" onClick={() => toggleAllFiltered(!allFilteredSelected)}>
                  {allFilteredSelected ? 'נקה בחירה' : 'בחר הכל'}
                </button>
                <div className="ct-bulk-action">
                  <select
                    className="select-input"
                    value={bulkResponsibleValue}
                    onChange={(e) => setBulkResponsibleValue(e.target.value)}
                  >
                    <option value="">לא שובץ</option>
                    {responsibleList.map((opt) => (<option key={opt.id} value={opt.id}>{opt.name}</option>))}
                  </select>
                  <button className="ct-btn-secondary" onClick={handleBulkAssignResponsible} disabled={bulkAssigning || selectedCount === 0}>
                    {bulkAssigning ? 'משבץ...' : `שבץ אחראי לנבחרים (${selectedCount})`}
                  </button>
                </div>
                <button className="ct-btn-apply" onClick={applyChanges} disabled={applying || selectedCount === 0}>
                  {applying ? 'מעדכן...' : ('אשר ועדכן ' + selectedCount + ' שורות')}
                </button>
              </div>
            </div>
          )}

          {sortedRows.length === 0 ? (
            <div className="ct-empty">
              {showAll ? 'לא נמצאו לקוחות התואמים לסינון' : 'אין שינויים להצגה — לחצי על "הצג את כל הלקוחות" לראות את כולם'}
            </div>
          ) : (
            <div>
              <table>
                <thead>
                  <tr>
                    <th className="ct-th-check">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={function (e) { toggleAllFiltered(e.target.checked); }}
                        title="בחר/בטל הכל (לפי הסינון הנוכחי)"
                      />
                    </th>
                    <th onClick={() => handleSort('customerName')} style={{ cursor: 'pointer' }}>
                      לקוח{sortArrow('customerName')}
                    </th>
                    <th onClick={() => handleSort('IDCustomer')} style={{ cursor: 'pointer' }}>
                      תז{sortArrow('IDCustomer')}
                    </th>
                    <th onClick={() => handleSort('nifraimAmount')} style={{ cursor: 'pointer' }}>
                      נפרעים (משוקלל){sortArrow('nifraimAmount')}
                    </th>
                    <th onClick={() => handleSort('currentTier')} style={{ cursor: 'pointer' }}>
                      דירוג קיים{sortArrow('currentTier')}
                    </th>
                    <th onClick={() => handleSort('proposedTier')} style={{ cursor: 'pointer' }}>
                      דירוג מוצע{sortArrow('proposedTier')}
                    </th>
                    <th className="ct-th-responsible">אחראי</th>
                  </tr>
                </thead>
                <tbody>
                  {currentRows.map((r) => {
                    const isFamily = r.familySize > 1;
                    const isExpanded = expandedFamilyId === r.customerId;
                    return (
                    <>
                      <tr
                        key={r.customerId}
                        className={(r.changed ? 'ct-row-changed ' : '') + 'ct-row-clickable'}
                        onClick={(e) => {
                          const target = e.target as HTMLElement;
                          if (target.closest('input') || target.closest('select') || target.closest('button')) return;
                          goToCustomer(r.customerId);
                        }}
                      >
                        <td onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={isRowSelected(r)} onChange={function () { toggleRow(r); }} />
                        </td>
                        <td>
                          {r.customerName}
                          {isFamily && (
                            <button
                              type="button"
                              className="ct-family-badge"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedFamilyId(isExpanded ? null : r.customerId);
                              }}
                              title="לחצו להצגת בני המשפחה"
                            >
                              משפחה · {r.familySize} נפשות {isExpanded ? '▲' : '▼'}
                            </button>
                          )}
                        </td>
                        <td>{r.IDCustomer}</td>
                        <td>{r.nifraimAmount.toLocaleString()} ₪</td>
                        <td>
                          <span className={'ct-tier-badge ' + TIER_CLASS[r.currentTier]}>{TIER_LABEL[r.currentTier]}</span>
                        </td>
                        <td>
                          <span className={'ct-tier-badge ' + TIER_CLASS[r.proposedTier]}>{TIER_LABEL[r.proposedTier]}</span>
                          {r.changed ? <span className="ct-change-arrow">← שינוי</span> : null}
                        </td>
                        <td className="ct-td-responsible" onClick={(e) => e.stopPropagation()}>
                          <select
                            className="select-input"
                            value={responsibleByCustomer[r.customerId] || ''}
                            disabled={savingResponsibleFor === r.customerId}
                            onChange={(e) => handleResponsibleChange(r, e.target.value)}
                          >
                            <option value="">לא שובץ</option>
                            {responsibleList.map((opt) => (<option key={opt.id} value={opt.id}>{opt.name}</option>))}
                          </select>
                        </td>
                      </tr>
                      {isFamily && isExpanded && (
                        <tr className="ct-family-members-row">
                          <td></td>
                          <td colSpan={6}>
                            <div className="ct-family-members-list">
                              {r.members.map((m) => (
                                <span key={m.customerId} className="ct-family-member-chip">
                                  {m.customerName} · {m.IDCustomer}
                                  {m.customerId === r.customerId ? ' (ראשי)' : ''}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                    );
                  })}
                </tbody>
              </table>

              <TableFooter
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={setRowsPerPage}
              />
            </div>
          )}
        </div>
      ) : null}

      {toasts.map((t) => (
        <ToastNotification
          key={t.id}
          type={t.type}
          message={t.message}
          className={t.isHiding ? 'hide' : ''}
          onClose={function () {
            setToasts(function (prev) { return prev.filter(function (x) { return x.id !== t.id; }); });
          }}
        />
      ))}
    </div>
  );
}
