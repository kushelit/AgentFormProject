"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { collection, getDoc, getDocs, query, where, doc, updateDoc } from "firebase/firestore";
import { useSearchParams } from "next/navigation";
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
  policyNumberKey: string;
  customerId: string;
  fullName?: string;
  agentCode: string;
  product?: string;
  row1: { commissionAmount: number; premiumAmount: number; commissionRate: number } | null;
  row2: { commissionAmount: number; premiumAmount: number; commissionRate: number } | null;
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

// מפתח – כולל companyId כדי למנוע התנגשות בין חברות שונות
const composeKey = (s: { companyId: string; policyNumberKey: string; customerId: string; agentCode: string }) =>
  `${s.companyId}|${s.policyNumberKey}|${s.customerId}|${s.agentCode}`;

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

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<"warning" | "info" | "error" | "success">("info");
  const [dialogTitle, setDialogTitle] = useState<string>("");
  const [dialogMessage, setDialogMessage] = useState<string>("");

  const showFilters = comparisonRows.length > 0;

  const [hekefTemplateIds, setHekefTemplateIds] = useState<Set<string>>(new Set());
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
        const res = await fetch("/api/commission-comparison/by-ym", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId: selectedAgentId, action: "listYms" }),
        });
        const d = res.ok ? await res.json() : { yms: [] };
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
      const snap = await getDocs(query(collection(db, "commissionTemplates"), where("isactive", "==", true)));

      const arr: TemplateOption[] = [];
      const hekefIds = new Set<string>();

      for (const docSnap of snap.docs) {
        const data = docSnap.data() as any;
        const companyId = data.companyId || "";
        let companyName = "";

        if (companyId) {
          const c = await getDoc(doc(db, "company", companyId)).catch(() => undefined);
          if (c && c.exists()) companyName = (c.data() as any)?.companyName || "";
        }

        arr.push({ id: docSnap.id, companyId, companyName, type: data.type || "", Name: data.Name || "" });
        if (data.hekefType) hekefIds.add(docSnap.id);
      }

      setTemplateOptions(arr);
      setHekefTemplateIds(hekefIds);
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

  const agentCodes = useMemo(() => agents.find((a) => a.id === selectedAgentId)?.agentCodes ?? [], [selectedAgentId, agents]);

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
    const res = await fetch("/api/commission-comparison/by-ym", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: selectedAgentId,
        action: "policies",
        ym,
        scope,
        companyId: selectedCompanyId,
        templateId,
      }),
    });
    if (!res.ok) throw new Error(`שגיאה בשליפת חודש פרסום ${ym}`);
    const d = await res.json();
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

        return {
          companyId: sample.companyId,
          companyName: sample.company,
          policyNumberKey: sample.policyNumberKey,
          customerId: sample.customerId,
          fullName: sample.fullName || "",
          agentCode: String(sample.agentCode || ""),
          product: sample.product,
          row1,
          row2,
          status,
        };
      });

      setComparisonRows(rows);
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
  const filteredRows = useMemo(() => {
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

  const statusSummary = useMemo(
    () =>
      visibleRows.reduce((acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    [visibleRows]
  );

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

  const handleExport = () => {
    const rows = visibleRows.map((r) => ({
      "חברה": r.companyName || r.companyId,
      "מס׳ פוליסה (key)": r.policyNumberKey,
      ['ת"ז לקוח']: r.customerId,
      ["שם לקוח"]: r.fullName || "",
      "מספר סוכן": r.agentCode,
      "מוצר": r.product || "",
      [`עמלה ${monthTitle(shownM1)}`]: r.row1 ? r.row1.commissionAmount.toFixed(2) : "",
      [`פרמיה ${monthTitle(shownM1)}`]: r.row1 ? r.row1.premiumAmount.toFixed(2) : "",
      [`% עמלה ${monthTitle(shownM1)}`]: r.row1 ? r.row1.commissionRate.toFixed(2) : "",
      [`עמלה ${monthTitle(shownM2)}`]: r.row2 ? r.row2.commissionAmount.toFixed(2) : "",
      [`פרמיה ${monthTitle(shownM2)}`]: r.row2 ? r.row2.premiumAmount.toFixed(2) : "",
      [`% עמלה ${monthTitle(shownM2)}`]: r.row2 ? r.row2.commissionRate.toFixed(2) : "",
      "סטטוס": (statusOptions as any).find((s: any) => s.value === r.status)?.label || r.status,
    }));

    rows.push({
      "חברה": 'סה"כ',
      "מס׳ פוליסה (key)": "",
      ['ת"ז לקוח']: "",
      ["שם לקוח"]: "",
      "מספר סוכן": "",
      "מוצר": "",
      [`עמלה ${monthTitle(shownM1)}`]: totals.c1.toFixed(2),
      [`פרמיה ${monthTitle(shownM1)}`]: totals.p1.toFixed(2),
      [`% עמלה ${monthTitle(shownM1)}`]: (totals.p1 ? (totals.c1 / totals.p1) * 100 : 0).toFixed(2),
      [`עמלה ${monthTitle(shownM2)}`]: totals.c2.toFixed(2),
      [`פרמיה ${monthTitle(shownM2)}`]: totals.p2.toFixed(2),
      [`% עמלה ${monthTitle(shownM2)}`]: "",
      "סטטוס": "",
    } as any);

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "השוואת עמלות (פוליסה)");
    XLSX.writeFile(wb, `השוואת_עמלות_${shownBasis === "ym" ? "פרסום" : "דיווח"}_${shownM1}_${shownM2}.xlsx`);
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
    <div className="p-6 max-w-7xl mx-auto text-right">
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
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <input
            type="text"
            placeholder="חיפוש לפי ת״ז, שם או פוליסה"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input w-full sm:w-1/3 text-right"
          />
          <select value={agentCodeFilter} onChange={(e) => setAgentCodeFilter(e.target.value)} className="select-input w-full sm:w-1/3">
            <option value="">מספר סוכן</option>
            {agentCodes.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="select-input w-full sm:w-1/3">
            {statusOptions.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <Button text="ייצוא לאקסל" type="secondary" onClick={handleExport} />
        </div>
      )}

      {/* Status summary */}
      {comparisonRows.length > 0 && (
        <>
          <h2 className="text-xl font-bold mb-2">
            סיכום לפי סטטוס · {monthTitle(shownM1)} מול {monthTitle(shownM2)}
          </h2>
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
                  <tr key={s.value} className="hover:bg-gray-100 cursor-pointer" onClick={() => setDrillStatus(s.value)}>
                    <td className="border p-2">{s.label}</td>
                    <td className="border p-2 text-center text-blue-600 underline">{(statusSummary as any)[s.value] ?? 0}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!drillStatus && <p className="text-gray-500">בחר סטטוס להצגת פירוט.</p>}
        </>
      )}

      {/* Detailed table */}
      {drillStatus ? (
        <>
          <button className="mb-4 px-4 py-2 bg-gray-500 text-white rounded" onClick={() => setDrillStatus(null)}>
            חזור לכל הסטטוסים
          </button>

          <h2 className="text-xl font-bold mb-2">
            פירוט לסטטוס: {statusOptions.find((s) => s.value === drillStatus)?.label || drillStatus} ({visibleRows.length} שורות)
          </h2>

          <table className="w-full text-sm border rounded-lg overflow-hidden">
            <thead>
              <tr className="bg-gray-100 text-right">
                <th className="border p-2 align-bottom">חברה</th>
                <th className="border p-2 align-bottom">מס׳ פוליסה (key)</th>
                <th className="border p-2 align-bottom">ת״ז לקוח</th>
                <th className="border p-2 align-bottom">שם לקוח</th>
                <th className="border p-2 align-bottom">מס׳ סוכן</th>
                <th className="border p-2 align-bottom">מוצר</th>
                <th className="border p-2 text-center font-bold bg-sky-50" colSpan={3}>
                  {monthTitle(shownM1)}
                </th>
                <th className="w-1 bg-sky-200/50" aria-hidden />
                <th className="border p-2 text-center font-bold bg-emerald-50" colSpan={3}>
                  {monthTitle(shownM2)}
                </th>
                <th className="border p-2 align-bottom">סטטוס</th>
              </tr>
              <tr className="bg-gray-200 text-right">
                <th className="border p-2"></th>
                <th className="border p-2"></th>
                <th className="border p-2"></th>
                <th className="border p-2"></th>
                <th className="border p-2"></th>
                <th className="border p-2"></th>
                <th className="border p-2 bg-sky-50 text-center">פרמיה</th>
                <th className="border p-2 bg-sky-50 text-center">עמלה</th>
                <th className="border p-2 bg-sky-50 text-center">% עמלה</th>
                <th className="w-1 bg-sky-200/50" aria-hidden />
                <th className="border p-2 bg-emerald-50 text-center">פרמיה</th>
                <th className="border p-2 bg-emerald-50 text-center">עמלה</th>
                <th className="border p-2 bg-emerald-50 text-center">% עמלה</th>
                <th className="border p-2"></th>
              </tr>
            </thead>

            <tbody>
              {visibleRows.map((r) => (
                <tr key={`${r.companyId}|${r.policyNumberKey}|${r.customerId}|${r.agentCode}`} className="border">
                  <td className="border p-2">{r.companyName || r.companyId}</td>
                  <td className="border p-2">{r.policyNumberKey}</td>
                  <td className="border p-2">{r.customerId}</td>
                  <td className="border p-2">{r.fullName || "-"}</td>
                  <td className="border p-2">{r.agentCode}</td>
                  <td className="border p-2">{r.product || "-"}</td>
                  <td className="border p-2 bg-sky-50 text-center">{r.row1 ? r.row1.premiumAmount.toFixed(2) : "-"}</td>
                  <td className="border p-2 bg-sky-50 text-center">{r.row1 ? r.row1.commissionAmount.toFixed(2) : "-"}</td>
                  <td className="border p-2 bg-sky-50 text-center">{r.row1 ? r.row1.commissionRate.toFixed(2) : "-"}</td>
                  <td className="w-1 bg-sky-200/50" aria-hidden />
                  <td className="border p-2 bg-emerald-50 text-center">{r.row2 ? r.row2.premiumAmount.toFixed(2) : "-"}</td>
                  <td className="border p-2 bg-emerald-50 text-center">{r.row2 ? r.row2.commissionAmount.toFixed(2) : "-"}</td>
                  <td className="border p-2 bg-emerald-50 text-center">{r.row2 ? r.row2.commissionRate.toFixed(2) : "-"}</td>
                  <td className="border p-2 font-bold">{statusOptions.find((s) => s.value === r.status)?.label || "—"}</td>
                </tr>
              ))}

              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={15} className="text-center py-4 text-gray-500">
                    לא נמצאו שורות תואמות.
                  </td>
                </tr>
              )}

              <tr className="font-bold">
                <td className="border p-2 text-right bg-blue-50">סה״כ</td>
                <td className="border p-2 bg-blue-50" colSpan={5}></td>
                <td className="border p-2 bg-sky-50 text-center">{totals.p1.toFixed(2)}</td>
                <td className="border p-2 bg-sky-50 text-center">{totals.c1.toFixed(2)}</td>
                <td className="border p-2 bg-sky-50 text-center">—</td>
                <td className="w-1 bg-sky-200/50" aria-hidden />
                <td className="border p-2 bg-emerald-50 text-center">{totals.p2.toFixed(2)}</td>
                <td className="border p-2 bg-emerald-50 text-center">{totals.c2.toFixed(2)}</td>
                <td className="border p-2 bg-emerald-50 text-center">—</td>
                <td className="border p-2 bg-blue-50"></td>
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