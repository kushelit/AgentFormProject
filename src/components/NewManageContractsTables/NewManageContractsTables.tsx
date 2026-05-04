'use client';

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  getDocsFromServer
} from "firebase/firestore";
import { db } from "@/lib/firebase/firebase";
import { useAuth } from "@/lib/firebase/AuthContext";
import useFetchAgentData from "@/hooks/useFetchAgentData";
import { CONTRACTS_TABLES_CONFIG } from "@/config/contractsTablesConfig";
import { normalizeCommissionForSave } from "@/utils/contractsTablesNormalize";
import "./NewManageContractsTables.css";
import { Button } from "@/components/Button/Button";
import { ToastNotification } from '@/components/ToastNotification';
import { useToast } from "@/hooks/useToast";

type CompanyRow = {
  id: string;
  companyName: string;
};

type ProductsGroupRow = {
  id: string;
  productsGroupName: string;
  companyIds?: string[];
};

type ProductSubGroupRow = {
  id: string;
  label: string;
  productGroupId: string;
  uiOrder: number;
  isActive?: boolean;
};

type ProductRow = {
  id: string;
  productName: string;
  productGroup: string;
  productSubGroupId?: string;
};

type ContractDoc = {
  id: string;
  AgentId: string;
  company: string;
  productsGroup: string;
  product: string;
  commissionHekef: string;
  commissionNifraim: string;
  commissionNiud: string;
  minuySochen: boolean;

  commissionHekefDisplay?: string;
  commissionNifraimDisplay?: string;
  commissionNiudDisplay?: string;

  commissionHekefDisplayVatIncluded?: boolean;
  commissionNifraimDisplayVatIncluded?: boolean;
  commissionNiudDisplayVatIncluded?: boolean;
};

const NewManageContractsTables: React.FC = () => {
  const { detail } = useAuth();
  const { agents, selectedAgentId, handleAgentChange } = useFetchAgentData();

  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [productsGroups, setProductsGroups] = useState<ProductsGroupRow[]>([]);
  const [productSubGroups, setProductSubGroups] = useState<ProductSubGroupRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [contracts, setContracts] = useState<ContractDoc[]>([]);

  const [cellValues, setCellValues] = useState<Record<string, string>>({});
  const [defaultValues, setDefaultValues] = useState<Record<string, string>>({});
  const [selectedViewGroup, setSelectedViewGroup] = useState<
    "pension" | "finance" | "risk"
  >("pension");

  const effectiveAgentId = selectedAgentId || detail?.agentId || "";

const [originalCellValues, setOriginalCellValues] = useState<Record<string, string>>({});
const [originalDefaultValues, setOriginalDefaultValues] = useState<Record<string, string>>({});

const { toasts, addToast, setToasts } = useToast();


const skipResetOriginalRef = useRef(false);

const defaultValuesRef = useRef<Record<string, string>>({});
const cellValuesRef = useRef<Record<string, string>>({});

useEffect(() => {
  defaultValuesRef.current = defaultValues;
}, [defaultValues]);

useEffect(() => {
  cellValuesRef.current = cellValues;
}, [cellValues]);


  const buildCellKey = (
    tableKey: string,
    sectionKey: string,
    rowLabel: string,
    companyId: string
  ) => `${tableKey}-${sectionKey}-${rowLabel}-${companyId}`;

  const buildDefaultKey = (
    tableKey: string,
    sectionKey: string,
    rowLabel: string
  ) => `${tableKey}-${sectionKey}-${rowLabel}-default`;

  const getVatModeByTable = (
    tableKey: string
  ): "includes_vat" | "excludes_vat" => {
    return tableKey === "risk" ? "excludes_vat" : "includes_vat";
  };

  const getPlaceholder = (mode: string) => {
    return mode === "percent" ? "0.5" : "5000";
  };

  const getHelper = (value: string, mode: "percent" | "per_million", tableKey: string) => {
    const result = normalizeCommissionForSave(
      value,
      mode,
      getVatModeByTable(tableKey)
    );

    return result.normalizedPercentNet
      ? `נטו: ${result.normalizedPercentNet}%`
      : "";
  };


const downloadExcelTemplate = () => {
  const url = effectiveAgentId
    ? `/api/contracts-template/download?agentId=${effectiveAgentId}`
    : `/api/contracts-template/download`;
  window.open(url, "_blank");
};

  const fetchMeta = async () => {
    const [companySnap, groupSnap, subGroupSnap, productSnap] = await Promise.all([
      getDocs(collection(db, "company")),
      getDocs(collection(db, "productsGroup")),
      getDocs(collection(db, "productSubGroups")),
      getDocs(collection(db, "product")),
    ]);

    setCompanies(
      companySnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<CompanyRow, "id">),
      }))
    );

    setProductsGroups(
      groupSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<ProductsGroupRow, "id">),
      }))
    );

    setProductSubGroups(
      subGroupSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<ProductSubGroupRow, "id">),
      }))
    );

    setProducts(
      productSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<ProductRow, "id">),
      }))
    );
  };

const fetchContracts = async () => {
  if (!effectiveAgentId) return;

  const q = query(
    collection(db, "contracts"),
    where("AgentId", "==", effectiveAgentId)
  );

  const snap = await getDocsFromServer(q);

  const fetched = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<ContractDoc, "id">),
  }));

  // ← מאלץ reference חדש
  setContracts([...fetched]);
};

  useEffect(() => {
    fetchMeta();
  }, []);

  useEffect(() => {
    if (!effectiveAgentId) return;
    fetchContracts();
  }, [effectiveAgentId]);

  const companiesById = useMemo(() => {
    const map: Record<string, CompanyRow> = {};
    companies.forEach((c) => {
      map[c.id] = c;
    });
    return map;
  }, [companies]);

  const visibleCompaniesByGroup = useMemo(() => {
    const map: Record<string, CompanyRow[]> = {};

    productsGroups.forEach((group) => {
      const companyIds = Array.isArray(group.companyIds) ? group.companyIds : [];
      map[group.id] = companyIds
        .map((companyId) => companiesById[String(companyId)])
        .filter(Boolean);
    });

    return map;
  }, [productsGroups, companiesById]);

  const visibleTables = useMemo(() => {
    if (selectedViewGroup === "pension") {
      return CONTRACTS_TABLES_CONFIG.filter(
        (table: any) => table.key === "pension" || table.key === "retirement"
      );
    }

    if (selectedViewGroup === "finance") {
      return CONTRACTS_TABLES_CONFIG.filter(
        (table: any) => table.key === "finance"
      );
    }

    if (selectedViewGroup === "risk") {
      return CONTRACTS_TABLES_CONFIG.filter(
        (table: any) => table.key === "risk" || table.key === "travel"
      );
    }

    return CONTRACTS_TABLES_CONFIG;
  }, [selectedViewGroup]);


const isCellDirty = (key: string, value: string) => {
  return (originalCellValues[key] || "") !== (value || "");
};

const isDefaultDirty = (key: string, value: string) => {
  return (originalDefaultValues[key] || "") !== (value || "");
};

//   useEffect(() => {
//     if (!companies.length || !products.length) return;

//     const nextValues: Record<string, string> = {};
//     const nextDefaults: Record<string, string> = {};

//     CONTRACTS_TABLES_CONFIG.forEach((table: any) => {
//   const savedDefaultGroups = new Set<string>();
//   table.sections.forEach((section: any) => {
//     const companiesForGroup =
//           visibleCompaniesByGroup[String(section.productGroupId)] || [];

//        const productsForSection = products.filter((p) => {
//   const sameGroup = String(p.productGroup) === String(section.productGroupId);

//   const sectionSubGroupId = String(section.productSubGroupId || "").trim();

//   const sameSubGroup = sectionSubGroupId
//     ? String(p.productSubGroupId || "") === sectionSubGroupId
//     : true;

//   return sameGroup && sameSubGroup;
// });

//         section.rows.forEach((row: any) => {
//           if (table.showDefaultColumn) {
//             const defaultContract = contracts.find(
//               (c) =>
//                 c.AgentId === effectiveAgentId &&
//                 c.productsGroup === String(section.productGroupId) &&
//                 c.company === "" &&
//                 c.product === "" &&
//                 Boolean(c.minuySochen) === Boolean(row.minuySochen)
//             );

//             if (defaultContract) {
//               let displayValue = "";

//               if (row.commissionType === "hekef") {
//                 displayValue =
//                   defaultContract.commissionHekefDisplay ||
//                   defaultContract.commissionHekef ||
//                   "";
//               }

//               if (row.commissionType === "nifraim") {
//                 displayValue =
//                   defaultContract.commissionNifraimDisplay ||
//                   defaultContract.commissionNifraim ||
//                   "";
//               }

//               if (row.commissionType === "niud") {
//                 displayValue =
//                   defaultContract.commissionNiudDisplay ||
//                   defaultContract.commissionNiud ||
//                   "";
//               }

//               nextDefaults[
//                 buildDefaultKey(table.key, section.key, row.label)
//               ] = displayValue;
//             }
//           }

//           companiesForGroup.forEach((company) => {
//             if (company.companyName === "מגדל" || company.companyName === "הראל") {
//     // console.log("section:", section.key, "productsForSection:", productsForSection.map(p => p.productName));
//   }
//             const matchingContract = contracts.find((c) => {
//               const sameCompany = c.company === company.companyName;
//               const sameMinuy = Boolean(c.minuySochen) === Boolean(row.minuySochen);
//               const productMatch = productsForSection.some(
//                 (p) => p.productName === c.product
//               );

//               return (
//                 c.AgentId === effectiveAgentId &&
//                 sameCompany &&
//                 sameMinuy &&
//                 c.productsGroup === "" &&
//                 productMatch
//               );
//             });
//               // console.log("company:", company.companyName, "matchingContract:", matchingContract?.id || "NOT FOUND");


//             if (!matchingContract) return;

//             let displayValue = "";

//             if (row.commissionType === "hekef") {
//               displayValue =
//                 matchingContract.commissionHekefDisplay ||
//                 matchingContract.commissionHekef ||
//                 "";
//             }

//             if (row.commissionType === "nifraim") {
//               displayValue =
//                 matchingContract.commissionNifraimDisplay ||
//                 matchingContract.commissionNifraim ||
//                 "";
//             }

//             if (row.commissionType === "niud") {
//               displayValue =
//                 matchingContract.commissionNiudDisplay ||
//                 matchingContract.commissionNiud ||
//                 "";
//             }

//             nextValues[
//               buildCellKey(table.key, section.key, row.label, company.id)
//             ] = displayValue;
//           });
//         });
//       });
//     });
// setCellValues(nextValues);
// setDefaultValues(nextDefaults);

// if (!skipResetOriginalRef.current) {
//   setOriginalCellValues(nextValues);
//   setOriginalDefaultValues(nextDefaults);
// }
// skipResetOriginalRef.current = false;
    
//   }, [contracts, products, companies, visibleCompaniesByGroup, effectiveAgentId]);

const denormalizeForDisplay = (
  netValue: string,
  valueMode: "percent" | "per_million",
  vatMode: "includes_vat" | "excludes_vat",
  vatRate = 0.18
): string => {
  if (!netValue) return "";
  const num = Number(netValue);
  if (isNaN(num) || num === 0) return "";

  // שלב 1 — החזר מע"מ
  const grossPercent = vatMode === "includes_vat"
    ? num * (1 + vatRate)
    : num;

  // שלב 2 — המר לאלפים אם צריך
  if (valueMode === "per_million") {
    const perMillion = (grossPercent / 100) * 1_000_000;
    // עיגול ל-100 הקרוב
    const rounded = Math.round(perMillion / 100) * 100;
    return rounded.toString();
  }

  // אחוז — עיגול ל-2 ספרות
  return Number(grossPercent.toFixed(2)).toString();
};


useEffect(() => {
  if (!companies.length || !products.length) return;

  const nextValues: Record<string, string> = {};
  const nextDefaults: Record<string, string> = {};

  CONTRACTS_TABLES_CONFIG.forEach((table: any) => {
    table.sections.forEach((section: any) => {
      const companiesForGroup =
        visibleCompaniesByGroup[String(section.productGroupId)] || [];

      const productsForSection = products.filter((p) => {
        const sameGroup = String(p.productGroup) === String(section.productGroupId);
        const sectionSubGroupId = String(section.productSubGroupId || "").trim();
        const sameSubGroup = sectionSubGroupId
          ? String(p.productSubGroupId || "") === sectionSubGroupId
          : true;
        return sameGroup && sameSubGroup;
      });

      const vatMode = getVatModeByTable(table.key);

      section.rows.forEach((row: any) => {
        // ─── ברירת מחדל ───
        if (table.showDefaultColumn) {
          const defaultContract = contracts.find(
            (c) =>
              c.AgentId === effectiveAgentId &&
              c.productsGroup === String(section.productGroupId) &&
              c.company === "" &&
              c.product === "" &&
              Boolean(c.minuySochen) === Boolean(row.minuySochen)
          );

          if (defaultContract) {
            let displayValue = "";

            if (row.commissionType === "hekef") {
              if (defaultContract.commissionHekefDisplay) {
                displayValue = defaultContract.commissionHekefDisplay;
              } else if (defaultContract.commissionHekef) {
                displayValue = denormalizeForDisplay(
                  defaultContract.commissionHekef,
                  row.valueMode,
                  vatMode
                );
              }
            }

            if (row.commissionType === "nifraim") {
              if (defaultContract.commissionNifraimDisplay) {
                displayValue = defaultContract.commissionNifraimDisplay;
              } else if (defaultContract.commissionNifraim) {
                displayValue = denormalizeForDisplay(
                  defaultContract.commissionNifraim,
                  row.valueMode,
                  vatMode
                );
              }
            }

            if (row.commissionType === "niud") {
              if (defaultContract.commissionNiudDisplay) {
                displayValue = defaultContract.commissionNiudDisplay;
              } else if (defaultContract.commissionNiud) {
                displayValue = denormalizeForDisplay(
                  defaultContract.commissionNiud,
                  row.valueMode,
                  vatMode
                );
              }
            }

            // שים בכל הסקשנים של אותו productGroupId
            const allSectionsForGroup = table.sections.filter(
              (s: any) => String(s.productGroupId) === String(section.productGroupId)
            );
            allSectionsForGroup.forEach((s: any) => {
              nextDefaults[buildDefaultKey(table.key, s.key, row.label)] = displayValue;
            });
          }
        }

        // ─── לפי חברה ───
        companiesForGroup.forEach((company) => {
          const matchingContract = contracts.find((c) => {
            const sameCompany = c.company === company.companyName;
            const sameMinuy = Boolean(c.minuySochen) === Boolean(row.minuySochen);
            const productMatch = productsForSection.some(
              (p) => p.productName === c.product
            );
            return (
              c.AgentId === effectiveAgentId &&
              sameCompany &&
              sameMinuy &&
              c.productsGroup === "" &&
              productMatch
            );
          });

          if (!matchingContract) return;

          let displayValue = "";

          if (row.commissionType === "hekef") {
            if (matchingContract.commissionHekefDisplay) {
              displayValue = matchingContract.commissionHekefDisplay;
            } else if (matchingContract.commissionHekef) {
              displayValue = denormalizeForDisplay(
                matchingContract.commissionHekef,
                row.valueMode,
                vatMode
              );
            }
          }

          if (row.commissionType === "nifraim") {
            if (matchingContract.commissionNifraimDisplay) {
              displayValue = matchingContract.commissionNifraimDisplay;
            } else if (matchingContract.commissionNifraim) {
              displayValue = denormalizeForDisplay(
                matchingContract.commissionNifraim,
                row.valueMode,
                vatMode
              );
            }
          }

          if (row.commissionType === "niud") {
            if (matchingContract.commissionNiudDisplay) {
              displayValue = matchingContract.commissionNiudDisplay;
            } else if (matchingContract.commissionNiud) {
              displayValue = denormalizeForDisplay(
                matchingContract.commissionNiud,
                row.valueMode,
                vatMode
              );
            }
          }

          nextValues[
            buildCellKey(table.key, section.key, row.label, company.id)
          ] = displayValue;
        });
      });
    });
  });

 const hasLegacyContracts = contracts.some(
  (c) =>
    !c.commissionHekefDisplay &&
    !c.commissionNifraimDisplay &&
    !c.commissionNiudDisplay &&
    (c.commissionHekef || c.commissionNifraim || c.commissionNiud)
);

setCellValues(nextValues);
setDefaultValues(nextDefaults);

if (!skipResetOriginalRef.current) {
  if (hasLegacyContracts) {
    setOriginalCellValues({});
    setOriginalDefaultValues({});
  } else {
    setOriginalCellValues(nextValues);
    setOriginalDefaultValues(nextDefaults);
  }
}
skipResetOriginalRef.current = false;

}, [contracts, products, companies, visibleCompaniesByGroup, effectiveAgentId]);

const saveContracts = async () => {
  if (!effectiveAgentId) {
    addToast("error", "חסר סוכן נבחר");
    return;
  }

  try {
    const batch = writeBatch(db);
    let writeCount = 0;

    const findMatches = (params: {
      company: string;
      product: string;
      productsGroup: string;
      minuySochen: boolean;
    }) => {
      return contracts.filter(
        (c) =>
          c.AgentId === effectiveAgentId &&
          String(c.company || "") === params.company &&
          String(c.product || "") === params.product &&
          String(c.productsGroup || "") === params.productsGroup &&
          Boolean(c.minuySochen) === params.minuySochen
      );
    };

    const upsertOrDelete = (
      matches: ContractDoc[],
      payload: any,
      hasValues: boolean
    ) => {
      if (hasValues) {
        if (matches.length > 0) {
          batch.update(doc(db, "contracts", matches[0].id), payload);
          writeCount++;
          matches.slice(1).forEach((duplicate) => {
            batch.delete(doc(db, "contracts", duplicate.id));
            writeCount++;
          });
        } else {
          const newRef = doc(collection(db, "contracts"));
          batch.set(newRef, payload);
          writeCount++;
        }
      } else {
        matches.forEach((existing) => {
          batch.delete(doc(db, "contracts", existing.id));
          writeCount++;
        });
      }
    };

    CONTRACTS_TABLES_CONFIG.forEach((table: any) => {
      const savedDefaultGroups = new Set<string>();

      table.sections.forEach((section: any) => {
        const companiesForGroup =
          visibleCompaniesByGroup[String(section.productGroupId)] || [];

        const productsForSection = products.filter((p) => {
          const sameGroup = String(p.productGroup) === String(section.productGroupId);
          const sectionSubGroupId = String(section.productSubGroupId || "").trim();
          const sameSubGroup = sectionSubGroupId
            ? String(p.productSubGroupId || "") === sectionSubGroupId
            : true;
          return sameGroup && sameSubGroup;
        });

        const vatMode = getVatModeByTable(table.key);

        if (table.showDefaultColumn) {
          const groupKey = String(section.productGroupId);

          if (!savedDefaultGroups.has(groupKey)) {
            savedDefaultGroups.add(groupKey);

            const sectionsForGroup = table.sections.filter(
              (s: any) => String(s.productGroupId) === groupKey
            );

const findRaw = (commissionType: string, isMinuy: boolean) => {
  for (const s of sectionsForGroup) {
    const row = s.rows.find(
      (r: any) =>
        r.commissionType === commissionType &&
        Boolean(r.minuySochen) === isMinuy
    );
    if (row) {
      const val = (
        defaultValuesRef.current[
          buildDefaultKey(table.key, s.key, row.label)
        ] || ""
      ).trim();
      return { val, row }; // ← הסרנו את if (val)
    }
  }
  return null;
};
            const hekefResult = findRaw("hekef", false);
            const nifraimResult = findRaw("nifraim", false);
            const niudResult = findRaw("niud", false);
            const nifraimMinuyResult = findRaw("nifraim", true);

            const hekefRaw = hekefResult?.val || "";
            const nifraimRaw = nifraimResult?.val || "";
            const niudRaw = niudResult?.val || "";
            const nifraimMinuyRaw = nifraimMinuyResult?.val || "";

            const hekefRow = hekefResult?.row;
            const nifraimRow = nifraimResult?.row;
            const niudRow = niudResult?.row;
            const nifraimMinuyRow = nifraimMinuyResult?.row;

            const hekefNormalized = hekefRow
              ? normalizeCommissionForSave(hekefRaw, hekefRow.valueMode, vatMode)
              : null;
            const nifraimNormalized = nifraimRow
              ? normalizeCommissionForSave(nifraimRaw, nifraimRow.valueMode, vatMode)
              : null;
            const niudNormalized = niudRow
              ? normalizeCommissionForSave(niudRaw, niudRow.valueMode, vatMode)
              : null;
  console.log("saving default for groupKey:", groupKey, "hekefRaw:", hekefRaw, "nifraimRaw:", nifraimRaw, "niudRaw:", niudRaw);

            const payloadDefault = {
              AgentId: effectiveAgentId,
              company: "",
              productsGroup: groupKey,
              product: "",
              commissionHekef: hekefNormalized?.normalizedPercentNet || "",
              commissionNifraim: nifraimNormalized?.normalizedPercentNet || "",
              commissionNiud: niudNormalized?.normalizedPercentNet || "",
              minuySochen: false,
              commissionHekefDisplay: hekefRaw,
              commissionNifraimDisplay: nifraimRaw,
              commissionNiudDisplay: niudRaw,
              commissionHekefDisplayVatIncluded: vatMode === "includes_vat",
              commissionNifraimDisplayVatIncluded: vatMode === "includes_vat",
              commissionNiudDisplayVatIncluded: vatMode === "includes_vat",
            };

            upsertOrDelete(
              findMatches({ company: "", product: "", productsGroup: groupKey, minuySochen: false }),
              payloadDefault,
              Boolean(hekefRaw || nifraimRaw || niudRaw)
            );

            if (nifraimMinuyRow) {
              const nifraimMinuyNormalized = normalizeCommissionForSave(
                nifraimMinuyRaw,
                nifraimMinuyRow.valueMode,
                vatMode
              );
              const payloadDefaultMinuy = {
                AgentId: effectiveAgentId,
                company: "",
                productsGroup: groupKey,
                product: "",
                commissionHekef: "",
                commissionNifraim: nifraimMinuyNormalized.normalizedPercentNet || "",
                commissionNiud: "",
                minuySochen: true,
                commissionHekefDisplay: "",
                commissionNifraimDisplay: nifraimMinuyRaw,
                commissionNiudDisplay: "",
                commissionHekefDisplayVatIncluded: vatMode === "includes_vat",
                commissionNifraimDisplayVatIncluded: vatMode === "includes_vat",
                commissionNiudDisplayVatIncluded: vatMode === "includes_vat",
              };
              upsertOrDelete(
                findMatches({ company: "", product: "", productsGroup: groupKey, minuySochen: true }),
                payloadDefaultMinuy,
                Boolean(nifraimMinuyRaw)
              );
            }
          }
        }

        companiesForGroup.forEach((company) => {
          const rowHekef = section.rows.find(
            (r: any) => r.commissionType === "hekef" && !r.minuySochen
          );
          const rowNifraim = section.rows.find(
            (r: any) => r.commissionType === "nifraim" && !r.minuySochen
          );
          const rowNifraimMinuy = section.rows.find(
            (r: any) => r.commissionType === "nifraim" && r.minuySochen
          );
          const rowNiud = section.rows.find(
            (r: any) => r.commissionType === "niud" && !r.minuySochen
          );

          const hekefRaw = rowHekef
            ? (cellValuesRef.current[buildCellKey(table.key, section.key, rowHekef.label, company.id)] || "").trim()
            : "";
          const nifraimRaw = rowNifraim
            ? (cellValuesRef.current[buildCellKey(table.key, section.key, rowNifraim.label, company.id)] || "").trim()
            : "";
          const nifraimMinuyRaw = rowNifraimMinuy
            ? (cellValuesRef.current[buildCellKey(table.key, section.key, rowNifraimMinuy.label, company.id)] || "").trim()
            : "";
          const niudRaw = rowNiud
            ? (cellValuesRef.current[buildCellKey(table.key, section.key, rowNiud.label, company.id)] || "").trim()
            : "";

          const hekefNormalized = rowHekef
            ? normalizeCommissionForSave(hekefRaw, rowHekef.valueMode, vatMode)
            : null;
          const nifraimNormalized = rowNifraim
            ? normalizeCommissionForSave(nifraimRaw, rowNifraim.valueMode, vatMode)
            : null;
          const niudNormalized = rowNiud
            ? normalizeCommissionForSave(niudRaw, rowNiud.valueMode, vatMode)
            : null;

          productsForSection.forEach((product) => {
            const payload = {
              AgentId: effectiveAgentId,
              company: company.companyName,
              productsGroup: "",
              product: product.productName,
              commissionHekef: hekefNormalized?.normalizedPercentNet || "",
              commissionNifraim: nifraimNormalized?.normalizedPercentNet || "",
              commissionNiud: niudNormalized?.normalizedPercentNet || "",
              minuySochen: false,
              commissionHekefDisplay: hekefRaw,
              commissionNifraimDisplay: nifraimRaw,
              commissionNiudDisplay: niudRaw,
              commissionHekefDisplayVatIncluded: vatMode === "includes_vat",
              commissionNifraimDisplayVatIncluded: vatMode === "includes_vat",
              commissionNiudDisplayVatIncluded: vatMode === "includes_vat",
            };

            upsertOrDelete(
              findMatches({ company: company.companyName, product: product.productName, productsGroup: "", minuySochen: false }),
              payload,
              Boolean(hekefRaw || nifraimRaw || niudRaw)
            );

            if (rowNifraimMinuy) {
              const nifraimMinuyNormalized = normalizeCommissionForSave(
                nifraimMinuyRaw,
                rowNifraimMinuy.valueMode,
                vatMode
              );
              const payloadMinuy = {
                AgentId: effectiveAgentId,
                company: company.companyName,
                productsGroup: "",
                product: product.productName,
                commissionHekef: "",
                commissionNifraim: nifraimMinuyNormalized.normalizedPercentNet || "",
                commissionNiud: "",
                minuySochen: true,
                commissionHekefDisplay: "",
                commissionNifraimDisplay: nifraimMinuyRaw,
                commissionNiudDisplay: "",
                commissionHekefDisplayVatIncluded: vatMode === "includes_vat",
                commissionNifraimDisplayVatIncluded: vatMode === "includes_vat",
                commissionNiudDisplayVatIncluded: vatMode === "includes_vat",
              };
              upsertOrDelete(
                findMatches({ company: company.companyName, product: product.productName, productsGroup: "", minuySochen: true }),
                payloadMinuy,
                Boolean(nifraimMinuyRaw)
              );
            }
          });
        });
      });
    });

    // console.log("contracts save writeCount:", writeCount);

    if (writeCount === 0) {
      addToast("error", "לא נמצאו שינויים לשמירה");
      return;
    }

    await batch.commit();
    // console.log("batch committed successfully");

    setOriginalCellValues({ ...cellValues });
    setOriginalDefaultValues({ ...defaultValues });
    addToast("success", "נשמר בהצלחה");
    setTimeout(() => fetchContracts(), 1000);
  } catch (error) {
    // console.error("saveContracts error:", error);
    addToast("error", "שגיאה בשמירה");
  }
};


  const getDensityClassByCompanies = (count: number) => {
  if (count >= 12) return "density-ultra";
  if (count >= 9) return "density-compact";
  return "density-normal";
};

const [isUploading, setIsUploading] = useState(false);
const uploadInputRef = useRef<HTMLInputElement>(null);

const handleUploadExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file || !effectiveAgentId) {
    addToast("error", "יש לבחור קובץ ולוודא שסוכן נבחר");
    return;
  }

  setIsUploading(true);
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("agentId", effectiveAgentId);

    const res = await fetch("/api/contracts-template/upload", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    if (!res.ok) {
      addToast("error", data.error || "שגיאה בהעלאה");
      return;
    }

    addToast("success", `הועלה בהצלחה — ${data.writeCount} רשומות נשמרו`);
    skipResetOriginalRef.current = true; // ← לא לאפס originals
    await fetchContracts();
  } catch (err) {
    addToast("error", "שגיאה בהעלאת הקובץ");
  } finally {
    setIsUploading(false);
    if (uploadInputRef.current) uploadInputRef.current.value = "";
  }
};


// ─── פונקציה לזיהוי סוכן ישן ───
const isLegacyAgent = useMemo(() => {
  return contracts.some(
    (c) =>
      !c.commissionHekefDisplay &&
      !c.commissionNifraimDisplay &&
      !c.commissionNiudDisplay &&
      (c.commissionHekef || c.commissionNifraim || c.commissionNiud)
  );
}, [contracts]);

// ─── המרה הפוכה מנטו לברוטו/למיליון ───

// ─── מציאת section לפי חוזה ───
// const findSectionForContract = (contract: ContractDoc) => {
//   for (const table of CONTRACTS_TABLES_CONFIG) {
//     for (const section of table.sections) {
//       if (contract.productsGroup) {
//         // ברירת מחדל — לפי productsGroup
//         if (String(section.productGroupId) === String(contract.productsGroup)) {
//           return { table, section };
//         }
//       } else {
//         // לפי מוצר
//         const productDoc = products.find(
//           (p) => p.productName === contract.product
//         );
//         if (!productDoc) continue;
//         const sameGroup =
//           String(section.productGroupId) === String(productDoc.productGroup);
//         const sameSubGroup = section.productSubGroupId
//           ? String(section.productSubGroupId) ===
//             String(productDoc.productSubGroupId || "")
//           : true;
//         if (sameGroup && sameSubGroup) {
//           return { table, section };
//         }
//       }
//     }
//   }
//   return null;
// };

// ─── פונקציית עדכון לפורמט החדש ───
// const migrateToNewFormat = () => {
//   const nextCellValues = { ...cellValuesRef.current };
//   const nextDefaultValues = { ...defaultValuesRef.current };

//   contracts.forEach((contract) => {
//     // דלג על חוזים שכבר יש להם Display
//     if (
//       contract.commissionHekefDisplay ||
//       contract.commissionNifraimDisplay ||
//       contract.commissionNiudDisplay
//     )
//       return;

//     const found = findSectionForContract(contract);
//     if (!found) return;

//     const { table, section } = found;
//     const vatMode = getVatModeByTable(table.key);

//     section.rows.forEach((row: any) => {
//       if (Boolean(row.minuySochen) !== Boolean(contract.minuySochen)) return;

//       let netValue = "";
//       if (row.commissionType === "hekef") netValue = contract.commissionHekef || "";
//       if (row.commissionType === "nifraim") netValue = contract.commissionNifraim || "";
//       if (row.commissionType === "niud") netValue = contract.commissionNiud || "";

//       if (!netValue) return;

//       const displayValue = denormalizeForDisplay(
//         netValue,
//         row.valueMode,
//         vatMode
//       );

//       if (contract.productsGroup) {
//         // ברירת מחדל
//         const key = buildDefaultKey(table.key, section.key, row.label);
//         nextDefaultValues[key] = displayValue;
//       } else {
//         // לפי חברה
//         const company = companies.find(
//           (c) => c.companyName === contract.company
//         );
//         if (!company) return;
//         const key = buildCellKey(table.key, section.key, row.label, company.id);
//         nextCellValues[key] = displayValue;
//       }
//     });
//   });

//   setCellValues(nextCellValues);
//   setDefaultValues(nextDefaultValues);
//   addToast("success", "הערכים הומרו — בדוק ולחץ שמור לאישור");
// };


  return (
    <div className="contracts-page" dir="rtl">
<div className="top-toolbar">
  <div className="tabs-container">
    <div
      className={`tab ${selectedViewGroup === "pension" ? "active" : ""}`}
      onClick={() => setSelectedViewGroup("pension")}
    >
      פנסיוני
    </div>

    <div
      className={`tab ${selectedViewGroup === "finance" ? "active" : ""}`}
      onClick={() => setSelectedViewGroup("finance")}
    >
      פיננסים
    </div>

    <div
      className={`tab ${selectedViewGroup === "risk" ? "active" : ""}`}
      onClick={() => setSelectedViewGroup("risk")}
    >
      סיכונים
    </div>
  </div>

 <div className="toolbar-actions">
  {detail?.role === "admin" && (
    <select
      value={selectedAgentId}
      onChange={handleAgentChange}
      className="select-input"
    >
      <option value="">בחר סוכן</option>
      {agents.map((agent: any) => (
        <option key={agent.id} value={agent.id}>
          {agent.name}
        </option>
      ))}
    </select>
  )}
  <Button
    onClick={saveContracts}
    text="שמור"
    type="primary"
    icon="off"
    state="default"
  />

  <Button
    onClick={downloadExcelTemplate}
    text="הורד תבנית אקסל"
    type="primary"
    icon="off"
    state="default"
  />
  {/* כפתור העלאה */}
  <input
    ref={uploadInputRef}
    type="file"
    accept=".xlsx"
    style={{ display: "none" }}
    onChange={handleUploadExcel}
  />
  <Button
    onClick={() => uploadInputRef.current?.click()}
    text={isUploading ? "מעלה..." : "העלה אקסל"}
    type="primary"
    icon="off"
    state={isUploading ? "disabled" : "default"}
  />
</div>
</div>
{isLegacyAgent && (
  <div className="legacy-banner">
    <div className="legacy-banner-text">
      ⚠️ נמצאו הסכמים בפורמט ישן — הערכים חושבו מחדש, בדוק ולחץ שמור לאישור
    </div>
  </div>
)}
      {visibleTables.map((table: any) => (
        <div key={table.key} className="table-card">
          <div className="table-card-header">
            <div className="table-title">{table.title}</div>
            <div className="table-note">{table.note}</div>
          </div>

          {table.sections.map((section: any) => {
            const companiesForGroup =
              visibleCompaniesByGroup[String(section.productGroupId)] || [];
const densityClass = getDensityClassByCompanies(companiesForGroup.length);
            return (
              <div key={section.key} className="section-block">
                <div className="section-title">{section.label}</div>

                <div className={`table-wrapper ${densityClass}`}>
  <table className={`contracts-table ${densityClass}`}>
                    <thead>
                      <tr>
                        <th className="sticky-col">סוג עמלה</th>

                        {table.showDefaultColumn && (
                          <th className="default-col-header">ברירת מחדל</th>
                        )}

                        {companiesForGroup.map((company) => (
                          <th key={company.id}>{company.companyName}</th>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      {section.rows.map((row: any) => (
                        <tr key={row.label}>
                          <td className="sticky-col row-label-cell">
                            <div className="row-label">{row.label}</div>
                            <div className="row-mode">
                              {row.valueMode === "percent" ? "אחוזים" : "למיליון"}
                            </div>
                          </td>

                  {table.showDefaultColumn && (
  <td className="default-col-cell">
    {(() => {
      const firstSectionInGroup = table.sections.find(
        (s: any) => String(s.productGroupId) === String(section.productGroupId)
      );
      const isFirstSection = firstSectionInGroup?.key === section.key;

      if (!isFirstSection) {
        return (
          <div className="default-linked-note">
משותף עם &quot;{firstSectionInGroup?.label}&quot;
          </div>
        );
      }
      const defaultKey = buildDefaultKey(
        table.key,
        section.key,
        row.label
      );
      const defaultValue = defaultValues[defaultKey] || "";

      return (
        <>
          <input
            className={`contracts-input ${
              isDefaultDirty(defaultKey, defaultValue) ? "contracts-input-dirty" : ""
            }`}
            value={defaultValue}
            placeholder={getPlaceholder(row.valueMode)}
            onChange={(e) => {
              const value = e.target.value;
              setDefaultValues((prev) => ({
                ...prev,
                [defaultKey]: value,
              }));
            }}
          />
          {defaultValue && (
            <div className="cell-helper">
              {getHelper(defaultValue, row.valueMode, table.key)}
            </div>
          )}
        </>
      );
    })()}
  </td>
)}
                          {companiesForGroup.map((company) => {
                            const key = buildCellKey(
                              table.key,
                              section.key,
                              row.label,
                              company.id
                            );

                            const value = cellValues[key] || "";

                            return (
                              <td key={key}>
                             <input
  className={`contracts-input ${
  isCellDirty(key, value) ? "contracts-input-dirty" : ""
}`}
  value={value}
  placeholder={getPlaceholder(row.valueMode)}
  onChange={(e) => {
    const value = e.target.value;

    setCellValues((prev) => ({
      ...prev,
      [key]: value,
    }));
  }}
/>                          {value && (
                                  <div className="cell-helper">
                                    {getHelper(value, row.valueMode, table.key)}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      ))}
      {toasts.length > 0 && toasts.map((toast) => (
  <ToastNotification
    key={toast.id}
    type={toast.type}
    className={toast.isHiding ? "hide" : ""}
    message={toast.message}
    onClose={() => setToasts((prevToasts) => prevToasts.filter((t) => t.id !== toast.id))}
  />
))}
    </div>
  );
};

export default NewManageContractsTables;