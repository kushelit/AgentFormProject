'use client';

import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase";
import { CONTRACTS_TABLES_CONFIG } from "@/config/contractsTablesConfig";
import { normalizeCommissionForSave } from "@/utils/contractsTablesNormalize";
import "./NewManageContractsTables.css";
import * as XLSX from "xlsx";

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
};

const NewManageContractsTables = () => {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [productsGroups, setProductsGroups] = useState<ProductsGroupRow[]>([]);
  const [productSubGroups, setProductSubGroups] = useState<ProductSubGroupRow[]>([]);
  const [cellValues, setCellValues] = useState<Record<string, string>>({});
  const [importKey, setImportKey] = useState(0);

  useEffect(() => {
    fetchMeta();
  }, []);

  const fetchMeta = async () => {
    const [companySnap, groupSnap, subGroupSnap] = await Promise.all([
      getDocs(collection(db, "company")),
      getDocs(collection(db, "productsGroup")),
      getDocs(collection(db, "productSubGroups")),
    ]);

    setCompanies(companySnap.docs.map((d) => ({ id: d.id, ...d.data() } as CompanyRow)));
    setProductsGroups(groupSnap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductsGroupRow)));
    setProductSubGroups(subGroupSnap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductSubGroupRow)));
  };

  const companiesById = useMemo(() => {
    const map: Record<string, CompanyRow> = {};
    companies.forEach((c) => (map[c.id] = c));
    return map;
  }, [companies]);

  const visibleCompaniesByGroup = useMemo(() => {
    const map: Record<string, CompanyRow[]> = {};

    productsGroups.forEach((g) => {
      map[g.id] = (g.companyIds || [])
        .map((id) => companiesById[String(id)])
        .filter(Boolean);
    });

    return map;
  }, [productsGroups, companiesById]);

  const getPlaceholder = (mode: string) => {
    return mode === "percent" ? "0.5" : "5000";
  };

  const getVatMode = (tableKey: string) => {
    return tableKey === "risk" ? "excludes_vat" : "includes_vat";
  };

  const getHelper = (value: string, mode: any, tableKey: string) => {
    return normalizeCommissionForSave(value, mode, getVatMode(tableKey)).helperText;
  };

const buildCellKey = (
  tableKey: string,
  sectionKey: string,
  rowLabel: string,
  companyId: string
) => {
  return `${tableKey}-${sectionKey}-${rowLabel}-${companyId}`;
};

const exportExcelTemplate = () => {
  const workbook = XLSX.utils.book_new();

  CONTRACTS_TABLES_CONFIG.forEach((table: any) => {
    const rows: any[][] = [];

    rows.push([table.title]);
    rows.push([table.note]);
    rows.push([]);

    table.sections.forEach((section: any) => {
      const companiesForGroup =
        visibleCompaniesByGroup[String(section.productGroupId)] || [];

      rows.push([section.label]);
      rows.push(["סוג עמלה", ...companiesForGroup.map((c: any) => c.companyName)]);

      section.rows.forEach((row: any) => {
        rows.push([
          row.label,
          ...companiesForGroup.map((company: any) => {
            const key = buildCellKey(
              table.key,
              section.key,
              row.label,
              company.id
            );
            return cellValues[key] || "";
          }),
        ]);
      });

      rows.push([]);
    });

    const worksheet = XLSX.utils.aoa_to_sheet(rows);

    worksheet["!cols"] = [
      { wch: 24 },
      ...Array(20).fill({ wch: 16 }),
    ];

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      table.title.substring(0, 31)
    );
  });

  XLSX.writeFile(workbook, "contracts_tables_template.xlsx");
};

const importExcelTemplate = async (
  event: React.ChangeEvent<HTMLInputElement>
) => {
  const file = event.target.files?.[0];
  if (!file) return;

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  const nextValues: Record<string, string> = { ...cellValues };

  CONTRACTS_TABLES_CONFIG.forEach((table: any) => {
    const sheetName = table.title.substring(0, 31);
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) return;

    const data = XLSX.utils.sheet_to_json<any[]>(worksheet, {
      header: 1,
      defval: "",
    });

    let rowIndex = 0;

    table.sections.forEach((section: any) => {
      const companiesForGroup =
        visibleCompaniesByGroup[String(section.productGroupId)] || [];

      while (
        rowIndex < data.length &&
        String(data[rowIndex]?.[0] || "").trim() !== section.label
      ) {
        rowIndex++;
      }

      if (rowIndex >= data.length) return;

      rowIndex += 2;

      section.rows.forEach((row: any) => {
        const excelRow = data[rowIndex] || [];
        const rowLabel = String(excelRow[0] || "").trim();

        if (rowLabel !== row.label) {
          rowIndex++;
          return;
        }

        companiesForGroup.forEach((company: any, companyIndex: number) => {
          const rawValue = String(excelRow[companyIndex + 1] || "").trim();
          const key = buildCellKey(
            table.key,
            section.key,
            row.label,
            company.id
          );
          nextValues[key] = rawValue;
        });

        rowIndex++;
      });

      rowIndex++;
    });
  });

  setCellValues(nextValues);

  event.target.value = "";
};


  return (
    <div className="contracts-page" dir="rtl">
      <div
  style={{
    display: "flex",
    gap: "10px",
    alignItems: "center",
    marginBottom: "8px",
    flexWrap: "wrap",
  }}
>
  <button
    type="button"
    onClick={exportExcelTemplate}
    style={{
      padding: "8px 14px",
      borderRadius: "10px",
      border: "1px solid #cbd5e1",
      background: "#fff",
      cursor: "pointer",
      fontWeight: 600,
    }}
  >
    הורד תבנית אקסל
  </button>

  <label
    style={{
      padding: "8px 14px",
      borderRadius: "10px",
      border: "1px solid #cbd5e1",
      background: "#fff",
      cursor: "pointer",
      fontWeight: 600,
    }}
  >
    טען אקסל
    <input
      key={importKey}
      type="file"
      accept=".xlsx,.xls"
      onChange={(e) => {
        importExcelTemplate(e);
        setImportKey((prev) => prev + 1);
      }}
      style={{ display: "none" }}
    />
  </label>
</div>
      {CONTRACTS_TABLES_CONFIG.map((table: any) => (
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

                          {companiesForGroup.map((company) => {
                            const key = `${table.key}-${section.key}-${row.label}-${company.id}`;
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

                                <div className="cell-helper">
                                  {getHelper(value, row.valueMode, table.key)}
                                </div>
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