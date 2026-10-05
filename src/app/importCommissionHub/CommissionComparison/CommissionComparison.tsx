"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { collection, getDoc, getDocs, query, where, doc, updateDoc } from "firebase/firestore";
import { useSearchParams } from "next/navigation";
import { db } from "@/lib/firebase/firebase";
import useFetchAgentData from "@/hooks/useFetchAgentData";
import { useAuth } from "@/lib/firebase/AuthContext";
import { Button } from "@/components/Button/Button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import DialogNotification from "@/components/DialogNotification";
import { postJsonCached } from "@/lib/fetchCache";
import t from "@/components/commission/summary/table.module.css";
import {
  exportPolicyTableXlsx,
  exportReconciliationXlsx,
  type ReconMeta,
  type ReconRow,
  type ReconTemplateLine,
} from "@/lib/excel/reconciliationWorkbook";

/**
 * 🔁 השוואה בין חודשים ברמת "סה"כ לפוליסה" (policyCommissionSummaries)
 *
 * בסיס החודש (monthBasis):
 *   'ym'          – חודש פרסום (ברירת מחדל). הפוליסות נשלפות דרך /api/commission-comparison/by-ym
 *                   לפי שרשרת portalImportRuns → jobIds → runId (כמו בדף המסכם).
 *   'reportMonth' – חודש דיווח (ההתנהגות הקודמת), שליפה ישירה לפי reportMonth.
 *
 * רמות השוואה:
 * 1) לפי תבנית ספציפית
 * 2) לפי חברה (כל התבניות של החברה יחד)
 * 3) כל החברות יחד
 *
 * כשלא בוחרים תבנית, % עמלה:
 *   – commissionRate מהמסמך אם קיים
 *   – אחרת commission / premium * 100
 *
 * פער: לכל פוליסה delta = עמלה בחודש ב׳ − עמלה בחודש א׳ (חסר = 0).
 * "דוח התאמה לחברה": אקסל רב-גיליונות (סיכום / הופיעו רק בחודש הראשון / הופיעו רק בחודש השני / שינוי / השוואה מלאה)
 *   עם עמודות פער כנוסחאות ושורת SUM — מוכן לשליחה לחברת הביטוח.
 *
 * פרמטרים ב-URL (לקפיצה מהדף המסכם):
 *   agentId, basis=ym|reportMonth, m1, m2, scope=template|company|all, companyId, templateId, run=1
 */

// =============== Types ===============
interface PolicySummaryDoc {
  agentId: string;
  agentCode: string;
  reportMonth: string; // YYYY-MM
  templateId: string;
  companyId: string;
  company?: string;
  policyNumberKey: string;
  customerId: string;
  product?: string;
  totalCommissionAmount?: number;
  totalPremiumAmount?: number;
  commissionRate?: number;
  rowsCount?: number;
  fullName?: string;
}

interface ComparisonRow {
  companyId: string;
  companyName?: string;
  templateId: string;
  templateName: string;
  policyNumberKey: string;
  customerId: string;
  fullName?: string;
  agentCode: string;
  product?: string;
  row1: { commissionAmount: number; premiumAmount: number; commissionRate: number } | null;
  row2: { commissionAmount: number; premiumAmount: number; commissionRate: number } | null;
  status: "added" | "removed" | "changed" | "unchanged";
  /** עמלה בחודש ב׳ − עמלה בחודש א׳ */
  delta: number;
}

type StatusKey = ComparisonRow["status"];

interface TemplateOption {
  id: string;
  companyId: string;
  companyName: string;
  type: string;
  Name?: string;
}

type LineOfBusiness = "insurance" | "pensia" | "finansim" | "mix";

type TemplateConfigLite = {
  defaultLineOfBusiness?: LineOfBusiness;
  productMap?: Record<string, { aliases?: string[]; lineOfBusiness?: LineOfBusiness }>;
};

type Scope = "template" | "company" | "all";
type MonthBasis = "ym" | "reportMonth";

const BASIS_LABEL: Record<MonthBasis, string> = { ym: "חודש פרסום", reportMonth: "חודש דיווח" };

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

function effectiveLobForProduct(product: string | undefined, tpl: TemplateConfigLite | null): LineOfBusiness | undefined {
  const rule = resolveRuleByProduct(product, tpl);
  return rule?.lineOfBusiness ?? tpl?.defaultLineOfBusiness;
}

/** חישוב אחוז עמלה לפי LOB */
function calcRateByLob(commission: number, premium: number, lob?: LineOfBusiness): number {
  if (!premium) return 0;
  if (lob === "finansim") return ((commission * 12) / premium) * 100;
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
  const todayYm = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, "0")}`;
  const base = ym && /^\d{4}-\d{2}$/.test(ym) ? ym : todayYm;
  const [y, m] = base.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const isYm = (v: string | null | undefined) => !!v && /^\d{4}-\d{2}$/.test(v);

// מפתח – חברה + דוח (תבנית) + פוליסה: כל פער משויך לדוח שממנו הגיע
const composeKey = (s: { companyId: string; templateId: string; policyNumberKey: string; customerId: string; agentCode: string }) =>
  `${s.companyId}|${s.templateId}|${s.policyNumberKey}|${s.customerId}|${s.agentCode}`;

const calcRateSimple = (commission: number, premium: number) => {
  if (!premium) return 0;
  return (commission / premium) * 100;
};

const fmtMoney = (v: number) => Number(v || 0).toLocaleString("he-IL", { maximumFractionDigits: 2 });
const fmtSigned = (v: number) => `${v > 0 ? "+" : ""}${fmtMoney(v)}`;
const deltaColor = (v: number) => (v > 0.004 ? "text-emerald-700" : v < -0.004 ? "text-red-700" : "text-slate-500");

const SCOPE_LABEL: Record<Scope, string> = { template: "תבנית", company: "חברה", all: "כל החברות" };

const statusOptions = [
  { value: "", label: "הצג הכל" },
  { value: "added", label: "הופיעה רק בחודש השני" },
  { value: "removed", label: "הופיעה רק בחודש הראשון" },
  { value: "changed", label: "שינוי" },
  { value: "unchanged", label: "ללא שינוי" },
] as const;

const CommissionComparisonByPolicy: React.FC = () => {
  const { detail } = useAuth();
  const { agents, selectedAgentId, handleAgentChange } = useFetchAgentData();
  const searchParams = useSearchParams();

  const [monthBasis, setMonthBasis] = useState<MonthBasis>("ym");
  const [scope, setScope] = useState<Scope>("template");

  const [templateId, setTemplateId] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [templateOptions, setTemplateOptions] = useState<TemplateOption[]>([]);

  const [month1, setMonth1] = useState("");
  const [month2, setMonth2] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // חודשי פרסום שיש לסוכן טעינות בהם
  const [availableYms, setAvailableYms] = useState<string[]>([]);
  const [ymsLoading, setYmsLoading] = useState(false);

  const [comparisonRows, setComparisonRows] = useState<ComparisonRow[]>([]);
  const [comparedLabel, setComparedLabel] = useState<{ basis: MonthBasis; m1: string; m2: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [agentCodeFilter, setAgentCodeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [drillStatus, setDrillStatus] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<"warning" | "info" | "error" | "success">("info");
  const [dialogTitle, setDialogTitle] = useState<string>("");
  const [dialogMessage, setDialogMessage] = useState<string>("");

  const showFilters = comparisonRows.length > 0;

  const [hekefTemplateIds, setHekefTemplateIds] = useState<Set<string>>(new Set());
  const [templateNameById, setTemplateNameById] = useState<Record<string, string>>({});
  const [templateFilter, setTemplateFilter] = useState("");
  const [templatesLoaded, setTemplatesLoaded] = useState(false);

  // ─── פרמטרים מה-URL (קפיצה מהדף המסכם) ───────────────────────────────
  const urlRef = useRef<{
    agentId: string;
    basis: MonthBasis | null;
    m1: string;
    m2: string;
    scope: Scope | null;
    companyId: string;
    templateId: string;
    run: boolean;
  } | null>(null);
  if (urlRef.current === null) {
    const b = searchParams.get("basis");
    const sc = searchParams.get("scope");
    urlRef.current = {
      agentId: searchParams.get("agentId") || "",
      basis: b === "ym" || b === "reportMonth" ? b : null,
      m1: isYm(searchParams.get("m1")) ? searchParams.get("m1")! : "",
      m2: isYm(searchParams.get("m2")) ? searchParams.get("m2")! : "",
      scope: sc === "template" || sc === "company" || sc === "all" ? sc : null,
      companyId: searchParams.get("companyId") || "",
      templateId: searchParams.get("templateId") || "",
      run: searchParams.get("run") === "1",
    };
  }
  const monthsFromUrl = !!(urlRef.current.m1 && urlRef.current.m2);
  // ערכי חברה/תבנית מה-URL שממתינים להחלה אחרי שה-scope נקבע
  const pendingSelectionRef = useRef<{ companyId: string; templateId: string } | null>(
    urlRef.current.companyId || urlRef.current.templateId
      ? { companyId: urlRef.current.companyId, templateId: urlRef.current.templateId }
      : null
  );
  const [autoRunPending, setAutoRunPending] = useState<boolean>(urlRef.current.run);

  // אחוז שינוי בין סכומי עמלה: אם הבסיס 0 והטארגט >0 → אינסוף (כל שינוי נחשב חריגה)
  const percentChange = (prev: number, curr: number) => {
    if (prev === 0) return curr === 0 ? 0 : Infinity;
    return Math.abs((curr - prev) / prev) * 100;
  };

  const openDialog = (type: "warning" | "info" | "error" | "success", title: string, message: string) => {
    setDialogType(type);
    setDialogTitle(title);
    setDialogMessage(message);
    setDialogOpen(true);
  };

  // ספי סטייה לקלסיפיקציה של "עודכן"
  const [toleranceAmount, setToleranceAmount] = useState<number>(0); // ₪
  const [toleranceRate, setToleranceRate] = useState<number>(0); // נק' אחוז

  useEffect(() => {
    const loadAgentTolerance = async () => {
      if (!selectedAgentId) return;
      try {
        const usnap = await getDoc(doc(db, "users", selectedAgentId));
        const t = usnap.exists() ? (usnap.data() as any)?.comparisonTolerance : null;
        if (t) {
          if (typeof t.amount !== "undefined") setToleranceAmount(Number(t.amount) || 0);
          if (typeof t.rate !== "undefined") setToleranceRate(Number(t.rate) || 0);
        }
      } catch {
        // ignore
      }
    };
    loadAgentTolerance();
  }, [selectedAgentId]);

  const saveAgentTolerance = async () => {
    if (!selectedAgentId) return;
    try {
      await updateDoc(doc(db, "users", selectedAgentId), {
        comparisonTolerance: { amount: toleranceAmount, rate: toleranceRate },
      });
    } catch {
      // ignore
    }
  };

  // ─── החלת פרמטרי URL: סוכן + בסיס + scope + חודשים ───────────────────
  useEffect(() => {
    const u = urlRef.current!;
    if (u.basis) setMonthBasis(u.basis);
    if (u.scope) setScope(u.scope);
    if (u.m1 && u.m2) {
      setMonth1(u.m1);
      setMonth2(u.m2);
    }
  }, []);

  useEffect(() => {
    const u = urlRef.current!;
    if (!u.agentId || !agents?.length) return;
    if (selectedAgentId !== u.agentId && agents.some((a: any) => a.id === u.agentId)) {
      handleAgentChange({ target: { value: u.agentId } } as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents]);

  // ─── ברירות מחדל לחודשים ────────────────────────────────────────────
  // חודש דיווח: לפני חודשיים / לפני חודש
  useEffect(() => {
    if (monthsFromUrl) return;
    if (monthBasis !== "reportMonth") return;
    const now = new Date();
    const todayYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    setMonth2(addMonths(todayYm, -1));
    setMonth1(addMonths(todayYm, -2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthBasis]);

  // חודש פרסום: שני חודשי הפרסום האחרונים שיש בהם טעינות
  useEffect(() => {
    let cancelled = false;
    setAvailableYms([]);
    if (!selectedAgentId) return;
    (async () => {
      setYmsLoading(true);
      try {
        const d: any = await postJsonCached("/api/commission-comparison/by-ym", { agentId: selectedAgentId, action: "listYms" }).catch(
          () => ({ yms: [] })
        );
        if (cancelled) return;
        const yms: string[] = d.yms ?? [];
        setAvailableYms(yms);
        if (monthBasis === "ym" && !monthsFromUrl && yms.length) {
          setMonth2(yms[0]);
          setMonth1(yms[1] ?? addMonths(yms[0], -1));
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setYmsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgentId]);

  // מעבר לבסיס "חודש פרסום" אחרי שהרשימה כבר נטענה → החודשים האחרונים
  const switchBasis = (b: MonthBasis) => {
    if (b === monthBasis) return;
    setMonthBasis(b);
    setComparisonRows([]);
    setComparedLabel(null);
    setDrillStatus(null);
    if (b === "ym" && availableYms.length) {
      setMonth2(availableYms[0]);
      setMonth1(availableYms[1] ?? addMonths(availableYms[0], -1));
    }
  };

  useEffect(() => {
    if (month1 && month2 && month2 < month1) setMonth2(month1);
  }, [month1, month2]);

  // ─── תבניות + שמות חברות ────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      // כל התבניות (גם לא פעילות) — לשמות הדוחות בתוצאות; לבחירה — רק פעילות
      const snap = await getDocs(collection(db, "commissionTemplates"));

      const arr: TemplateOption[] = [];
      const hekefIds = new Set<string>();
      const names: Record<string, string> = {};
      const companyNameCache = new Map<string, string>();

      for (const docSnap of snap.docs) {
        const data = docSnap.data() as any;
        names[docSnap.id] = String(data.Name || data.type || docSnap.id);
        if (data.hekefType) hekefIds.add(docSnap.id);
        if (!data.isactive) continue;
        const companyId = data.companyId || "";
        let companyName = "";

        if (companyId) {
          if (companyNameCache.has(companyId)) companyName = companyNameCache.get(companyId)!;
          else {
            const c = await getDoc(doc(db, "company", companyId)).catch(() => undefined);
            if (c && c.exists()) companyName = (c.data() as any)?.companyName || "";
            companyNameCache.set(companyId, companyName);
          }
        }

        arr.push({ id: docSnap.id, companyId, companyName, type: data.type || "", Name: data.Name || "" });
      }

      setTemplateOptions(arr);
      setHekefTemplateIds(hekefIds);
      setTemplateNameById(names);
      setTemplatesLoaded(true);
    })();
  }, []);

  const uniqueCompanies = useMemo(
    () => Array.from(new Map(templateOptions.map((t) => [t.companyId, { id: t.companyId, name: t.companyName }])).values()),
    [templateOptions]
  );

  const filteredTemplates = useMemo(
    () => templateOptions.filter((t) => t.companyId === selectedCompanyId && !hekefTemplateIds.has(t.id)),
    [templateOptions, selectedCompanyId, hekefTemplateIds]
  );

  // Agent codes that appear in the compared rows (not users.agentCodes), like CompareRealToReported.
  const agentCodes = useMemo(
    () => Array.from(new Set(comparisonRows.map((r) => r.agentCode).filter(Boolean))).sort(),
    [comparisonRows]
  );

  const ymMissing = (ym: string) => monthBasis === "ym" && !ymsLoading && availableYms.length > 0 && !!ym && !availableYms.includes(ym);

  // =============== Compare core ===============
  const fetchByReportMonth = async (ym: string): Promise<PolicySummaryDoc[]> => {
    const base: any[] = [where("agentId", "==", selectedAgentId), where("reportMonth", "==", ym)];
    if (scope === "template") {
      base.push(where("templateId", "==", templateId));
      base.push(where("companyId", "==", selectedCompanyId));
    } else if (scope === "company") {
      base.push(where("companyId", "==", selectedCompanyId));
    }
    const snap = await getDocs(query(collection(db, "policyCommissionSummaries"), ...base));
    return snap.docs.map((d) => d.data() as PolicySummaryDoc);
  };

  const fetchByYm = async (ym: string): Promise<PolicySummaryDoc[]> => {
    const d = await postJsonCached("/api/commission-comparison/by-ym", {
      agentId: selectedAgentId,
      action: "policies",
      ym,
      scope,
      companyId: selectedCompanyId,
      templateId,
    }).catch(() => {
      throw new Error(`שגיאה בשליפת חודש פרסום ${ym}`);
    });
    return (d.rows ?? []) as PolicySummaryDoc[];
  };

  const handleCompare = async () => {
    await saveAgentTolerance();
    if (!selectedAgentId || !month1 || !month2) {
      openDialog("warning", "שדות חסרים", "יש לבחור סוכן ושני חודשים לפני ביצוע ההשוואה.");
      return;
    }
    if (scope === "template" && (!selectedCompanyId || !templateId)) {
      openDialog("warning", "חברה ותבנית נדרשות", 'ברמת "תבנית" יש לבחור גם חברה וגם תבנית.');
      return;
    }
    if (scope === "company" && !selectedCompanyId) {
      openDialog("warning", "חברה נדרשת", 'ברמת "חברה" יש לבחור חברה.');
      return;
    }

    setIsLoading(true);
    setDrillStatus(null);
    const ym1 = month1.slice(0, 7);
    const ym2 = month2.slice(0, 7);

    try {
      // תבנית נטענת רק אם צריך productMap/LOB
      let tpl: TemplateConfigLite | null = null;
      if (scope === "template") {
        try {
          const tplSnap = await getDoc(doc(db, "commissionTemplates", templateId));
          if (tplSnap.exists()) {
            const d = tplSnap.data() as any;
            tpl = { defaultLineOfBusiness: d.defaultLineOfBusiness || undefined, productMap: d.productMap || undefined };
          }
        } catch {
          /* ignore */
        }
      }

      const fetcher = monthBasis === "ym" ? fetchByYm : fetchByReportMonth;
      const [docs1, docs2] = await Promise.all([fetcher(ym1), fetcher(ym2)]);

      const reduceSummaries = (docs: PolicySummaryDoc[]): Record<string, PolicySummaryDoc> => {
        const map: Record<string, PolicySummaryDoc> = {};
        docs.forEach((d) => {
          if (hekefTemplateIds.has(String(d.templateId || ""))) return;
          const key = composeKey({
            companyId: d.companyId,
            templateId: String(d.templateId || ""),
            policyNumberKey: d.policyNumberKey,
            customerId: d.customerId,
            agentCode: String(d.agentCode || ""),
          });
          if (!map[key]) {
            map[key] = {
              ...d,
              totalCommissionAmount: toNum(d.totalCommissionAmount),
              totalPremiumAmount: toNum(d.totalPremiumAmount),
              commissionRate: toNum(d.commissionRate),
            };
          } else {
            map[key].totalCommissionAmount = toNum(map[key].totalCommissionAmount) + toNum(d.totalCommissionAmount);
            map[key].totalPremiumAmount = toNum(map[key].totalPremiumAmount) + toNum(d.totalPremiumAmount);
          }
        });
        return map;
      };

      const data1 = reduceSummaries(docs1);
      const data2 = reduceSummaries(docs2);
      const allKeys = new Set([...Object.keys(data1), ...Object.keys(data2)]);

      const rows: ComparisonRow[] = Array.from(allKeys).map((k) => {
        const a = data1[k];
        const b = data2[k];
        const sample = (a || b)!;

        const aCommission = a ? toNum(a.totalCommissionAmount) : 0;
        const aPremium = a ? toNum(a.totalPremiumAmount) : 0;
        const bCommission = b ? toNum(b.totalCommissionAmount) : 0;
        const bPremium = b ? toNum(b.totalPremiumAmount) : 0;

        let row1Rate = 0;
        let row2Rate = 0;
        if (scope === "template") {
          row1Rate = a ? calcRateByLob(aCommission, aPremium, effectiveLobForProduct(a.product, tpl)) : 0;
          row2Rate = b ? calcRateByLob(bCommission, bPremium, effectiveLobForProduct(b.product, tpl)) : 0;
        } else {
          row1Rate = a ? toNum(a.commissionRate) || calcRateSimple(aCommission, aPremium) : 0;
          row2Rate = b ? toNum(b.commissionRate) || calcRateSimple(bCommission, bPremium) : 0;
        }

        const row1 = a ? { commissionAmount: aCommission, premiumAmount: aPremium, commissionRate: row1Rate } : null;
        const row2 = b ? { commissionAmount: bCommission, premiumAmount: bPremium, commissionRate: row2Rate } : null;

        let status: ComparisonRow["status"] = "unchanged";
        if (!row1 && row2) status = "added";
        else if (row1 && !row2) status = "removed";
        else if (row1 && row2) {
          const amountWithin = Math.abs(row1.commissionAmount - row2.commissionAmount) <= toleranceAmount;
          const percentWithin = percentChange(row1.commissionAmount, row2.commissionAmount) <= toleranceRate;
          status = amountWithin || percentWithin ? "unchanged" : "changed";
        }

        const tid = String(sample.templateId || "");
        return {
          companyId: sample.companyId,
          companyName: sample.company,
          templateId: tid,
          templateName: templateNameById[tid] || tid || "-",
          policyNumberKey: sample.policyNumberKey,
          customerId: sample.customerId,
          fullName: sample.fullName || "",
          agentCode: String(sample.agentCode || ""),
          product: sample.product,
          row1,
          row2,
          status,
          delta: (row2?.commissionAmount ?? 0) - (row1?.commissionAmount ?? 0),
        };
      });

      setComparisonRows(rows);
      setTemplateFilter("");
      setComparedLabel({ basis: monthBasis, m1: ym1, m2: ym2 });

      if (rows.length === 0) {
        openDialog(
          "info",
          "אין תוצאות להשוואה",
          monthBasis === "ym"
            ? "לא נמצאו טעינות לחודשי הפרסום שנבחרו. בדקי שהחודשים מופיעים ברשימת חודשי הפרסום הזמינים."
            : "לא נמצאו תוצאות להשוואה עבור הנתונים שנבחרו."
        );
      }
    } catch (e: any) {
      openDialog("error", "שגיאה בהשוואה", String(e?.message ?? e));
    } finally {
      setIsLoading(false);
    }
  };

  // ─── הרצה אוטומטית כשהגיעו מהדף המסכם (run=1) ────────────────────────
  useEffect(() => {
    if (!autoRunPending || isLoading) return;
    const u = urlRef.current!;
    const ready =
      templatesLoaded &&
      !!selectedAgentId &&
      (!u.agentId || selectedAgentId === u.agentId) &&
      !!month1 &&
      !!month2 &&
      !pendingSelectionRef.current &&
      (scope !== "template" || (!!selectedCompanyId && !!templateId)) &&
      (scope !== "company" || !!selectedCompanyId);
    if (!ready) return;
    setAutoRunPending(false);
    handleCompare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRunPending, templatesLoaded, selectedAgentId, month1, month2, scope, selectedCompanyId, templateId]);

  // =============== Derived UI data ===============
  /** כל הסינונים חוץ מהדוח — בסיס לטבלת "פערים לפי דוח" */
  const baseFilteredRows = useMemo(() => {
    return comparisonRows.filter((r) => {
      const matchesTerm =
        !searchTerm ||
        r.policyNumberKey.includes(searchTerm) ||
        r.customerId.includes(searchTerm) ||
        (r.fullName || "").includes(searchTerm);
      const matchesAgentCode = !agentCodeFilter || r.agentCode === agentCodeFilter;
      const matchesStatus = !statusFilter || r.status === statusFilter;
      return matchesTerm && matchesAgentCode && matchesStatus;
    });
  }, [comparisonRows, searchTerm, agentCodeFilter, statusFilter]);

  const filteredRows = useMemo(
    () => (templateFilter ? baseFilteredRows.filter((r) => r.templateId === templateFilter) : baseFilteredRows),
    [baseFilteredRows, templateFilter]
  );

  /** פערים לפי דוח — ממוין מהפער הגדול לקטן */
  const byTemplate = useMemo(() => {
    const m = new Map<string, ReconTemplateLine & { templateId: string }>();
    baseFilteredRows.forEach((r) => {
      let x = m.get(r.templateId);
      if (!x) {
        x = { templateId: r.templateId, company: r.companyName || r.companyId, template: r.templateName, removed: 0, added: 0, changed: 0, c1: 0, c2: 0, delta: 0 };
        m.set(r.templateId, x);
      }
      if (r.status === "removed") x.removed++;
      else if (r.status === "added") x.added++;
      else if (r.status === "changed") x.changed++;
      x.c1 += r.row1?.commissionAmount ?? 0;
      x.c2 += r.row2?.commissionAmount ?? 0;
      x.delta += r.delta;
    });
    return Array.from(m.values()).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [baseFilteredRows]);

  const templatesInResults = useMemo(
    () => byTemplate.map((x) => ({ id: x.templateId, label: `${x.company} – ${x.template}` })).sort((a, b) => a.label.localeCompare(b.label, "he")),
    [byTemplate]
  );

  const visibleRows = useMemo(
    () =>
      (drillStatus ? filteredRows.filter((r) => r.status === drillStatus) : filteredRows)
        .slice()
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
    [filteredRows, drillStatus]
  );

  const sumRows = (rows: ComparisonRow[]) => {
    const tt = { c1: 0, p1: 0, c2: 0, p2: 0, delta: 0, count: rows.length };
    for (const r of rows) {
      if (r.row1) {
        tt.c1 += r.row1.commissionAmount;
        tt.p1 += r.row1.premiumAmount;
      }
      if (r.row2) {
        tt.c2 += r.row2.commissionAmount;
        tt.p2 += r.row2.premiumAmount;
      }
      tt.delta += r.delta;
    }
    return tt;
  };

  /** סכומי הטבלה המוצגת (כולל דריל לסטטוס) */
  const totals = useMemo(() => sumRows(visibleRows), [visibleRows]);

  /** סיכום כללי + לפי סטטוס — על כל השורות המסוננות (בלי הדריל) */
  const overall = useMemo(() => sumRows(filteredRows), [filteredRows]);
  const statusStats = useMemo(() => {
    const by: Record<string, ReturnType<typeof sumRows>> = {};
    (["added", "removed", "changed", "unchanged"] as StatusKey[]).forEach((st) => {
      by[st] = sumRows(filteredRows.filter((r) => r.status === st));
    });
    return by;
  }, [filteredRows]);

  const formatMonthDisplay = (ym: string) => {
    if (!ym) return "";
    const [y, m] = ym.split("-");
    return `${m}/${y}`;
  };

  // תווית חודש לפי הבסיס של ההשוואה שבוצעה בפועל
  const shownBasis = comparedLabel?.basis ?? monthBasis;
  const shownM1 = comparedLabel?.m1 ?? month1;
  const shownM2 = comparedLabel?.m2 ?? month2;
  const monthTitle = (ym: string) => `${BASIS_LABEL[shownBasis]} ${formatMonthDisplay(ym)}`;

  const agentName = agents.find((a: any) => a.id === selectedAgentId)?.name || "";
  const scopeDescription = () => {
    const companyName = uniqueCompanies.find((c) => c.id === selectedCompanyId)?.name || "";
    const tplName = filteredTemplates.find((x) => x.id === templateId);
    if (scope === "template") return `תבנית: ${companyName} – ${tplName?.Name || tplName?.type || templateId}`;
    if (scope === "company") return `חברה: ${companyName}`;
    return "כל החברות";
  };

  // ─── אקסל (exceljs, מעוצב) ─────────────────────────────────────────
  const statusLabel = (st: string) => (statusOptions as any).find((o: any) => o.value === st)?.label || st;

  const toReconRow = (r: ComparisonRow): ReconRow => ({
    company: r.companyName || r.companyId,
    template: r.templateName,
    policy: r.policyNumberKey,
    customerId: r.customerId,
    fullName: r.fullName || "",
    agentCode: r.agentCode,
    product: r.product || "",
    p1: r.row1 ? r.row1.premiumAmount : null,
    c1: r.row1 ? r.row1.commissionAmount : null,
    r1: r.row1 ? r.row1.commissionRate : null,
    p2: r.row2 ? r.row2.premiumAmount : null,
    c2: r.row2 ? r.row2.commissionAmount : null,
    r2: r.row2 ? r.row2.commissionRate : null,
    delta: r.delta,
    statusLabel: statusLabel(r.status),
  });

  const buildMeta = (): ReconMeta => ({
    title: "דוח התאמת עמלות — השוואה לפי פוליסה",
    agentName,
    basisLabel: BASIS_LABEL[shownBasis],
    m1Label: monthTitle(shownM1),
    m2Label: monthTitle(shownM2),
    scopeLabel: scopeDescription(),
    toleranceLabel: `${toleranceAmount} ₪ או ${toleranceRate}%`,
    filterLabel:
      [
        searchTerm && `חיפוש: ${searchTerm}`,
        agentCodeFilter && `מספר סוכן: ${agentCodeFilter}`,
        templateFilter && `דוח: ${templateNameById[templateFilter] || templateFilter}`,
      ]
        .filter(Boolean)
        .join(" · ") || undefined,
  });

  const safeName = (v: string) => v.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "_");
  const basisTag = () => (shownBasis === "ym" ? "פרסום" : "דיווח");

  /** דוח התאמה לחברה — סיכום + הופיעו רק בחודש הראשון + הופיעו רק בחודש השני + שינוי + השוואה מלאה */
  const exportReconciliation = async () => {
    if (!comparisonRows.length || exporting) return;
    setExporting(true);
    try {
      const rows = filteredRows.slice().sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
      const by = (st: StatusKey) => rows.filter((r) => r.status === st).map(toReconRow);
      await exportReconciliationXlsx({
        meta: buildMeta(),
        statusLines: (["removed", "added", "changed", "unchanged"] as StatusKey[]).map((st) => ({
          label: statusLabel(st),
          count: statusStats[st].count,
          c1: statusStats[st].c1,
          c2: statusStats[st].c2,
          delta: statusStats[st].delta,
        })),
        total: { label: 'סה"כ', count: overall.count, c1: overall.c1, c2: overall.c2, delta: overall.delta },
        byTemplate: (templateFilter ? byTemplate.filter((x) => x.templateId === templateFilter) : byTemplate)
          .filter((x) => x.removed || x.added || x.changed || Math.abs(x.delta) > 0.004)
          .map(({ templateId: _t, ...x }) => x),
        removed: by("removed"),
        added: by("added"),
        changed: by("changed"),
        all: rows.map(toReconRow),
        fileName: `דוח_התאמה_${safeName(agentName || "סוכן")}_${basisTag()}_${shownM1}_מול_${shownM2}.xlsx`,
      });
    } catch (e: any) {
      openDialog("error", "שגיאה ביצירת הקובץ", String(e?.message ?? e));
    } finally {
      setExporting(false);
    }
  };

  /** ייצוא הטבלה המוצגת בלבד (לפי הסטטוס שנבחר) */
  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await exportPolicyTableXlsx({
        meta: buildMeta(),
        sheetName: drillStatus ? statusLabel(drillStatus).slice(0, 31) : "השוואת עמלות",
        rows: visibleRows.map(toReconRow),
        fileName: `השוואת_עמלות_${basisTag()}_${shownM1}_${shownM2}${drillStatus ? `_${safeName(statusLabel(drillStatus))}` : ""}.xlsx`,
      });
    } catch (e: any) {
      openDialog("error", "שגיאה ביצירת הקובץ", String(e?.message ?? e));
    } finally {
      setExporting(false);
    }
  };

  // =============== UI bits ===============
  const MonthStepper: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => (
    <div>
      <label className="block mb-1 font-semibold">{label}</label>
      <div className="flex items-center gap-2">
        <button type="button" className="p-1 rounded border hover:bg-gray-100" title="חודש קודם" onClick={() => onChange(addMonths(value, -1))}>
          <ChevronRight className="h-4 w-4" />
        </button>
        <input
          type="month"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`input w-full ${ymMissing(value) ? "border-amber-400" : ""}`}
        />
        <button type="button" className="p-1 rounded border hover:bg-gray-100" title="חודש הבא" onClick={() => onChange(addMonths(value, +1))}>
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>
      {ymMissing(value) && <div className="text-xs text-amber-700 mt-1">אין טעינות לחודש פרסום זה</div>}
    </div>
  );

  // ניקוי שדות לפי scope (אלא אם יש בחירה שממתינה מה-URL)
  useEffect(() => {
    const pending = pendingSelectionRef.current;
    if (pending) {
      pendingSelectionRef.current = null;
      setSelectedCompanyId(scope === "all" ? "" : pending.companyId);
      setTemplateId(scope === "template" ? pending.templateId : "");
    } else if (scope === "all") {
      setSelectedCompanyId("");
      setTemplateId("");
    } else if (scope === "company") {
      setTemplateId("");
    }
    setComparisonRows([]);
    setComparedLabel(null);
    setDrillStatus(null);
  }, [scope]);

  return (
    <div className="p-6 w-full max-w-[1800px] mx-auto text-right min-w-0 overflow-x-hidden">
      <h1 className="text-2xl font-bold mb-4">השוואת עמלות בין חודשים (סה&quot;כ לפר פוליסה)</h1>

      {/* Month basis */}
      <div className="mb-4">
        <label className="block mb-1 font-semibold">השוואה לפי:</label>
        <div className="inline-flex bg-slate-100 rounded-lg p-1 text-sm">
          {(["ym", "reportMonth"] as MonthBasis[]).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => switchBasis(b)}
              className={`px-4 py-1.5 rounded-md font-bold transition ${
                monthBasis === b ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {BASIS_LABEL[b]}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {monthBasis === "ym"
            ? "כל מה שפורסם בחודש — כמו בטבלת \"לפי חודש פרסום\" בדף המסכם."
            : "לפי חודש הדיווח שבתוך הקובץ."}
        </p>
      </div>

      {/* Scope */}
      <div className="mb-4">
        <label className="block mb-1 font-semibold">רמת השוואה:</label>
        <div className="flex flex-wrap gap-4">
          {(
            [
              ["template", "תבנית ספציפית"],
              ["company", "חברה (כל התבניות)"],
              ["all", "כל החברות"],
            ] as const
          ).map(([v, label]) => (
            <label key={v} className="inline-flex items-center gap-2">
              <input type="radio" name="scope" value={v} checked={scope === v} onChange={() => setScope(v)} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Agent */}
      <div className="mb-4">
        <label className="block mb-1 font-semibold">בחר סוכן:</label>
        <select value={selectedAgentId} onChange={handleAgentChange} className="select-input w-full">
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
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="select-input w-full">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-2">
        <MonthStepper label={`${BASIS_LABEL[monthBasis]} ראשון:`} value={month1} onChange={setMonth1} />
        <MonthStepper label={`${BASIS_LABEL[monthBasis]} שני:`} value={month2} onChange={setMonth2} />
      </div>
      {monthBasis === "ym" && (
        <div className="mb-4 text-xs text-gray-500">
          {ymsLoading ? (
            "טוען חודשי פרסום…"
          ) : availableYms.length ? (
            <>
              חודשי פרסום עם טעינות:{" "}
              {availableYms.slice(0, 12).map((ym, i) => (
                <React.Fragment key={ym}>
                  {i > 0 && " · "}
                  <span className="tabular-nums">{ym}</span>
                </React.Fragment>
              ))}
            </>
          ) : selectedAgentId ? (
            "לא נמצאו טעינות עם חודש פרסום לסוכן זה."
          ) : null}
        </div>
      )}

      {/* Tolerances + Compare */}
      <div className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-44">
            <label className="block mb-1 text-sm font-medium">סף סטייה בסכום עמלה (₪)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={toleranceAmount}
              onChange={(e) => setToleranceAmount(Number(e.target.value) || 0)}
              className="input text-sm h-9 px-2 w-full text-right"
              placeholder="למשל 5"
            />
          </div>
          <div className="w-48">
            <label className="block mb-1 text-sm font-medium">סף סטייה באחוז שינוי בעמלה (%)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={toleranceRate}
              onChange={(e) => setToleranceRate(Number(e.target.value) || 0)}
              className="input text-sm h-9 px-2 w-full text-right"
              placeholder="למשל 0.3"
            />
          </div>
          <div className="self-end">
            <Button
              text={isLoading ? "טוען…" : "השווה"}
              type="primary"
              onClick={handleCompare}
              disabled={isLoading || !templatesLoaded}
              className="h-9 px-5 text-sm font-bold rounded-lg shadow-sm"
            />
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">הערכים נשמרים כברירת מחדל לסוכן, ומופעלים אוטומטית בכל ריצה.</p>
      </div>

      {showFilters && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <input
            type="text"
            placeholder="חיפוש לפי ת״ז, שם או פוליסה"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input w-full min-w-0 text-right"
          />
          <select value={agentCodeFilter} onChange={(e) => setAgentCodeFilter(e.target.value)} className="select-input w-full min-w-0 truncate">
            <option value="">מספר סוכן</option>
            {agentCodes.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
          <select value={templateFilter} onChange={(e) => setTemplateFilter(e.target.value)} className="select-input w-full min-w-0 truncate">
            <option value="">כל הדוחות</option>
            {templatesInResults.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="select-input w-full min-w-0 truncate">
            {statusOptions.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Loading */}
      {(isLoading || autoRunPending) && comparisonRows.length === 0 && (
        <div className="my-6 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-6 flex items-center gap-4" role="status" aria-live="polite">
          <div className="h-10 w-10 shrink-0 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin" />
          <div>
            <div className="font-bold text-indigo-900">
              {month1 && month2
                ? `טוענת השוואה: ${BASIS_LABEL[monthBasis]} ${formatMonthDisplay(month1)} מול ${formatMonthDisplay(month2)}`
                : "טוענת השוואה…"}
            </div>
            <div className="text-sm text-indigo-700/80 mt-0.5">
              {isLoading
                ? "שולפת את הפוליסות של שני החודשים ומחשבת פערים — זה יכול לקחת כמה שניות."
                : !templatesLoaded
                ? "טוענת תבניות וחברות…"
                : !selectedAgentId || !month1 || !month2
                ? "טוענת סוכן וחודשים…"
                : "מכינה את ההשוואה…"}
            </div>
          </div>
        </div>
      )}

      {/* Summary */}
      {comparisonRows.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="text-xl font-bold">
              {monthTitle(shownM1)} מול {monthTitle(shownM2)}
            </h2>
            <button
              type="button"
              onClick={exportReconciliation}
              disabled={exporting}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-sm disabled:opacity-60"
              title="אקסל עם גיליונות: סיכום, הופיעו רק בחודש הראשון, הופיעו רק בחודש השני, שינוי בעמלה, השוואה מלאה"
            >
              {exporting ? "⏳ מכינה קובץ…" : "📑 דוח התאמה לחברה (אקסל)"}
            </button>
          </div>

          {/* KPI */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
            <div className="bg-white border rounded-xl p-3">
              <div className="text-xs text-slate-500 font-bold">עמלה · {monthTitle(shownM1)}</div>
              <div className="text-lg font-black text-slate-800 tabular-nums">{fmtMoney(overall.c1)} ₪</div>
            </div>
            <div className="bg-white border rounded-xl p-3">
              <div className="text-xs text-slate-500 font-bold">עמלה · {monthTitle(shownM2)}</div>
              <div className="text-lg font-black text-slate-800 tabular-nums">{fmtMoney(overall.c2)} ₪</div>
            </div>
            <div className="bg-white border rounded-xl p-3">
              <div className="text-xs text-slate-500 font-bold">פער כולל</div>
              <div className={`text-lg font-black tabular-nums ${deltaColor(overall.delta)}`}>{fmtSigned(overall.delta)} ₪</div>
            </div>
            <button
              type="button"
              onClick={() => setDrillStatus("removed")}
              className="text-right bg-red-50 border border-red-100 rounded-xl p-3 hover:bg-red-100"
            >
              <div className="text-xs text-red-700 font-bold">הופיעו רק בחודש הראשון · {statusStats.removed.count} פוליסות</div>
              <div className="text-lg font-black text-red-700 tabular-nums">{fmtSigned(statusStats.removed.delta)} ₪</div>
            </button>
            <button
              type="button"
              onClick={() => setDrillStatus("added")}
              className="text-right bg-emerald-50 border border-emerald-100 rounded-xl p-3 hover:bg-emerald-100"
            >
              <div className="text-xs text-emerald-700 font-bold">הופיעו רק בחודש השני · {statusStats.added.count} פוליסות</div>
              <div className="text-lg font-black text-emerald-700 tabular-nums">{fmtSigned(statusStats.added.delta)} ₪</div>
            </button>
          </div>

          {/* Gaps by report */}
          {byTemplate.length > 0 && (
            <div className="mb-6">
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="text-base font-bold">פערים לפי דוח</h3>
                <span className="text-xs text-slate-500">
                  {templateFilter ? (
                    <button type="button" onClick={() => setTemplateFilter("")} className="text-indigo-700 hover:underline">
                      × הצג את כל הדוחות
                    </button>
                  ) : (
                    "לחצי על דוח כדי למקד את כל ההשוואה בו"
                  )}
                </span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className={`${t.cleanTable} text-[13px] whitespace-nowrap`}>
                  <thead>
                    <tr>
                      <th className="px-3 py-2">חברה</th>
                      <th className="px-3 py-2">דוח</th>
                      <th className={`px-3 py-2 ${t.center}`}>רק בחודש הראשון</th>
                      <th className={`px-3 py-2 ${t.center}`}>רק בחודש השני</th>
                      <th className={`px-3 py-2 ${t.center}`}>שינוי</th>
                      <th className={`px-3 py-2 ${t.center}`}>עמלה · {monthTitle(shownM1)}</th>
                      <th className={`px-3 py-2 ${t.center}`}>עמלה · {monthTitle(shownM2)}</th>
                      <th className={`px-3 py-2 ${t.center}`}>פער עמלה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byTemplate.map((x) => {
                      const active = templateFilter === x.templateId;
                      return (
                        <tr
                          key={x.templateId}
                          onClick={() => setTemplateFilter(active ? "" : x.templateId)}
                          className={`cursor-pointer ${active ? "bg-indigo-50" : ""}`}
                        >
                          <td className="px-3 py-1.5">{x.company}</td>
                          <td className="px-3 py-1.5 font-semibold text-indigo-700">{x.template}</td>
                          <td className={`px-3 py-1.5 tabular-nums ${x.removed ? "text-red-700 font-bold" : "text-slate-400"} ${t.center}`}>{x.removed || "-"}</td>
                          <td className={`px-3 py-1.5 tabular-nums ${x.added ? "text-emerald-700 font-bold" : "text-slate-400"} ${t.center}`}>{x.added || "-"}</td>
                          <td className={`px-3 py-1.5 tabular-nums ${x.changed ? "text-amber-700 font-bold" : "text-slate-400"} ${t.center}`}>{x.changed || "-"}</td>
                          <td className={`px-3 py-1.5 tabular-nums ${t.center}`}>{fmtMoney(x.c1)}</td>
                          <td className={`px-3 py-1.5 tabular-nums ${t.center}`}>{fmtMoney(x.c2)}</td>
                          <td className={`px-3 py-1.5 tabular-nums font-bold ${deltaColor(x.delta)} ${t.center}`}>{fmtSigned(x.delta)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Status table */}
          <h3 className="text-base font-bold mb-2">סיכום לפי סטטוס</h3>
          <table className={`${t.cleanTable} text-sm mb-6`}>
            <thead>
              <tr>
                <th className="px-3 py-2">סטטוס</th>
                <th className={`px-3 py-2 ${t.center}`}>פוליסות</th>
                <th className={`px-3 py-2 ${t.center}`}>עמלה · {monthTitle(shownM1)}</th>
                <th className={`px-3 py-2 ${t.center}`}>עמלה · {monthTitle(shownM2)}</th>
                <th className={`px-3 py-2 ${t.center}`}>פער עמלה</th>
              </tr>
            </thead>
            <tbody>
              {(["removed", "added", "changed", "unchanged"] as StatusKey[])
                .filter((st) => statusStats[st].count)
                .map((st) => {
                  const x = statusStats[st];
                  return (
                    <tr
                      key={st}
                      className={`cursor-pointer ${drillStatus === st ? "bg-indigo-50" : ""}`}
                      onClick={() => setDrillStatus(st)}
                    >
                      <td className="px-3 py-2 font-semibold text-indigo-700">{statusOptions.find((o) => o.value === st)?.label}</td>
                      <td className={`px-3 py-2 tabular-nums ${t.center}`}>{x.count}</td>
                      <td className={`px-3 py-2 tabular-nums ${t.center}`}>{fmtMoney(x.c1)}</td>
                      <td className={`px-3 py-2 tabular-nums ${t.center}`}>{fmtMoney(x.c2)}</td>
                      <td className={`px-3 py-2 tabular-nums font-bold ${deltaColor(x.delta)} ${t.center}`}>{fmtSigned(x.delta)}</td>
                    </tr>
                  );
                })}
            </tbody>
            <tfoot>
              <tr>
                <td className="px-3 py-2">סה&quot;כ</td>
                <td className={`px-3 py-2 tabular-nums ${t.center}`}>{overall.count}</td>
                <td className={`px-3 py-2 tabular-nums ${t.center}`}>{fmtMoney(overall.c1)}</td>
                <td className={`px-3 py-2 tabular-nums ${t.center}`}>{fmtMoney(overall.c2)}</td>
                <td className={`px-3 py-2 tabular-nums ${deltaColor(overall.delta)} ${t.center}`}>{fmtSigned(overall.delta)}</td>
              </tr>
            </tfoot>
          </table>
          {statusStats.removed.count > 0 && (
            <p className="text-sm text-slate-600 -mt-4 mb-6 leading-relaxed">
              <b>&quot;הופיעה רק בחודש הראשון&quot;</b> אינה בהכרח פוליסה שבוטלה — ייתכן שהעמלה עליה לא שולמה, נדחתה לחודש אחר או טרם הגיעה.
              כדאי לברר מול החברה.
            </p>
          )}

          {!drillStatus && <p className="text-gray-500 mb-4">לחצי על סטטוס להצגת הפוליסות.</p>}
        </>
      )}

      {/* Detailed table */}
      {drillStatus ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <button className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50" onClick={() => setDrillStatus(null)}>
                → כל הסטטוסים
              </button>
              <h2 className="text-lg font-bold">
                {statusOptions.find((o) => o.value === drillStatus)?.label || drillStatus} · {visibleRows.length} פוליסות · פער{" "}
                <span className={deltaColor(totals.delta)}>{fmtSigned(totals.delta)} ₪</span>
              </h2>
            </div>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="text-sm px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-60"
            >
              {exporting ? "מכינה קובץ…" : "ייצוא הטבלה הזו"}
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className={`${t.cleanTable} text-[13px] whitespace-nowrap`}>
              <thead>
                <tr>
                  <th className="px-2 py-2" rowSpan={2}>חברה</th>
                  <th className="px-2 py-2" rowSpan={2}>דוח</th>
                  <th className={`px-2 py-2 ${t.center}`} rowSpan={2}>פוליסה</th>
                  <th className={`px-2 py-2 ${t.center}`} rowSpan={2}>ת״ז</th>
                  <th className="px-2 py-2" rowSpan={2}>לקוח</th>
                  <th className={`px-2 py-2 ${t.center}`} rowSpan={2}>מס׳ סוכן</th>
                  <th className={`px-2 py-2 ${t.center}`} rowSpan={2}>מוצר</th>
                  <th className={`px-2 py-2 ${t.center}`} colSpan={3}>{monthTitle(shownM1)}</th>
                  <th className={`px-2 py-2 ${t.center}`} colSpan={3}>{monthTitle(shownM2)}</th>
                  <th className={`px-2 py-2 ${t.center}`} rowSpan={2}>פער עמלה</th>
                  <th className={`px-2 py-2 ${t.center}`} rowSpan={2}>סטטוס</th>
                </tr>
                <tr>
                  <th className={`px-2 py-1.5 ${t.center}`}>פרמיה</th>
                  <th className={`px-2 py-1.5 ${t.center}`}>עמלה</th>
                  <th className={`px-2 py-1.5 ${t.center}`}>%</th>
                  <th className={`px-2 py-1.5 ${t.center}`}>פרמיה</th>
                  <th className={`px-2 py-1.5 ${t.center}`}>עמלה</th>
                  <th className={`px-2 py-1.5 ${t.center}`}>%</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => (
                  <tr key={`${r.companyId}|${r.templateId}|${r.policyNumberKey}|${r.customerId}|${r.agentCode}`}>
                    <td className="px-2 py-1.5">{r.companyName || r.companyId}</td>
                    <td className="px-2 py-1.5 text-xs text-indigo-800">{r.templateName}</td>
                    <td className={`px-2 py-1.5 font-mono text-xs ${t.center}`}>{r.policyNumberKey}</td>
                    <td className={`px-2 py-1.5 tabular-nums ${t.center}`}>{r.customerId}</td>
                    <td className="px-2 py-1.5 font-semibold">{r.fullName || "-"}</td>
                    <td className={`px-2 py-1.5 tabular-nums ${t.center}`}>{r.agentCode}</td>
                    <td className={`px-2 py-1.5 text-gray-500 ${t.center}`}>{r.product || "-"}</td>
                    <td className={`px-2 py-1.5 tabular-nums bg-sky-50/60 ${t.center}`}>{r.row1 ? fmtMoney(r.row1.premiumAmount) : "-"}</td>
                    <td className={`px-2 py-1.5 tabular-nums bg-sky-50/60 font-semibold ${t.center}`}>{r.row1 ? fmtMoney(r.row1.commissionAmount) : "-"}</td>
                    <td className={`px-2 py-1.5 tabular-nums bg-sky-50/60 text-gray-500 ${t.center}`}>{r.row1 ? r.row1.commissionRate.toFixed(2) : "-"}</td>
                    <td className={`px-2 py-1.5 tabular-nums bg-emerald-50/60 ${t.center}`}>{r.row2 ? fmtMoney(r.row2.premiumAmount) : "-"}</td>
                    <td className={`px-2 py-1.5 tabular-nums bg-emerald-50/60 font-semibold ${t.center}`}>{r.row2 ? fmtMoney(r.row2.commissionAmount) : "-"}</td>
                    <td className={`px-2 py-1.5 tabular-nums bg-emerald-50/60 text-gray-500 ${t.center}`}>{r.row2 ? r.row2.commissionRate.toFixed(2) : "-"}</td>
                    <td className={`px-2 py-1.5 tabular-nums font-bold ${deltaColor(r.delta)} ${t.center}`}>{fmtSigned(r.delta)}</td>
                    <td className={`px-2 py-1.5 ${t.center}`}>{statusOptions.find((o) => o.value === r.status)?.label || "—"}</td>
                  </tr>
                ))}
                {visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={15} className="text-center py-4 text-gray-500">
                      לא נמצאו שורות תואמות.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td className="px-2 py-2" colSpan={7}>
                    סה״כ
                  </td>
                  <td className={`px-2 py-2 tabular-nums ${t.center}`}>{fmtMoney(totals.p1)}</td>
                  <td className={`px-2 py-2 tabular-nums ${t.center}`}>{fmtMoney(totals.c1)}</td>
                  <td className={`px-2 py-2 ${t.center}`}>—</td>
                  <td className={`px-2 py-2 tabular-nums ${t.center}`}>{fmtMoney(totals.p2)}</td>
                  <td className={`px-2 py-2 tabular-nums ${t.center}`}>{fmtMoney(totals.c2)}</td>
                  <td className={`px-2 py-2 ${t.center}`}>—</td>
                  <td className={`px-2 py-2 tabular-nums ${deltaColor(totals.delta)} ${t.center}`}>{fmtSigned(totals.delta)}</td>
                  <td className="px-2 py-2" />
                </tr>
              </tfoot>
            </table>
          </div>
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