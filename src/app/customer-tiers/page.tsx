'use client';

import { Fragment, useEffect, useRef, useState, useMemo } from 'react';
import { httpsCallable } from 'firebase/functions';
import {
  collection, query, where, getDocs,
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
import {
  MeetingStage,
  MEETING_STAGE_META,
  getMeetingStageLabel,
} from '@/lib/meetingStages';
import '../MeetingsDashboard/MeetingsDashboard.css';
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
  latestAvailableYm?: string | null; // חודש הפרסום האחרון שקיים לסוכן
  policyRowsCount?: number;          // 0 = אין נתוני טעינה — חוסמים אישור
  templates?: TemplateWindow[];
}

interface TemplateWindow {
  templateId: string;
  templateName: string;
  companyName: string;
  ym: string;
  reportMonth: string;
  stale: boolean; // התבנית עוד לא נטענה לחודש הפרסום שנבחר — נלקחה מחודש קודם
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

// ── מצב עדכני של לקוח מתוך customer — לסטטוס התהליך ולזיהוי פערים בתוך משפחה ──
interface CustomerLive {
  meetingStage?: MeetingStage;
  responsibleUserId?: string | null;
  customerTier?: Tier;
}

// ── מידע נגזר לכל שורת משפחה ──
interface FamilyInfo {
  primaryStage: MeetingStage;
  memberStages: Record<string, MeetingStage>;
  memberResponsible: Record<string, string>;
  memberTier: Record<string, Tier>;
  extraStages: number;   // כמה סטטוסים שונים יש מעבר לסטטוס של הראשי
  tierGap: boolean;      // בני המשפחה לא באותו דירוג קיים
  respGap: boolean;      // בני המשפחה לא אצל אותו אחראי
  gap: boolean;
}

const TIER_LABEL: Record<Tier, string> = {
  premium: 'פרימיום',
  gold: 'זהב',
  silver: 'כסף',
  standard: 'רגיל',
};

const TIER_CLASS: Record<Tier, string> = {
  premium: 'md-tier-premium',
  gold: 'md-tier-gold',
  silver: 'md-tier-silver',
  standard: 'md-tier-standard',
};

const TIER_ORDER: Tier[] = ['premium', 'gold', 'silver', 'standard'];

// ── צבע תג הסטטוס — זהה ל-MeetingsDashboard ──
const getStageClass = (stage: MeetingStage): string => {
  const meta = MEETING_STAGE_META[stage];
  if (!meta) return 'md-stage-neutral';
  if (meta.kind === 'exit') return 'md-stage-negative';
  if (meta.kind === 'success') return 'md-stage-positive';
  if (meta.kind === 'pending') return 'md-stage-neutral';
  return 'md-stage-progress';
};

type KpiTone = 'blue' | 'green' | 'red' | 'gray';
const KPI_TONE_BY_KIND: Record<string, KpiTone> = {
  pending: 'gray',
  active: 'blue',
  success: 'green',
  exit: 'red',
};
const KPI_STAGES = Object.keys(MEETING_STAGE_META) as MeetingStage[];

const ymOf = (d: Date) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');

function prevMonth() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return ymOf(d);
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
  const { agents, selectedAgentId, setSelectedAgentId, handleAgentChange } = useFetchAgentData();
  const { detail } = useAuth();
  const { canAccess: canAccessCustomerTiers } = usePermission('access_customer_tiers');
  const { toasts, addToast, setToasts } = useToast();
  const router = useRouter();

  const [month, setMonth] = useState(prevMonth());
  const [lastCalculated, setLastCalculated] = useState<string | null>(null);
  const [showStale, setShowStale] = useState(false);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CalcResult | null>(null);
  // מונע מתוצאה של סוכן קודם לדרוס את התצוגה אחרי החלפת סוכן
  const calcAgentRef = useRef<string>('');

  // ── מצב עדכני של הלקוחות (סטטוס תהליך / אחראי / דירוג) ──
  const [customersLive, setCustomersLive] = useState<Record<string, CustomerLive>>({});

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
  const [stageFilter, setStageFilter] = useState<string>('all'); // לפי הסטטוס של המבוטח הראשי
  const [gapOnly, setGapOnly] = useState(false);
  const [nifraimMin, setNifraimMin] = useState('');
  const [nifraimMax, setNifraimMax] = useState('');

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

  // ── הגעה מהדשבורד עם ?agent= — רלוונטי למי שבוחר סוכן (admin), ורק לסוכן שמופיע ברשימה המורשית שלו ──
  const agentParamApplied = useRef(false);
  useEffect(() => {
    if (agentParamApplied.current || !agents.length || detail?.role !== 'admin') return;
    agentParamApplied.current = true;
    const agentParam = new URLSearchParams(window.location.search).get('agent');
    if (agentParam && agents.some((a) => a.id === agentParam)) setSelectedAgentId(agentParam);
  }, [agents, detail?.role, setSelectedAgentId]);

  const resetFilters = () => {
    setOverrides({});
    setCurrentPage(1);
    setNameFilter('');
    setIdFilter('');
    setCurrentTierFilter('');
    setProposedTierFilter('');
    setResponsibleFilter('');
    setStageFilter('all');
    setGapOnly(false);
    setNifraimMin('');
    setNifraimMax('');
    setExpandedFamilyId(null);
  };

  // ── טעינת המצב העדכני של לקוחות הסוכן (זהה למקור של MeetingsDashboard).
  // מחזיר את החודש המאוחר ביותר שאושר על כרטיסי הלקוחות (tierLastCalculated) — רשת ביטחון לזיהוי הדירוג האחרון ──
  const loadCustomersLive = async (agentId: string): Promise<string | null> => {
    try {
      const snap = await getDocs(query(collection(db, 'customer'), where('AgentId', '==', agentId)));
      if (calcAgentRef.current !== agentId) return null;
      const map: Record<string, CustomerLive> = {};
      let lastTierMonth: string | null = null;
      snap.docs.forEach((d) => {
        const c = d.data() as any;
        const tm = typeof c.tierLastCalculated === 'string' ? c.tierLastCalculated : '';
        if (tm && (!lastTierMonth || tm > lastTierMonth)) lastTierMonth = tm;
        map[d.id] = {
          meetingStage: c.meetingStage,
          responsibleUserId: c.responsibleUserId ?? null,
          customerTier: c.customerTier,
        };
      });
      setCustomersLive(map);
      return lastTierMonth;
    } catch (err) {
      setCustomersLive({});
      return null;
    }
  };


  // auto = טעינת הדירוג הקיים (מציגים את כולם, בלי הודעה). keepView = אחרי אישור — שומרים על הסינון והתצוגה
  const runCalculation = async (monthArg?: string, auto = false, keepView = false) => {
    const calcMonth = monthArg || month;
    if (!selectedAgentId) { addToast('error', 'בחר סוכן'); return; }
    if (!calcMonth) { addToast('error', 'בחר חודש לחישוב'); return; }

    const agentId = selectedAgentId;
    setLoading(true);
    if (keepView) {
      setOverrides({});
    } else {
      setResult(null);
      resetFilters();
    }

    try {
      const fn = httpsCallable(functions, 'calculateCustomerTiers');
      const res: any = await fn({ agentId, month: calcMonth });
      if (calcAgentRef.current !== agentId) return;
      const data = res.data as CalcResult;
      setResult(data);

      const initialResponsible: Record<string, string> = {};
      data.rows.forEach(function (r) {
        if (r.responsibleUserId) initialResponsible[r.customerId] = r.responsibleUserId;
      });
      setResponsibleByCustomer(initialResponsible);
      // טעינה אוטומטית של הדירוג הקיים — מציגים את כולם (אחרי אישור אין "שינויים", והדף היה נראה ריק)
      setShowAll(keepView || auto || data.changedCount === 0);

      setShowStale(false);
      if (!auto && data.changedCount === 0) {
        addToast('success', 'החישוב בוצע — אין שינויים מהדירוג הקיים');
      }
    } catch (e: any) {
      if (calcAgentRef.current === agentId) addToast('error', (e && e.message) || 'כשל בחישוב הדירוג');
    } finally {
      if (calcAgentRef.current === agentId) setLoading(false);
    }
  };

  // ── כניסה לדף / החלפת סוכן: טעינת הדירוג האחרון שאושר + בדיקת טעינה חדשה יותר ──
  useEffect(() => {
    setShowThresholdSettings(false);
    setThresholdsSource(null);
    setResult(null);
    setLastCalculated(null);
    setCustomersLive({});
    calcAgentRef.current = selectedAgentId || '';
    if (!selectedAgentId) return;

    const agentId = selectedAgentId;
    const load = async () => {
      const liveMonthPromise = loadCustomersLive(agentId);

      // הריצה האחרונה שאושרה. בלי orderBy — שאילתת agentId+runAt דורשת אינדקס מורכב, ובלעדיו היא נכשלה
      // בשקט והדף חשב שלא אושר דירוג. לכל סוכן יש מעט ריצות, אז בוחרים את האחרונה כאן.
      let last: string | null = null;
      try {
        const snap = await getDocs(query(collection(db, 'tierCalcRuns'), where('agentId', '==', agentId)));
        let lastRunAt = -1;
        snap.docs.forEach((d) => {
          const r = d.data() as any;
          const t = r.runAt?.toMillis?.() ?? 0;
          if (r.month && t > lastRunAt) { lastRunAt = t; last = r.month; }
        });
      } catch (err) {
        // ממשיכים לרשת הביטחון
      }
      // רשת ביטחון: החודש המאוחר ביותר שנכתב על כרטיסי הלקוחות באישור
      if (!last) last = await liveMonthPromise;
      if (calcAgentRef.current !== agentId) return;
      setLastCalculated(last);

      // החישוב קורא בלבד — טוענים מיד את החודש האחרון שאושר (או החודש הקודם, אם עוד לא דורג).
      // התוצאה מחזירה גם את חודש הפרסום האחרון שקיים, לבאנר "יש טעינה חדשה יותר"
      const entryMonth = last || prevMonth();
      setMonth(entryMonth);
      runCalculation(entryMonth, true);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // ── מידע נגזר לכל משפחה: סטטוסים, ופערי דירוג/אחראי בין בני המשפחה ──
  const familyInfo = useMemo(() => {
    const map: Record<string, FamilyInfo> = {};
    if (!result) return map;
    result.rows.forEach((r) => {
      const memberStages: Record<string, MeetingStage> = {};
      const memberResponsible: Record<string, string> = {};
      const memberTier: Record<string, Tier> = {};
      r.members.forEach((m) => {
        const live = customersLive[m.customerId];
        memberStages[m.customerId] = (live?.meetingStage || 'not_started') as MeetingStage;
        memberResponsible[m.customerId] = (live ? live.responsibleUserId : m.responsibleUserId) || '';
        memberTier[m.customerId] = (live?.customerTier || m.currentTier || 'standard') as Tier;
      });
      const primaryStage = memberStages[r.customerId] || 'not_started';
      const tierGap = new Set(Object.values(memberTier)).size > 1;
      const respGap = new Set(Object.values(memberResponsible)).size > 1;
      map[r.customerId] = {
        primaryStage,
        memberStages,
        memberResponsible,
        memberTier,
        extraStages: new Set(Object.values(memberStages)).size - 1,
        tierGap,
        respGap,
        gap: tierGap || respGap,
      };
    });
    return map;
  }, [result, customersLive]);

  const primaryStageOf = (r: TierRow): MeetingStage => familyInfo[r.customerId]?.primaryStage || 'not_started';

  // ── שורות אחרי "שינויים בלבד / הכל" ──
  const baseRows = useMemo(() => {
    if (!result) return [];
    return showAll ? result.rows : result.rows.filter(function (r) { return r.changed; });
  }, [result, showAll]);

  // ── סינוני אוכלוסייה: שם/ת"ז/דירוג מוצע/אחראי/טווח נפרעים. כרטיסי הדירוג נספרים על זה (על כל הלקוחות, לא רק השינויים) ──
  const matchesPopulation = (r: TierRow) => {
    const nameQ = nameFilter.toLowerCase().trim();
    const idQ = idFilter.trim();
    const nameOk = !nameQ
      || r.customerName.toLowerCase().includes(nameQ)
      || r.members.some((m) => m.customerName.toLowerCase().includes(nameQ));
    const idOk = !idQ
      || r.IDCustomer.includes(idQ)
      || r.members.some((m) => m.IDCustomer.includes(idQ));
    const propOk = !proposedTierFilter || r.proposedTier === proposedTierFilter;
    const resp = responsibleByCustomer[r.customerId] || '';
    const respOk = !responsibleFilter
      || (responsibleFilter === '__none__' ? !resp : resp === responsibleFilter);
    const min = nifraimMin.trim() === '' ? null : Number(nifraimMin);
    const max = nifraimMax.trim() === '' ? null : Number(nifraimMax);
    const minOk = min === null || Number.isNaN(min) || r.nifraimAmount >= min;
    const maxOk = max === null || Number.isNaN(max) || r.nifraimAmount <= max;
    return nameOk && idOk && propOk && respOk && minOk && maxOk;
  };

  const kpiBaseRows = useMemo(
    () => (result ? result.rows.filter(matchesPopulation) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result, nameFilter, idFilter, proposedTierFilter, responsibleFilter, responsibleByCustomer, nifraimMin, nifraimMax],
  );

  // ── היקף: שם/ת"ז/דירוג/אחראי. כרטיסי הסטטוס והפער מחושבים על ההיקף הזה (לא מושפעים מסינון סטטוס/פער).
  // שם/ת"ז מתאימים גם אם ההתאמה היא לבן משפחה שאינו הראשי ──
  const scopedRows = useMemo(
    () => baseRows.filter((r) => (!currentTierFilter || r.currentTier === currentTierFilter) && matchesPopulation(r)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseRows, currentTierFilter, nameFilter, idFilter, proposedTierFilter, responsibleFilter, responsibleByCustomer, nifraimMin, nifraimMax],
  );

  // ── ספירה לפי סטטוס: משפחות (לפי הסטטוס של הראשי) + לקוחות (כל לקוח לפי הסטטוס שלו — כמו בדשבורד) ──
  const stageCounts = useMemo(() => {
    const families: Record<string, number> = {};
    const people: Record<string, number> = {};
    scopedRows.forEach((r) => {
      const info = familyInfo[r.customerId];
      const ps = info?.primaryStage || 'not_started';
      families[ps] = (families[ps] ?? 0) + 1;
      r.members.forEach((m) => {
        const s = info?.memberStages[m.customerId] || 'not_started';
        people[s] = (people[s] ?? 0) + 1;
      });
    });
    return { families, people };
  }, [scopedRows, familyInfo]);

  const scopedPeople = useMemo(() => scopedRows.reduce((n, r) => n + r.members.length, 0), [scopedRows]);
  const gapCount = useMemo(() => scopedRows.filter((r) => familyInfo[r.customerId]?.gap).length, [scopedRows, familyInfo]);

  // ── פילטור הטבלה: היקף + סטטוס + פער ──
  const filteredRows = useMemo(() => {
    let rows = scopedRows;
    if (stageFilter !== 'all') rows = rows.filter((r) => primaryStageOf(r) === stageFilter);
    if (gapOnly) rows = rows.filter((r) => familyInfo[r.customerId]?.gap);
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedRows, stageFilter, gapOnly, familyInfo]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sortedRows, overrides],
  );

  // ── מצב נתוני הטעינה של החישוב הנוכחי ──
  const noLoadData = !!result && result.policyRowsCount === 0;
  const staleTemplates = (result?.templates || []).filter((t) => t.stale);
  const newerLoadMonth = result?.latestAvailableYm && result.latestAvailableYm > result.month
    ? result.latestAvailableYm : null;

  const applyChanges = async () => {
    if (!result || !selectedAgentId) return;

    const approvedRows = selectedVisibleRows.map(function (r) {
      return { customerId: r.customerId, proposedTier: r.proposedTier, nifraimAmount: r.nifraimAmount };
    });

    if (approvedRows.length === 0) { addToast('error', 'לא נבחרו שורות לאישור'); return; }
    if (noLoadData) { addToast('error', 'אין נתוני טעינה לחודש הפרסום הזה — לא ניתן לאשר דירוג'); return; }

    // ── הגנה: אישור שמוריד דירוג (למשל חישוב מחודש עם טעינה חלקית) — דורש אישור מפורש ──
    const rank: Record<Tier, number> = { standard: 0, silver: 1, gold: 2, premium: 3 };
    const downgrades = selectedVisibleRows.filter((r) =>
      r.members.some((m) => rank[r.proposedTier] < rank[(familyInfo[r.customerId]?.memberTier[m.customerId] || m.currentTier)]),
    ).length;
    if (downgrades > 0 && !window.confirm(
      `שימי לב: ${downgrades} משפחות ירדו בדירוג לפי חישוב חודש ${result.month}.\n` +
      'אם בחודש הזה הטעינה עדיין חלקית — הדירוג שלהן ירד בטעות.\n\nלהמשיך באישור?',
    )) return;

    const agentId = selectedAgentId;
    const appliedMonth = result.month;
    setApplying(true);
    try {
      const fn = httpsCallable(functions, 'applyCustomerTiers');
      const res: any = await fn({ agentId, month: appliedMonth, approvedRows: approvedRows });
      addToast('success', 'עודכנו ' + res.data.updated + ' רשומות לקוח בהצלחה');
      setLastCalculated(appliedMonth);
      // אחרי אישור: נשארים בדף עם הדירוג המעודכן (במקום מסך ריק), ובודקים שוב אם יש טעינה חדשה יותר
      loadCustomersLive(agentId);
      runCalculation(appliedMonth, true, true);
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

  // מעדכן את המצב המקומי של האחראי — כדי שסימון "פער במשפחה" ייעלם מיד אחרי שיבוץ
  const patchLiveResponsible = (ids: string[], responsibleUserId: string | null) => {
    setCustomersLive((prev) => {
      const next = { ...prev };
      ids.forEach((id) => { next[id] = { ...(next[id] || {}), responsibleUserId }; });
      return next;
    });
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
      patchLiveResponsible(targetIds, value || null);
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
      patchLiveResponsible(idsArray, bulkResponsibleValue || null);

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
  }, [nameFilter, idFilter, currentTierFilter, proposedTierFilter, responsibleFilter, showAll, stageFilter, gapOnly, nifraimMin, nifraimMax]);

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

  const sortIndicator = (col: SortColumn) => {
    if (sortColumn !== col) return <span className="md-sort-icon md-sort-icon-idle">⇅</span>;
    return <span className="md-sort-icon md-sort-icon-active">{sortOrder === 'asc' ? '↑' : '↓'}</span>;
  };

  // ── ריכוז לפי דירוג נוכחי: משפחות (לפי הראשי) + לקוחות בודדים ──
  const tierCounts = useMemo(() => {
    const families: Record<Tier, number> = { premium: 0, gold: 0, silver: 0, standard: 0 };
    // people = כל בני המשפחות שבכרטיס (עקבי עם מה שמוצג בלחיצה עליו).
    // elsewhere = לקוחות שהדירוג שלהם עצמם הוא הדירוג הזה, אבל הם במשפחה שהראשי בה בדירוג אחר (פער במשפחה)
    const people: Record<Tier, number> = { premium: 0, gold: 0, silver: 0, standard: 0 };
    const elsewhere: Record<Tier, number> = { premium: 0, gold: 0, silver: 0, standard: 0 };
    kpiBaseRows.forEach((r) => {
      families[r.currentTier] = (families[r.currentTier] || 0) + 1;
      people[r.currentTier] = (people[r.currentTier] || 0) + r.members.length;
      r.members.forEach((m) => {
        if (m.currentTier !== r.currentTier) elsewhere[m.currentTier] = (elsewhere[m.currentTier] || 0) + 1;
      });
    });
    return { families, people, elsewhere };
  }, [kpiBaseRows]);
  const kpiBasePeople = useMemo(() => kpiBaseRows.reduce((n, r) => n + r.members.length, 0), [kpiBaseRows]);
  const populationFiltered = kpiBaseRows.length !== (result?.rows.length ?? 0);

  const getResponsibleName = (uid?: string | null) => {
    if (!uid) return 'לא שובץ';
    return responsibleList.find((o) => o.id === uid)?.name || uid;
  };

  const goToCustomer = (customerId: string) => {
    router.push(`/customers/${customerId}`);
  };

  // ── מעבר לדשבורד הפגישות עם הסינון הנוכחי (אחראי / דירוג קיים / סטטוס) ──
  const openInDashboard = () => {
    const p = new URLSearchParams();
    if (selectedAgentId) p.set('agent', selectedAgentId);
    p.set('responsible', !responsibleFilter ? 'all' : responsibleFilter === '__none__' ? 'none' : responsibleFilter);
    if (currentTierFilter) p.set('tier', currentTierFilter);
    if (stageFilter !== 'all') p.set('stage', stageFilter);
    router.push(`/MeetingsDashboard?${p.toString()}`);
  };

  if (!canAccessCustomerTiers) {
    return (
      <div className="md-page" dir="rtl">
        <div className="md-empty">אין לך הרשאה לצפות בדף זה</div>
      </div>
    );
  }

  return (
    <div className="md-page" dir="rtl">
      <div className="md-header">
        <div>
          <div className="md-title">דירוג לקוחות</div>
          <div className="md-subtitle">
            {lastCalculated ? ('דירוג אחרון שאושר: ' + lastCalculated) : 'לא אושר דירוג עדיין לסוכן זה'}
            {result ? ` · מוצג חישוב לחודש פרסום ${result.month}` : ''}
          </div>
        </div>
        <div className="ct-header-actions">
          <button
            type="button"
            className="ct-btn-secondary"
            onClick={openInDashboard}
            disabled={!selectedAgentId}
            title="פתיחת דשבורד הפגישות עם הסינון הנוכחי: אחראי, דירוג קיים וסטטוס"
          >
            📋 פתח בדשבורד פגישות
          </button>
          <button type="button" className="ct-btn-secondary" onClick={toggleThresholdSettings} disabled={!selectedAgentId}>
            ⚙ הגדרות דירוג
          </button>
        </div>
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
                <div className="md-filter-group">
                  <label className="md-filter-label">סף כסף</label>
                  <input
                    type="number"
                    className="md-input ct-threshold-input"
                    value={thresholdsDraft.silver}
                    onChange={(e) => setThresholdsDraft((p) => ({ ...p, silver: e.target.value }))}
                  />
                </div>
                <div className="md-filter-group">
                  <label className="md-filter-label">סף זהב</label>
                  <input
                    type="number"
                    className="md-input ct-threshold-input"
                    value={thresholdsDraft.gold}
                    onChange={(e) => setThresholdsDraft((p) => ({ ...p, gold: e.target.value }))}
                  />
                </div>
                <div className="md-filter-group">
                  <label className="md-filter-label">סף פרימיום</label>
                  <input
                    type="number"
                    className="md-input ct-threshold-input"
                    value={thresholdsDraft.premium}
                    onChange={(e) => setThresholdsDraft((p) => ({ ...p, premium: e.target.value }))}
                  />
                </div>
              </div>
              <div className="ct-threshold-actions">
                <button type="button" className="md-btn-export" onClick={saveThresholdSettings} disabled={thresholdsSaving}>
                  {thresholdsSaving ? 'שומר...' : 'שמור הגדרות'}
                </button>
                <button type="button" className="ct-btn-secondary" onClick={() => setShowThresholdSettings(false)}>
                  סגור
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── באנר: קיים חודש פרסום מאוחר מהחודש המוצג ── */}
      {newerLoadMonth && !loading && (
        <div className="ct-newer-banner">
          <span>
            ⚠️ יש טעינות לחודש פרסום <b>{newerLoadMonth}</b>
            {lastCalculated ? ` — חדש מהדירוג האחרון שאושר (${lastCalculated})` : ' — טרם אושר דירוג לסוכן זה'}
          </span>
          <button
            type="button"
            className="md-btn-export"
            onClick={() => { setMonth(newerLoadMonth); runCalculation(newerLoadMonth); }}
          >
            חשב דירוג לחודש פרסום {newerLoadMonth}
          </button>
        </div>
      )}

      {/* ── אין נתוני טעינה לחודש — חוסמים אישור ── */}
      {noLoadData && !loading && (
        <div className="ct-nodata-banner">
          ⛔ לא נמצאו נתוני טעינה (נפרעים) לחודש פרסום <b>{result?.month}</b> ול-12 החודשים שלפניו — כל הנפרעים 0.
          אישור הדירוג חסום.
        </div>
      )}

      {/* ── תבניות שעדיין בחודש פרסום קודם (כמו בדף המסכם) ── */}
      {staleTemplates.length > 0 && !loading && (
        <div className="ct-stale-box">
          <button type="button" className="ct-stale-toggle" onClick={() => setShowStale((v) => !v)}>
            ⚠️ {staleTemplates.length} דוחות עדיין בחודש פרסום קודם — הנפרעים שלהם נלקחו מהחודש האחרון שנטען {showStale ? '▲' : '▼'}
          </button>
          {showStale && (
            <ul className="ct-stale-list">
              {staleTemplates.map((t) => (
                <li key={t.templateId}>
                  {t.companyName ? `${t.companyName} – ` : ''}{t.templateName}: חודש פרסום {t.ym} (דיווח {t.reportMonth})
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── בחירת סוכן וחודש לחישוב ── */}
      <div className="md-filters">
        {detail && detail.role === 'admin' ? (
          <div className="md-filter-group">
            <label className="md-filter-label">סוכן</label>
            <select className="md-select" value={selectedAgentId} onChange={handleAgentChange}>
              <option value="">בחר סוכן</option>
              {agents.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
            </select>
          </div>
        ) : null}

        <div className="md-filter-group">
          <label className="md-filter-label">חודש פרסום</label>
          <input type="month" className="md-select" value={month} onChange={function (e) { setMonth(e.target.value); }} />
        </div>

        <button type="button" className="md-btn-export" onClick={() => runCalculation()} disabled={loading || !selectedAgentId}>
          {loading ? 'מחשב...' : 'חשב דירוג'}
        </button>
      </div>

      {loading && !result ? (
        <div className="md-loading">טוען דירוג...</div>
      ) : result ? (
        <>
          {/* ── KPI: דירוג קיים + סטטוס תהליך + פערים במשפחה ── */}
          <div className="md-kpi-bar">
            <div className="md-kpi-head">
              <div className="md-kpi-title">לפי דירוג קיים</div>
              <div className="md-kpi-total">
                {populationFiltered
                  ? `${kpiBaseRows.length} משפחות · ${kpiBasePeople} לקוחות (מתוך ${result.totalFamilies})`
                  : `${result.totalFamilies} משפחות · ${result.totalCustomers} לקוחות`}
              </div>
              <div className="md-filter-group">
                <label className="md-filter-label">אחראי</label>
                <select className="md-select" value={responsibleFilter} onChange={(e) => setResponsibleFilter(e.target.value)}>
                  <option value="">כולם</option>
                  <option value="__none__">לא שובץ</option>
                  {responsibleList.map((opt) => (<option key={opt.id} value={opt.id}>{opt.name}</option>))}
                </select>
              </div>
              {result.changedCount > 0 && (
                <div className="ct-changed-count">{result.changedCount} שינויים מהדירוג הקיים</div>
              )}
            </div>
            <div className="md-kpi-grid">
              {TIER_ORDER.map((tier) => {
                const active = currentTierFilter === tier;
                return (
                  <button
                    key={tier}
                    type="button"
                    className={`md-kpi-card ct-kpi-${tier}${active ? ' md-kpi-active' : ''}`}
                    onClick={() => {
                      setCurrentTierFilter(active ? '' : tier);
                      // ביטול הדירוג מסתיר את כרטיסי הסטטוס — לא משאירים סינון סטטוס "נסתר"
                      if (active) setStageFilter('all');
                      setShowAll(true);
                    }}
                    title={active ? 'לחץ לביטול הסינון' : 'לחץ לסינון הטבלה'}
                  >
                    <div className="md-kpi-value">{tierCounts.families[tier]}</div>
                    <div className="md-kpi-label">{TIER_LABEL[tier]}</div>
                    <div className="md-kpi-sub">{tierCounts.people[tier]} לקוחות במשפחות אלה</div>
                    {tierCounts.elsewhere[tier] > 0 && (
                      <div
                        className="ct-kpi-elsewhere"
                        title="לקוחות שמסומנים בדירוג הזה אבל משויכים למשפחה שהמבוטח הראשי בה בדירוג אחר — מופיעים בכרטיס 'משפחות עם פער'"
                      >
                        ⚠️ עוד {tierCounts.elsewhere[tier]} במשפחה בדירוג אחר
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ── סטטוס תהליך — מוצג רק אחרי בחירת דירוג ── */}
            {!currentTierFilter ? (
              <div className="ct-kpi-hint">לחצי על אחד הדירוגים כדי לראות כמה מהם נמצאים בכל סטטוס תהליך</div>
            ) : (
            <>
            <div className="md-kpi-head ct-kpi-head-second">
              <div className="md-kpi-title">{TIER_LABEL[currentTierFilter as Tier]} — לפי סטטוס תהליך</div>
              <div className="md-kpi-total">{scopedRows.length} משפחות · {scopedPeople} לקוחות</div>
              <div className="md-kpi-note">
                מושפע מהסינון (דירוג / אחראי / חיפוש). המספר הגדול = משפחות לפי הסטטוס של המבוטח הראשי;
                &quot;לקוחות&quot; = כל לקוח לפי הסטטוס שלו, כמו בדשבורד הפגישות.
              </div>
            </div>
            <div className="md-kpi-grid">
              {KPI_STAGES.map((stageKey) => {
                const meta = MEETING_STAGE_META[stageKey];
                const tone = KPI_TONE_BY_KIND[meta.kind] ?? 'gray';
                const active = stageFilter === stageKey;
                return (
                  <button
                    key={stageKey}
                    type="button"
                    className={`md-kpi-card md-kpi-${tone}${active ? ' md-kpi-active' : ''}`}
                    onClick={() => setStageFilter(active ? 'all' : stageKey)}
                    title={active ? 'לחץ לביטול הסינון' : 'לחץ לסינון הטבלה'}
                  >
                    <div className="md-kpi-value">{stageCounts.families[stageKey] ?? 0}</div>
                    <div className="md-kpi-label">{meta.icon} {meta.label}</div>
                    <div className="md-kpi-sub">{stageCounts.people[stageKey] ?? 0} לקוחות</div>
                  </button>
                );
              })}
            </div>
            </>
            )}

            <div className="md-kpi-extra">
              <button
                type="button"
                className={`md-kpi-card md-kpi-orange${gapOnly ? ' md-kpi-active' : ''}`}
                onClick={() => { setGapOnly((v) => !v); setShowAll(true); }}
                title={gapOnly ? 'לחץ לביטול הסינון' : 'לחץ לסינון הטבלה'}
              >
                <div className="md-kpi-value">{gapCount}</div>
                <div className="md-kpi-label">⚠️ משפחות עם פער</div>
                <div className="md-kpi-sub">דירוג או אחראי שונים בין בני המשפחה</div>
              </button>
            </div>
          </div>

          {/* ── פילטרים ── */}
          <div className="md-filters">
            <div className="md-filter-group">
              <label className="md-filter-label">דירוג קיים</label>
              <select className="md-select" value={currentTierFilter} onChange={(e) => setCurrentTierFilter(e.target.value)}>
                <option value="">הכל</option>
                {TIER_ORDER.map((t) => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}
              </select>
            </div>
            <div className="md-filter-group">
              <label className="md-filter-label">דירוג מוצע</label>
              <select className="md-select" value={proposedTierFilter} onChange={(e) => setProposedTierFilter(e.target.value)}>
                <option value="">הכל</option>
                {TIER_ORDER.map((t) => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}
              </select>
            </div>
            <div className="md-filter-group">
              <label className="md-filter-label">אחראי</label>
              <select className="md-select" value={responsibleFilter} onChange={(e) => setResponsibleFilter(e.target.value)}>
                <option value="">הכל</option>
                <option value="__none__">לא שובץ</option>
                {responsibleList.map((opt) => (<option key={opt.id} value={opt.id}>{opt.name}</option>))}
              </select>
            </div>
            <div className="md-filter-group">
              <label className="md-filter-label">סטטוס</label>
              <select className="md-select" value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
                <option value="all">הכל</option>
                {KPI_STAGES.map((s) => <option key={s} value={s}>{MEETING_STAGE_META[s].label}</option>)}
              </select>
            </div>
            <div className="md-filter-group">
              <label className="md-filter-label">נפרעים ₪</label>
              <input
                className="md-input ct-amount-input"
                type="number"
                placeholder="מ-"
                value={nifraimMin}
                onChange={(e) => setNifraimMin(e.target.value)}
              />
              <input
                className="md-input ct-amount-input"
                type="number"
                placeholder="עד"
                value={nifraimMax}
                onChange={(e) => setNifraimMax(e.target.value)}
              />
            </div>
            <div className="md-filter-group md-filter-search">
              <input className="md-input" type="text" placeholder="שם לקוח (כולל בני משפחה)" value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} />
            </div>
            <div className="md-filter-group md-filter-search">
              <input className="md-input" type="text" placeholder='ת"ז (כולל בני משפחה)' value={idFilter} onChange={(e) => setIdFilter(e.target.value)} />
            </div>
            <label className="ct-show-all-toggle">
              <input type="checkbox" checked={showAll} onChange={function (e) { setShowAll(e.target.checked); }} />
              הצג גם ללא שינוי
            </label>
          </div>

          {/* ── שורת פעולה מאוחדת: שיבוץ אחראי + אישור דירוג ── */}
          {sortedRows.length > 0 && (
            <div className="ct-action-bar">
              <span className="ct-action-count">
                {selectedCount} משפחות מסומנות מתוך {sortedRows.length} מוצגות
              </span>
              <div className="ct-action-buttons">
                <button type="button" className="ct-btn-secondary" onClick={() => toggleAllFiltered(!allFilteredSelected)}>
                  {allFilteredSelected ? 'נקה בחירה' : 'בחר הכל'}
                </button>
                <div className="ct-bulk-action">
                  <select
                    className="md-select"
                    value={bulkResponsibleValue}
                    onChange={(e) => setBulkResponsibleValue(e.target.value)}
                  >
                    <option value="">לא שובץ</option>
                    {responsibleList.map((opt) => (<option key={opt.id} value={opt.id}>{opt.name}</option>))}
                  </select>
                  <button type="button" className="ct-btn-secondary" onClick={handleBulkAssignResponsible} disabled={bulkAssigning || selectedCount === 0}>
                    {bulkAssigning ? 'משבץ...' : `שבץ אחראי לנבחרים (${selectedCount})`}
                  </button>
                </div>
                <button
                  type="button"
                  className="ct-btn-apply"
                  onClick={applyChanges}
                  disabled={applying || selectedCount === 0 || noLoadData}
                  title={noLoadData ? 'אין נתוני טעינה לחודש הזה' : ''}
                >
                  {applying ? 'מעדכן...' : ('אשר ועדכן דירוג ל-' + selectedCount + ' משפחות · חודש פרסום ' + result.month)}
                </button>
              </div>
            </div>
          )}

          {sortedRows.length === 0 ? (
            <div className="md-empty">
              {showAll ? 'לא נמצאו לקוחות התואמים לסינון' : 'אין שינויים להצגה — סמני "הצג גם ללא שינוי" כדי לראות את כולם'}
            </div>
          ) : (
            <div className="md-table-wrap">
              <table className="md-table">
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
                    <th className="md-th-sortable" onClick={() => handleSort('customerName')}>
                      לקוח {sortIndicator('customerName')}
                    </th>
                    <th className="md-th-sortable" onClick={() => handleSort('nifraimAmount')}>
                      נפרעים (משוקלל) {sortIndicator('nifraimAmount')}
                    </th>
                    <th className="md-th-sortable" onClick={() => handleSort('currentTier')}>
                      דירוג קיים {sortIndicator('currentTier')}
                    </th>
                    <th className="md-th-sortable" onClick={() => handleSort('proposedTier')}>
                      דירוג מוצע {sortIndicator('proposedTier')}
                    </th>
                    <th>אחראי</th>
                    <th>סטטוס תהליך</th>
                  </tr>
                </thead>
                <tbody>
                  {currentRows.map((r) => {
                    const isFamily = r.familySize > 1;
                    const isExpanded = expandedFamilyId === r.customerId;
                    const info = familyInfo[r.customerId];
                    const stage = info?.primaryStage || 'not_started';
                    const gapTitle = info?.gap
                      ? 'פער במשפחה: ' + [info.tierGap ? 'דירוג קיים שונה' : '', info.respGap ? 'אחראי שונה' : ''].filter(Boolean).join(' + ') + ' — לחצו לפרטים'
                      : '';
                    return (
                      <Fragment key={r.customerId}>
                        <tr
                          className={'md-row' + (r.changed ? ' ct-row-changed' : '')}
                          onClick={(e) => {
                            const target = e.target as HTMLElement;
                            if (target.closest('input') || target.closest('select') || target.closest('button')) return;
                            goToCustomer(r.customerId);
                          }}
                        >
                          <td onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" checked={isRowSelected(r)} onChange={function () { toggleRow(r); }} />
                          </td>
                          <td className="md-cell-name">
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
                            {info?.gap && (
                              <button
                                type="button"
                                className="ct-gap-badge"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedFamilyId(isExpanded ? null : r.customerId);
                                }}
                                title={gapTitle}
                              >
                                ⚠️ פער במשפחה
                              </button>
                            )}
                            <div className="md-cell-subid">{r.IDCustomer}</div>
                          </td>
                          <td>{r.nifraimAmount.toLocaleString()} ₪</td>
                          <td>
                            <span className={'md-tier-badge ' + TIER_CLASS[r.currentTier]}>{TIER_LABEL[r.currentTier]}</span>
                          </td>
                          <td>
                            <span className={'md-tier-badge ' + TIER_CLASS[r.proposedTier]}>{TIER_LABEL[r.proposedTier]}</span>
                            {r.changed ? <span className="ct-change-arrow">← שינוי</span> : null}
                          </td>
                          <td className="ct-td-responsible" onClick={(e) => e.stopPropagation()}>
                            <select
                              className="md-select"
                              value={responsibleByCustomer[r.customerId] || ''}
                              disabled={savingResponsibleFor === r.customerId}
                              onChange={(e) => handleResponsibleChange(r, e.target.value)}
                            >
                              <option value="">לא שובץ</option>
                              {responsibleList.map((opt) => (<option key={opt.id} value={opt.id}>{opt.name}</option>))}
                            </select>
                          </td>
                          <td>
                            <span className={`md-stage-badge ${getStageClass(stage)}`}>
                              {MEETING_STAGE_META[stage]?.icon} {getMeetingStageLabel(stage)}
                            </span>
                            {info && info.extraStages > 0 && (
                              <span className="ct-extra-stages" title="לבני המשפחה יש סטטוסים שונים — לחצו על 'משפחה' לפרטים">
                                +{info.extraStages} סטטוסים
                              </span>
                            )}
                          </td>
                        </tr>
                        {isFamily && isExpanded && info && (
                          <tr className="ct-family-members-row">
                            <td></td>
                            <td colSpan={6}>
                              <div className="ct-family-members-list">
                                {r.members.map((m) => {
                                  const mStage = info.memberStages[m.customerId] || 'not_started';
                                  const mTier = info.memberTier[m.customerId] || 'standard';
                                  const mResp = info.memberResponsible[m.customerId] || '';
                                  const tierOff = info.tierGap && mTier !== info.memberTier[r.customerId];
                                  const respOff = info.respGap && mResp !== info.memberResponsible[r.customerId];
                                  return (
                                    <div
                                      key={m.customerId}
                                      className="ct-family-member"
                                      onClick={() => goToCustomer(m.customerId)}
                                      title="מעבר לכרטיס הלקוח"
                                    >
                                      <span className="ct-member-name">
                                        {m.customerName}{m.customerId === r.customerId ? ' (ראשי)' : ''}
                                      </span>
                                      <span className="md-cell-subid">{m.IDCustomer}</span>
                                      <span className={'md-tier-badge ' + TIER_CLASS[mTier] + (tierOff ? ' ct-off' : '')}>
                                        {TIER_LABEL[mTier]}
                                      </span>
                                      <span className={'ct-member-resp' + (respOff ? ' ct-off' : '')}>
                                        👤 {getResponsibleName(mResp)}
                                      </span>
                                      <span className={`md-stage-badge ${getStageClass(mStage)}`}>
                                        {MEETING_STAGE_META[mStage]?.icon} {getMeetingStageLabel(mStage)}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                              {info.gap && (
                                <div className="ct-gap-hint">
                                  {info.tierGap && 'אישור הדירוג לשורה הזו יעדכן את כל בני המשפחה לאותו דירוג. '}
                                  {info.respGap && 'בחירת אחראי בשורה תשבץ את כל בני המשפחה לאותו אחראי.'}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
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
        </>
      ) : selectedAgentId ? (
        <div className="md-empty">
          {lastCalculated === null
            ? 'טרם אושר דירוג לסוכן זה — בחרי חודש פרסום ולחצי "חשב דירוג"'
            : 'בחרי חודש פרסום ולחצי "חשב דירוג"'}
        </div>
      ) : (
        <div className="md-empty">בחרי סוכן כדי להציג את הדירוג</div>
      )}

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
