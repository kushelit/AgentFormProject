'use client';

import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase/firebase";
import { useAuth } from "@/lib/firebase/AuthContext";
import useFetchAgentData from "@/hooks/useFetchAgentData";
import { CONTRACTS_TABLES_CONFIG } from "@/config/contractsTablesConfig";
import { normalizeCommissionForSave } from "@/utils/contractsTablesNormalize";
import "./NewManageContractsTables.css";

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

    const snap = await getDocs(q);

    setContracts(
      snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<ContractDoc, "id">),
      }))
    );
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

  useEffect(() => {
    if (!companies.length || !products.length) return;

    const nextValues: Record<string, string> = {};
    const nextDefaults: Record<string, string> = {};

    CONTRACTS_TABLES_CONFIG.forEach((table: any) => {
      table.sections.forEach((section: any) => {
        const companiesForGroup =
          visibleCompaniesByGroup[String(section.productGroupId)] || [];

        const productsForSection = products.filter(
          (p) =>
            String(p.productGroup) === String(section.productGroupId) &&
            String(p.productSubGroupId || "") === String(section.productSubGroupId)
        );

        section.rows.forEach((row: any) => {
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
                displayValue =
                  defaultContract.commissionHekefDisplay ||
                  defaultContract.commissionHekef ||
                  "";
              }

              if (row.commissionType === "nifraim") {
                displayValue =
                  defaultContract.commissionNifraimDisplay ||
                  defaultContract.commissionNifraim ||
                  "";
              }

              if (row.commissionType === "niud") {
                displayValue =
                  defaultContract.commissionNiudDisplay ||
                  defaultContract.commissionNiud ||
                  "";
              }

              nextDefaults[
                buildDefaultKey(table.key, section.key, row.label)
              ] = displayValue;
            }
          }

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
              displayValue =
                matchingContract.commissionHekefDisplay ||
                matchingContract.commissionHekef ||
                "";
            }

            if (row.commissionType === "nifraim") {
              displayValue =
                matchingContract.commissionNifraimDisplay ||
                matchingContract.commissionNifraim ||
                "";
            }

            if (row.commissionType === "niud") {
              displayValue =
                matchingContract.commissionNiudDisplay ||
                matchingContract.commissionNiud ||
                "";
            }

            nextValues[
              buildCellKey(table.key, section.key, row.label, company.id)
            ] = displayValue;
          });
        });
      });
    });

    setCellValues(nextValues);
    setDefaultValues(nextDefaults);
  }, [contracts, products, companies, visibleCompaniesByGroup, effectiveAgentId]);

  const saveContracts = async () => {
    if (!effectiveAgentId) {
      alert("חסר סוכן נבחר");
      return;
    }

    try {
      const batch = writeBatch(db);

      CONTRACTS_TABLES_CONFIG.forEach((table: any) => {
        table.sections.forEach((section: any) => {
          const companiesForGroup =
            visibleCompaniesByGroup[String(section.productGroupId)] || [];

          const productsForSection = products.filter(
            (p) =>
              String(p.productGroup) === String(section.productGroupId) &&
              String(p.productSubGroupId || "") === String(section.productSubGroupId)
          );

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

          const vatMode = getVatModeByTable(table.key);

          if (table.showDefaultColumn) {
            const hekefRaw = rowHekef
              ? (defaultValues[buildDefaultKey(table.key, section.key, rowHekef.label)] || "").trim()
              : "";

            const nifraimRaw = rowNifraim
              ? (defaultValues[buildDefaultKey(table.key, section.key, rowNifraim.label)] || "").trim()
              : "";

            const nifraimMinuyRaw = rowNifraimMinuy
              ? (defaultValues[buildDefaultKey(table.key, section.key, rowNifraimMinuy.label)] || "").trim()
              : "";

            const niudRaw = rowNiud
              ? (defaultValues[buildDefaultKey(table.key, section.key, rowNiud.label)] || "").trim()
              : "";

            const hasDefaultRegularValues = Boolean(
              hekefRaw || nifraimRaw || niudRaw
            );
            const hasDefaultMinuyValue = Boolean(nifraimMinuyRaw);

            if (hasDefaultRegularValues) {
              const existingDefault = contracts.find(
                (c) =>
                  c.AgentId === effectiveAgentId &&
                  c.company === "" &&
                  c.product === "" &&
                  c.productsGroup === String(section.productGroupId) &&
                  c.minuySochen === false
              );

              const hekefNormalized = rowHekef
                ? normalizeCommissionForSave(hekefRaw, rowHekef.valueMode, vatMode)
                : null;

              const nifraimNormalized = rowNifraim
                ? normalizeCommissionForSave(nifraimRaw, rowNifraim.valueMode, vatMode)
                : null;

              const niudNormalized = rowNiud
                ? normalizeCommissionForSave(niudRaw, rowNiud.valueMode, vatMode)
                : null;

              const payloadDefault = {
                AgentId: effectiveAgentId,
                company: "",
                productsGroup: String(section.productGroupId),
                product: "",
                commissionHekef: hekefNormalized?.normalizedPercentNet || "",
                commissionNifraim: nifraimNormalized?.normalizedPercentNet || "",
                commissionNiud: niudNormalized?.normalizedPercentNet || "",
                minuySochen: false,

                commissionHekefDisplay: hekefRaw || "",
                commissionNifraimDisplay: nifraimRaw || "",
                commissionNiudDisplay: niudRaw || "",

                commissionHekefDisplayVatIncluded: vatMode === "includes_vat",
                commissionNifraimDisplayVatIncluded: vatMode === "includes_vat",
                commissionNiudDisplayVatIncluded: vatMode === "includes_vat",
              };

              if (existingDefault) {
                batch.update(doc(db, "contracts", existingDefault.id), payloadDefault);
              } else {
                const newRef = doc(collection(db, "contracts"));
                batch.set(newRef, payloadDefault);
              }
            }

            if (rowNifraimMinuy && hasDefaultMinuyValue) {
              const existingDefaultMinuy = contracts.find(
                (c) =>
                  c.AgentId === effectiveAgentId &&
                  c.company === "" &&
                  c.product === "" &&
                  c.productsGroup === String(section.productGroupId) &&
                  c.minuySochen === true
              );

              const nifraimMinuyNormalized = normalizeCommissionForSave(
                nifraimMinuyRaw,
                rowNifraimMinuy.valueMode,
                vatMode
              );

              const payloadDefaultMinuy = {
                AgentId: effectiveAgentId,
                company: "",
                productsGroup: String(section.productGroupId),
                product: "",
                commissionHekef: "",
                commissionNifraim: nifraimMinuyNormalized.normalizedPercentNet || "",
                commissionNiud: "",
                minuySochen: true,

                commissionHekefDisplay: "",
                commissionNifraimDisplay: nifraimMinuyRaw || "",
                commissionNiudDisplay: "",

                commissionHekefDisplayVatIncluded: vatMode === "includes_vat",
                commissionNifraimDisplayVatIncluded: vatMode === "includes_vat",
                commissionNiudDisplayVatIncluded: vatMode === "includes_vat",
              };

              if (existingDefaultMinuy) {
                batch.update(doc(db, "contracts", existingDefaultMinuy.id), payloadDefaultMinuy);
              } else {
                const newRef = doc(collection(db, "contracts"));
                batch.set(newRef, payloadDefaultMinuy);
              }
            }
          }

          companiesForGroup.forEach((company) => {
            const hekefRaw = rowHekef
              ? (cellValues[buildCellKey(table.key, section.key, rowHekef.label, company.id)] || "").trim()
              : "";

            const nifraimRaw = rowNifraim
              ? (cellValues[buildCellKey(table.key, section.key, rowNifraim.label, company.id)] || "").trim()
              : "";

            const nifraimMinuyRaw = rowNifraimMinuy
              ? (cellValues[buildCellKey(table.key, section.key, rowNifraimMinuy.label, company.id)] || "").trim()
              : "";

            const niudRaw = rowNiud
              ? (cellValues[buildCellKey(table.key, section.key, rowNiud.label, company.id)] || "").trim()
              : "";

            const hasRegularValues = Boolean(hekefRaw || nifraimRaw || niudRaw);
            const hasMinuyValue = Boolean(nifraimMinuyRaw);

            const hekefNormalized = rowHekef
              ? normalizeCommissionForSave(hekefRaw, rowHekef.valueMode, vatMode)
              : null;

            const nifraimNormalized = rowNifraim
              ? normalizeCommissionForSave(nifraimRaw, rowNifraim.valueMode, vatMode)
              : null;

            const nifraimMinuyNormalized = rowNifraimMinuy
              ? normalizeCommissionForSave(nifraimMinuyRaw, rowNifraimMinuy.valueMode, vatMode)
              : null;

            const niudNormalized = rowNiud
              ? normalizeCommissionForSave(niudRaw, rowNiud.valueMode, vatMode)
              : null;

            if (hasRegularValues) {
              productsForSection.forEach((product) => {
                const existing = contracts.find(
                  (c) =>
                    c.AgentId === effectiveAgentId &&
                    c.company === company.companyName &&
                    c.product === product.productName &&
                    c.productsGroup === "" &&
                    c.minuySochen === false
                );

                const payload = {
                  AgentId: effectiveAgentId,
                  company: company.companyName,
                  productsGroup: "",
                  product: product.productName,
                  commissionHekef: hekefNormalized?.normalizedPercentNet || "",
                  commissionNifraim: nifraimNormalized?.normalizedPercentNet || "",
                  commissionNiud: niudNormalized?.normalizedPercentNet || "",
                  minuySochen: false,

                  commissionHekefDisplay: hekefRaw || "",
                  commissionNifraimDisplay: nifraimRaw || "",
                  commissionNiudDisplay: niudRaw || "",

                  commissionHekefDisplayVatIncluded: vatMode === "includes_vat",
                  commissionNifraimDisplayVatIncluded: vatMode === "includes_vat",
                  commissionNiudDisplayVatIncluded: vatMode === "includes_vat",
                };

                if (existing) {
                  batch.update(doc(db, "contracts", existing.id), payload);
                } else {
                  const newRef = doc(collection(db, "contracts"));
                  batch.set(newRef, payload);
                }
              });
            }

            if (rowNifraimMinuy && hasMinuyValue) {
              productsForSection.forEach((product) => {
                const existingMinuy = contracts.find(
                  (c) =>
                    c.AgentId === effectiveAgentId &&
                    c.company === company.companyName &&
                    c.product === product.productName &&
                    c.productsGroup === "" &&
                    c.minuySochen === true
                );

                const payloadMinuy = {
                  AgentId: effectiveAgentId,
                  company: company.companyName,
                  productsGroup: "",
                  product: product.productName,
                  commissionHekef: "",
                  commissionNifraim: nifraimMinuyNormalized?.normalizedPercentNet || "",
                  commissionNiud: "",
                  minuySochen: true,

                  commissionHekefDisplay: "",
                  commissionNifraimDisplay: nifraimMinuyRaw || "",
                  commissionNiudDisplay: "",

                  commissionHekefDisplayVatIncluded: vatMode === "includes_vat",
                  commissionNifraimDisplayVatIncluded: vatMode === "includes_vat",
                  commissionNiudDisplayVatIncluded: vatMode === "includes_vat",
                };

                if (existingMinuy) {
                  batch.update(doc(db, "contracts", existingMinuy.id), payloadMinuy);
                } else {
                  const newRef = doc(collection(db, "contracts"));
                  batch.set(newRef, payloadMinuy);
                }
              });
            }
          });
        });
      });

      await batch.commit();
      await fetchContracts();
      alert("נשמר בהצלחה");
    } catch (error) {
      console.error("saveContracts error:", error);
      alert("שגיאה בשמירה");
    }
  };

  return (
    <div className="contracts-page" dir="rtl">
<div className="top-toolbar">
  <div className="toolbar-actions">
    {detail?.role === "admin" && (
      <select
        value={selectedAgentId}
        onChange={handleAgentChange}
        className="toolbar-select"
      >
        <option value="">בחר סוכן</option>
        {agents.map((agent: any) => (
          <option key={agent.id} value={agent.id}>
            {agent.name}
          </option>
        ))}
      </select>
    )}

    <button
      type="button"
      onClick={saveContracts}
      className="save-button"
    >
      שמור
    </button>
  </div>

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
</div>
      {visibleTables.map((table: any) => (
        <div key={table.key} className="table-card">
          <div className="table-card-header">
            <div className="table-title">{table.title}</div>
            <div className="table-note">{table.note}</div>
          </div>

          {table.sections.map((section: any) => {
            const companiesForGroup =
              visibleCompaniesByGroup[String(section.productGroupId)] || [];

            return (
              <div key={section.key} className="section-block">
                <div className="section-title">{section.label}</div>

                <div className="table-wrapper">
                  <table className="contracts-table">
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
                                const defaultKey = buildDefaultKey(
                                  table.key,
                                  section.key,
                                  row.label
                                );
                                const defaultValue = defaultValues[defaultKey] || "";

                                return (
                                  <>
                                    <input
                                      className="contracts-input"
                                      value={defaultValue}
                                      placeholder={getPlaceholder(row.valueMode)}
                                      onChange={(e) =>
                                        setDefaultValues((prev) => ({
                                          ...prev,
                                          [defaultKey]: e.target.value,
                                        }))
                                      }
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
                                  className="contracts-input"
                                  value={value}
                                  placeholder={getPlaceholder(row.valueMode)}
                                  onChange={(e) =>
                                    setCellValues((prev) => ({
                                      ...prev,
                                      [key]: e.target.value,
                                    }))
                                  }
                                />

                                {value && (
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
    </div>
  );
};

export default NewManageContractsTables;