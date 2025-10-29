"use client";

import React, { useEffect, useMemo, useState } from "react";
import { collection, getDoc, getDocs, query, where, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase";
import useFetchAgentData from "@/hooks/useFetchAgentData";
import { useAuth } from "@/lib/firebase/AuthContext";
import * as XLSX from "xlsx";
import { Button } from "@/components/Button/Button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import DialogNotification from "@/components/DialogNotification";

/**
 * 🔁 השוואה בין חודשים ברמת "סה"כ לפוליסה" (policyCommissionSummaries)
 *
 * שודרג: אפשר בחירה בין 3 רמות השוואה:
 * 1) לפי תבנית ספציפית (כמו היום)
 * 2) לפי חברה (כל התבניות של החברה יחד – ללא בחירת תבנית)
 * 3) כל החברות יחד (לפי חודשים בלבד)
 *
 * כאשר לא בוחרים תבנית, לא נוכל לחשב % עמלה לפי productMap של התבנית.
 * במקרים אלו נחשב:
 *   – אם במסמך נשמר commissionRate → נשתמש בו
 *   – אחרת fallback: commission / premium * 100
 */

// =============== Types ===============
interface PolicySummaryDoc {
  agentId: string;
  agentCode: string;
  reportMonth: string; // YYYY-MM
  templateId: string;
  companyId: string;
  company?: string;
  policyNumberKey: string; // מנורמל בלי רווחים
  customerId: string; // 9 ספרות
  product?: string;
  totalCommissionAmount?: number;
  totalPremiumAmount?: number;
  commissionRate?: number;
  rowsCount?: number;
}

interface ComparisonRow {
  companyId: string;
  companyName?: string;
  policyNumberKey: string;
  customerId: string;
  agentCode: string;
  product?: string;
  row1: {
    commissionAmount: number;
    premiumAmount: number;
    commissionRate: number;
  } | null;
  row2: {
    commissionAmount: number;
    premiumAmount: number;
    commissionRate: number;
  } | null;
  status: "added" | "removed" | "changed" | "unchanged";
}

interface TemplateOption {
  id: string;
  companyId: string;
  companyName: string;
  type: string;
  Name?: string;
}

type LineOfBusiness = "insurance" | "pensia" | "finansim" | "mix";

// קליל – נטען רק כשבוחרים רמת השוואה לפי תבנית
 type TemplateConfigLite = {
  defaultLineOfBusiness?: LineOfBusiness;
  productMap?: Record<
    string,
    {
      aliases?: string[];
      lineOfBusiness?: LineOfBusiness;
    }
  >;
};

// =============== Helpers ===============
const normalizeLoose = (s: any) =>
  String(s ?? "").toLowerCase().trim().replace(/[\s\-_/.,'"`]+/g, " ");

function resolveRuleByProduct(product: string | undefined, tpl: TemplateConfigLite | null) {
  if (!product || !tpl?.productMap) return null;
  const rp = normalizeLoose(product);
  for (const key of Object.keys(tpl.productMap)) {
    const rule = tpl.productMap[key];
    const aliases = (rule.aliases || []).map(normalizeLoose);
    if (aliases.some((a) => a && (rp === a || rp.includes(a) || a.includes(rp)))) {
      return rule;
    }
  }
  return null;
}

function effectiveLobForProduct(
  product: string | undefined,
  tpl: TemplateConfigLite | null
): LineOfBusiness | undefined {
  const rule = resolveRuleByProduct(product, tpl);
  return rule?.lineOfBusiness ?? tpl?.defaultLineOfBusiness;
}

/** חישוב אחוז עמלה לפי LOB */
function calcRateByLob(
  commission: number,
  premium: number,
  lob?: LineOfBusiness
): number {
  if (!premium) return 0;
  if (lob === "finansim") return (commission * 12 / premium) * 100;
  return (commission / premium) * 100;
}

const toNum = (v: any): number => {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  let s = String(v).trim();
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[\s,]/g, "");
  const n = parseFloat(s);
  return (neg ? -1 : 1) * (isNaN(n) ? 0 : n);
};

const addMonths = (ym: string, delta: number) => {
  const nowLocal = new Date();
  const todayYm = `${nowLocal.getFullYear()}-${String(
    nowLocal.getMonth() + 1
  ).padStart(2, "0")}`;
  const base = ym && /^\d{4}-\d{2}$/.test(ym) ? ym : todayYm;
  const [y, m] = base.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
};

// מפתח ברירת-מחדל – כולל companyId כדי למנוע התנגשות בין חברות שונות
const composeKey = (s: {
  companyId: string;
  policyNumberKey: string;
  customerId: string;
  agentCode: string;
}) => `${s.companyId}|${s.policyNumberKey}|${s.customerId}|${s.agentCode}`;

const calcRateSimple = (commission: number, premium: number) => {
  if (!premium) return 0;
  return (commission / premium) * 100;
};

const statusOptions = [
  { value: "", label: "הצג הכל" },
  { value: "added", label: "פוליסה נוספה" },
  { value: "removed", label: "פוליסה נמחקה" },
  { value: "changed", label: "שינוי" },
  { value: "unchanged", label: "ללא שינוי" },
] as const;

// רמות השוואה
 type Scope = "template" | "company" | "all";

const CommissionComparisonByPolicy: React.FC = () => {
  const { detail } = useAuth();
  const { agents, selectedAgentId, handleAgentChange } = useFetchAgentData();

  const [scope, setScope] = useState<Scope>("template");

  const [templateId, setTemplateId] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [templateOptions, setTemplateOptions] = useState<TemplateOption[]>([]);

  const [month1, setMonth1] = useState("");
  const [month2, setMonth2] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [comparisonRows, setComparisonRows] = useState<ComparisonRow[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [agentCodeFilter, setAgentCodeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [drillStatus, setDrillStatus] = useState<string | null>(null);


  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<'warning'|'info'|'error'|'success'>('info');
  const [dialogTitle, setDialogTitle] = useState<string>('');
  const [dialogMessage, setDialogMessage] = useState<string>('');
  
  const openDialog = (
    type: 'warning'|'info'|'error'|'success',
    title: string,
    message: string
  ) => {
    setDialogType(type);
    setDialogTitle(title);
    setDialogMessage(message);
    setDialogOpen(true);
  };
  
// ספי סטייה לקלסיפיקציה של "עודכן"
const [toleranceAmount, setToleranceAmount] = useState<number>(0); // ₪
const [toleranceRate, setToleranceRate] = useState<number>(0);     // נק' אחוז

useEffect(() => {
  const loadAgentTolerance = async () => {
    if (!selectedAgentId) return;
    try {
      const uref = doc(db, 'users', selectedAgentId);
      const usnap = await getDoc(uref);
      const t = usnap.exists() ? (usnap.data() as any)?.comparisonTolerance : null;
      if (t) {
        if (typeof t.amount !== 'undefined') setToleranceAmount(Number(t.amount) || 0);
        if (typeof t.rate   !== 'undefined') setToleranceRate(Number(t.rate) || 0);
      }
    } catch (e) {
      console.warn('loadAgentTolerance failed', e);
    }
  };
  loadAgentTolerance();
}, [selectedAgentId]);

const saveAgentTolerance = async () => {
  if (!selectedAgentId) return;
  try {
    // אם תרצי ודאות מול merge, אפשר לעבור ל-setDoc(..., {merge:true})
    await updateDoc(doc(db, 'users', selectedAgentId), {
      comparisonTolerance: {
        amount: toleranceAmount,
        rate: toleranceRate,
      },
    });
  } catch (e) {
    console.warn('saveAgentTolerance failed', e);
  }
};

  // init months
  useEffect(() => {
    const nowLocal = new Date();
    const ym2 = `${nowLocal.getFullYear()}-${String(
      nowLocal.getMonth() + 1
    ).padStart(2, "0")}`;
    const ym1 = addMonths(ym2, -1);
    setMonth2(ym2);
    setMonth1(ym1);
  }, []);

  useEffect(() => {
    if (month1 && month2 && month2 < month1) setMonth2(month1);
  }, [month1, month2]);

  // fetch templates (and company names)
  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, "commissionTemplates"));
      const arr: TemplateOption[] = [];
      for (const docSnap of snap.docs) {
        const data = docSnap.data() as any;
        const companyId = data.companyId || "";
        let companyName = "";
        if (companyId) {
          const c = await getDoc(doc(db, "company", companyId)).catch(() => undefined);
          if (c && c.exists()) companyName = (c.data() as any)?.companyName || "";
        }
        arr.push({
          id: docSnap.id,
          companyId,
          companyName,
          type: data.type || "",
          Name: data.Name || "",
        });
      }
      setTemplateOptions(arr);
    })();
  }, []);

  const uniqueCompanies = useMemo(() => {
    return Array.from(
      new Map(
        templateOptions.map((t) => [t.companyId, { id: t.companyId, name: t.companyName }])
      ).values()
    );
  }, [templateOptions]);

  const filteredTemplates = useMemo(
    () => templateOptions.filter((t) => t.companyId === selectedCompanyId),
    [templateOptions, selectedCompanyId]
  );

  const agentCodes = useMemo(
    () => agents.find((a) => a.id === selectedAgentId)?.agentCodes ?? [],
    [selectedAgentId, agents]
  );

  // =============== Compare core ===============
  const handleCompare = async () => {
    await saveAgentTolerance();
    if (!selectedAgentId || !month1 || !month2) {
      // alert("יש לבחור סוכן ושני חודשים.");
      openDialog(
        'warning',
        'שדות חסרים',
        'יש לבחור סוכן ושני חודשים לפני ביצוע ההשוואה.'
      );
      return;
    }

    // אימות מינימלי לפי scope
    if (scope === "template" && (!selectedCompanyId || !templateId)) {
      // alert("ברמת 'תבנית' יש לבחור גם חברה וגם תבנית.");
      openDialog(
        'warning',
        'חברה ותבנית נדרשות',
        'ברמת "תבנית" יש לבחור גם חברה וגם תבנית.'
      );
      return;
    }
    if (scope === "company" && !selectedCompanyId) {
      // alert("ברמת 'חברה' יש לבחור חברה.");
      openDialog(
        'warning',
        'חברה נדרשת',
        'ברמת "חברה" יש לבחור חברה.'
      );
      return;
    }

    setIsLoading(true);
    const ym1 = month1.slice(0, 7);
    const ym2 = month2.slice(0, 7);

    // נטען תבנית רק אם צריך productMap/LOB
    let tpl: TemplateConfigLite | null = null;
    if (scope === "template") {
      try {
        const tplSnap = await getDoc(doc(db, "commissionTemplates", templateId));
        if (tplSnap.exists()) {
          const d = tplSnap.data() as any;
          tpl = {
            defaultLineOfBusiness: d.defaultLineOfBusiness || undefined,
            productMap: d.productMap || undefined,
          };
        }
      } catch {
        /* ignore */
      }
    }

    // ⚠️ ייתכן ותידרש אינדקס מרוכב. מצוין לפי scope למטה
    const buildQuery = (ym: string) => {
      const base: any[] = [
        where("agentId", "==", selectedAgentId),
        where("reportMonth", "==", ym),
      ];
      if (scope === "template") {
        // agentId ==, templateId ==, companyId ==, reportMonth ==
        base.push(where("templateId", "==", templateId));
        base.push(where("companyId", "==", selectedCompanyId));
      } else if (scope === "company") {
        // agentId ==, companyId ==, reportMonth ==
        base.push(where("companyId", "==", selectedCompanyId));
      } else {
        // scope === 'all' → רק לפי agentId+month
        // אין צורך בסינון נוסף
      }
      return query(collection(db, "policyCommissionSummaries"), ...base);
    };

    const [snap1, snap2] = await Promise.all([getDocs(buildQuery(ym1)), getDocs(buildQuery(ym2))]);

    const reduceSummaries = (snap: any): Record<string, PolicySummaryDoc> => {
      const map: Record<string, PolicySummaryDoc> = {};
      snap.forEach((docSnap: any) => {
        const d = docSnap.data() as PolicySummaryDoc;
        const key = composeKey({
          companyId: d.companyId,
          policyNumberKey: d.policyNumberKey,
          customerId: d.customerId,
          agentCode: String(d.agentCode || ""),
        });
        if (!map[key]) {
          map[key] = { ...d };
          map[key].totalCommissionAmount = toNum(d.totalCommissionAmount);
          map[key].totalPremiumAmount = toNum(d.totalPremiumAmount);
          map[key].commissionRate = toNum(d.commissionRate);
        } else {
          map[key].totalCommissionAmount =
            toNum(map[key].totalCommissionAmount) + toNum(d.totalCommissionAmount);
          map[key].totalPremiumAmount =
            toNum(map[key].totalPremiumAmount) + toNum(d.totalPremiumAmount);
        }
      });
      return map;
    };

    const data1 = reduceSummaries(snap1);
    const data2 = reduceSummaries(snap2);

    const allKeys = new Set([...Object.keys(data1), ...Object.keys(data2)]);

    const rows: ComparisonRow[] = Array.from(allKeys).map((k) => {
      const a = data1[k];
      const b = data2[k];
      const sample = (a || b)!;

      const aCommission = a ? toNum(a.totalCommissionAmount) : 0;
      const aPremium = a ? toNum(a.totalPremiumAmount) : 0;
      const bCommission = b ? toNum(b.totalCommissionAmount) : 0;
      const bPremium = b ? toNum(b.totalPremiumAmount) : 0;

      // חישוב שיעור עמלה
      let row1Rate = 0;
      let row2Rate = 0;
      if (scope === "template") {
        const lob1 = a ? effectiveLobForProduct(a.product, tpl) : undefined;
        const lob2 = b ? effectiveLobForProduct(b.product, tpl) : undefined;
        row1Rate = a ? calcRateByLob(aCommission, aPremium, lob1) : 0;
        row2Rate = b ? calcRateByLob(bCommission, bPremium, lob2) : 0;
      } else {
        // ללא תבנית: נשתמש בcommissionRate אם קיים, אחרת חישוב פשוט
        row1Rate = a ? toNum(a.commissionRate) || calcRateSimple(aCommission, aPremium) : 0;
        row2Rate = b ? toNum(b.commissionRate) || calcRateSimple(bCommission, bPremium) : 0;
      }

      const row1 = a
        ? {
            commissionAmount: aCommission,
            premiumAmount: aPremium,
            commissionRate: row1Rate,
          }
        : null;

      const row2 = b
        ? {
            commissionAmount: bCommission,
            premiumAmount: bPremium,
            commissionRate: row2Rate,
          }
        : null;

      let status: ComparisonRow["status"] = "unchanged";
      // if (!row1 && row2) status = "added";
      // else if (row1 && !row2) status = "removed";
      // // else if (
      //   row1 &&
      //   row2 &&
      //   (Math.round((row1.commissionAmount - row2.commissionAmount) * 100) !== 0 ||
      //     Math.round((row1.premiumAmount - row2.premiumAmount) * 100) !== 0)
      // )
      //   status = "changed";
      if (!row1 && row2) {
        status = "added";
      } else if (row1 && !row2) {
        status = "removed";
      } else if (row1 && row2) {
        const amountDiff = Math.abs(row1.commissionAmount - row2.commissionAmount);
        const rateDiff   = Math.abs(row1.commissionRate   - row2.commissionRate);
      
        // בתוך הסף בסכום?
        const amountWithin = amountDiff <= toleranceAmount;
      
        // בתוך הסף באחוז? אם toleranceRate === 0 → מתעלמים מהבדיקה (נחשב "within")
        const rateWithin = toleranceRate <= 0 ? true : rateDiff <= toleranceRate;
      
        // אם לפחות אחת מהבדיקות חורגת → changed; אחרת unchanged
        status = (amountWithin && rateWithin) ? "unchanged" : "changed";
      }
      

      return {
        companyId: sample.companyId,
        companyName: sample.company,
        policyNumberKey: sample.policyNumberKey,
        customerId: sample.customerId,
        agentCode: String(sample.agentCode || ""),
        product: sample.product,
        row1,
        row2,
        status,
      };
    });

    setComparisonRows(rows);
    // 🔽 אם אין כלל תוצאות - נציג הודעה מתאימה
if (rows.length === 0) {
  // alert('לא נמצאו תוצאות להשוואה עבור הנתונים שנבחרו.');
  openDialog(
    'info',
    'אין תוצאות להשוואה',
    'לא נמצאו תוצאות להשוואה עבור הנתונים שנבחרו.'
  );
  }
    setIsLoading(false);
  };

  // =============== Derived UI data ===============
  const filteredRows = useMemo(() => {
    return comparisonRows.filter((r) => {
      const matchesTerm =
        !searchTerm ||
        r.policyNumberKey.includes(searchTerm) ||
        r.customerId.includes(searchTerm);

      const matchesAgentCode = !agentCodeFilter || r.agentCode === agentCodeFilter;
      const matchesStatus = !statusFilter || r.status === statusFilter;
      return matchesTerm && matchesAgentCode && matchesStatus;
    });
  }, [comparisonRows, searchTerm, agentCodeFilter, statusFilter]);

  const visibleRows = useMemo(
    () => (drillStatus ? filteredRows.filter((r) => r.status === drillStatus) : filteredRows),
    [filteredRows, drillStatus]
  );

  const totals = useMemo(() => {
    const t = { c1: 0, p1: 0, c2: 0, p2: 0 };
    for (const r of visibleRows) {
      if (r.row1) {
        t.c1 += r.row1.commissionAmount;
        t.p1 += r.row1.premiumAmount;
      }
      if (r.row2) {
        t.c2 += r.row2.commissionAmount;
        t.p2 += r.row2.premiumAmount;
      }
    }
    return t;
  }, [visibleRows]);

  const statusSummary = useMemo(() => {
    return visibleRows.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [visibleRows]);

  const formatMonthDisplay = (ym: string) => {
    if (!ym) return "";
    const [y, m] = ym.split("-");
    return `${m}/${y}`;
  };

  const handleExport = () => {
    const rows = visibleRows.map((r) => ({
      "חברה": r.companyName || r.companyId,
      "מס׳ פוליסה (key)": r.policyNumberKey,
      ['ת"ז לקוח']: r.customerId,
      "מספר סוכן": r.agentCode,
      "מוצר": r.product || "",
      [`עמלה ${formatMonthDisplay(month1)}`]: r.row1 ? r.row1.commissionAmount.toFixed(2) : "",
      [`פרמיה ${formatMonthDisplay(month1)}`]: r.row1 ? r.row1.premiumAmount.toFixed(2) : "",
      [`% עמלה ${formatMonthDisplay(month1)}`]: r.row1 ? r.row1.commissionRate.toFixed(2) : "",
      [`עמלה ${formatMonthDisplay(month2)}`]: r.row2 ? r.row2.commissionAmount.toFixed(2) : "",
      [`פרמיה ${formatMonthDisplay(month2)}`]: r.row2 ? r.row2.premiumAmount.toFixed(2) : "",
      [`% עמלה ${formatMonthDisplay(month2)}`]: r.row2 ? r.row2.commissionRate.toFixed(2) : "",
      "סטטוס": (statusOptions as any).find((s: any) => s.value === r.status)?.label || r.status,
    }));

    rows.push({
      "חברה": "סה\"כ",
      "מס׳ פוליסה (key)": "",
      ['ת"ז לקוח']: "",
      "מספר סוכן": "",
      "מוצר": "",
      [`עמלה ${formatMonthDisplay(month1)}`]: totals.c1.toFixed(2),
      [`פרמיה ${formatMonthDisplay(month1)}`]: totals.p1.toFixed(2),
      [`% עמלה ${formatMonthDisplay(month1)}`]: (totals.p1 ? (totals.c1 / totals.p1) * 100 : 0).toFixed(2),
      [`עמלה ${formatMonthDisplay(month2)}`]: totals.c2.toFixed(2),
      [`פרמיה ${formatMonthDisplay(month2)}`]: totals.p2.toFixed(2),
      [`% עמלה ${formatMonthDisplay(month2)}`]: "",
      "סטטוס": "",
    } as any);

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "השוואת עמלות (פוליסה)");
    XLSX.writeFile(wb, "השוואת_עמלות_פוליסה.xlsx");
  };

  // =============== UI bits ===============
  const MonthStepper: React.FC<{
    label: string;
    value: string;
    onChange: (v: string) => void;
  }> = ({ label, value, onChange }) => (
    <div>
      <label className="block mb-1 font-semibold">{label}</label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="p-1 rounded border hover:bg-gray-100"
          title="חודש קודם"
          onClick={() => onChange(addMonths(value, -1))}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <input
          type="month"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input w-full"
        />
        <button
          type="button"
          className="p-1 rounded border hover:bg-gray-100"
          title="חודש הבא"
          onClick={() => onChange(addMonths(value, +1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  // ניקוי שדות לפי scope
  useEffect(() => {
    if (scope === "all") {
      setSelectedCompanyId("");
      setTemplateId("");
    } else if (scope === "company") {
      setTemplateId("");
    }
    setComparisonRows([]);
    setDrillStatus(null);
  }, [scope]);

  return (
    <div className="p-6 max-w-7xl mx-auto text-right">
<h1 className="text-2xl font-bold mb-4">השוואת עמלות בין חודשים (סה&quot;כ לפר פוליסה)</h1>

      {/* Scope */}
      <div className="mb-4">
        <label className="block mb-1 font-semibold">רמת השוואה:</label>
        <div className="flex flex-wrap gap-4">
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="scope"
              value="template"
              checked={scope === "template"}
              onChange={() => setScope("template")}
            />
            <span>תבנית ספציפית</span>
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="scope"
              value="company"
              checked={scope === "company"}
              onChange={() => setScope("company")}
            />
            <span>חברה (כל התבניות)</span>
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="scope"
              value="all"
              checked={scope === "all"}
              onChange={() => setScope("all")}
            />
            <span>כל החברות</span>
          </label>
        </div>
      </div>

      {/* Agent */}
      <div className="mb-4">
        <label className="block mb-1 font-semibold">בחר סוכן:</label>
        <select
          value={selectedAgentId}
          onChange={handleAgentChange}
          className="select-input w-full"
        >
          {detail?.role === "admin" && <option value="">בחר סוכן</option>}
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {/* Company */}
      {scope !== "all" && (
        <div className="mb-4">
          <label className="block font-semibold mb-1">בחר חברה:</label>
          <select
            value={selectedCompanyId}
            onChange={(e) => {
              setSelectedCompanyId(e.target.value);
              setTemplateId("");
            }}
            className="select-input w-full"
          >
            <option value="">בחר חברה</option>
            {uniqueCompanies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Template */}
      {scope === "template" && selectedCompanyId && (
        <div className="mb-4">
          <label className="block font-semibold mb-1">בחר תבנית:</label>
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="select-input w-full"
          >
            <option value="">בחר תבנית</option>
            {filteredTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.Name || t.type}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Months */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <MonthStepper label="חודש ראשון:" value={month1} onChange={setMonth1} />
        <MonthStepper label="חודש שני:" value={month2} onChange={setMonth2} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4 items-end">
  <div>
    <label className="block mb-1 font-semibold">סף סטייה בסכום עמלה (₪):</label>
    <input
      type="number"
      step="0.01"
      min="0"
      value={toleranceAmount}
      onChange={(e) => setToleranceAmount(Number(e.target.value) || 0)}
      className="input w-full"
      placeholder="למשל 5"
    />
  </div>
  <div>
    <label className="block mb-1 font-semibold">סף סטייה באחוז עמלה (נק׳ אחוז):</label>
    <input
      type="number"
      step="0.01"
      min="0"
      value={toleranceRate}
      onChange={(e) => setToleranceRate(Number(e.target.value) || 0)}
      className="input w-full"
      placeholder="למשל 0.3"
    />
  </div>
  <div className="flex sm:justify-end">
    <Button
      text={isLoading ? "טוען…" : "השווה"}
      type="primary"
      onClick={handleCompare}
      disabled={isLoading}
      className="text-lg font-bold"
    />
  </div>
</div>
<p className="text-xs text-gray-500 mb-6">
  הערכים נשמרים כברירת מחדל לסוכן, ומופעלים אוטומטית בכל ריצה.
</p>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          placeholder="חיפןש לפי תז או פוליסה"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="input w-full sm:w-1/3"
        />
        <select
          value={agentCodeFilter}
          onChange={(e) => setAgentCodeFilter(e.target.value)}
          className="select-input w-full sm:w-1/3"
        >
          <option value="">מספר סוכן</option>
          {agentCodes.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="select-input w-full sm:w-1/3"
        >
          {statusOptions.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <Button text="ייצוא לאקסל" type="secondary" onClick={handleExport} />
      </div>

      {/* Status summary */}
      {comparisonRows.length > 0 && (
        <>
          <h2 className="text-xl font-bold mb-2">סיכום לפי סטטוס</h2>
          <table className="w-full text-sm border mb-6">
            <thead>
              <tr className="bg-gray-300 text-right font-bold">
                <th className="border p-2">סטטוס</th>
                <th className="border p-2">כמות</th>
              </tr>
            </thead>
            <tbody>
              {statusOptions
                .filter((s) => s.value && (statusSummary as any)[s.value])
                .map((s) => (
                  <tr
                    key={s.value}
                    className="hover:bg-gray-100 cursor-pointer"
                    onClick={() => setDrillStatus(s.value)}
                  >
                    <td className="border p-2">{s.label}</td>
                    <td className="border p-2 text-center text-blue-600 underline">
                      {(statusSummary as any)[s.value] ?? 0}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!drillStatus && <p className="text-gray-500">בחרי סטטוס להצגת פירוט.</p>}
        </>
      )}

      {/* Detailed table */}
      {drillStatus ? (
        <>
          <button
            className="mb-4 px-4 py-2 bg-gray-500 text-white rounded"
            onClick={() => setDrillStatus(null)}
          >
            חזור לכל הסטטוסים
          </button>

          <h2 className="text-xl font-bold mb-2">
            פירוט לסטטוס: {statusOptions.find((s) => s.value === drillStatus)?.label || drillStatus}
            {" "}({visibleRows.length} שורות)
          </h2>

          <table className="w-full text-sm border">
            <thead>
              <tr className="bg-gray-200 text-right">
                <th className="border p-2">חברה</th>
                <th className="border p-2">מס׳ פוליסה (key)</th>
                <th className="border p-2">ת״ז לקוח</th>
                <th className="border p-2">מס׳ סוכן</th>
                <th className="border p-2">מוצר</th>
                <th className="border p-2">{`עמלה ${formatMonthDisplay(month1)}`}</th>
                <th className="border p-2">{`פרמיה ${formatMonthDisplay(month1)}`}</th>
                <th className="border p-2">{`% עמלה ${formatMonthDisplay(month1)}`}</th>
                <th className="border p-2">{`עמלה ${formatMonthDisplay(month2)}`}</th>
                <th className="border p-2">{`פרמיה ${formatMonthDisplay(month2)}`}</th>
                <th className="border p-2">{`% עמלה ${formatMonthDisplay(month2)}`}</th>
                <th className="border p-2">סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <tr
                  key={`${r.companyId}|${r.policyNumberKey}|${r.customerId}|${r.agentCode}`}
                  className="border"
                >
                  <td className="border p-2">{r.companyName || r.companyId}</td>
                  <td className="border p-2">{r.policyNumberKey}</td>
                  <td className="border p-2">{r.customerId}</td>
                  <td className="border p-2">{r.agentCode}</td>
                  <td className="border p-2">{r.product || "-"}</td>
                  <td className="border p-2">{r.row1 ? r.row1.commissionAmount.toFixed(2) : "-"}</td>
                  <td className="border p-2">{r.row1 ? r.row1.premiumAmount.toFixed(2) : "-"}</td>
                  <td className="border p-2">{r.row1 ? r.row1.commissionRate.toFixed(2) : "-"}</td>
                  <td className="border p-2">{r.row2 ? r.row2.commissionAmount.toFixed(2) : "-"}</td>
                  <td className="border p-2">{r.row2 ? r.row2.premiumAmount.toFixed(2) : "-"}</td>
                  <td className="border p-2">{r.row2 ? r.row2.commissionRate.toFixed(2) : "-"}</td>
                  <td className="border p-2 font-bold">
                    {statusOptions.find((s) => s.value === r.status)?.label || "—"}
                  </td>
                </tr>
              ))}

              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={12} className="text-center py-4 text-gray-500">
                    לא נמצאו שורות תואמות.
                  </td>
                </tr>
              )}

              <tr className="font-bold bg-blue-50">
              <td className="border p-2 text-right">סה&quot;כ</td>
              <td className="border p-2" colSpan={3}></td>
                <td className="border p-2"></td>
                <td className="border p-2">{totals.c1.toFixed(2)}</td>
                <td className="border p-2">{totals.p1.toFixed(2)}</td>
                <td className="border p-2">—</td>
                <td className="border p-2">{totals.c2.toFixed(2)}</td>
                <td className="border p-2">{totals.p2.toFixed(2)}</td>
                <td className="border p-2">—</td>
                <td className="border p-2"></td>
              </tr>
            </tbody>
          </table>
        </>
      ) : null}
{dialogOpen && (
  <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
    <DialogNotification
      type={dialogType}
      title={dialogTitle}
      message={dialogMessage}
      onConfirm={() => setDialogOpen(false)}
      confirmText="סגור"
      hideCancel
    />
  </div>
)}

    </div>
  );
};

export default CommissionComparisonByPolicy;
