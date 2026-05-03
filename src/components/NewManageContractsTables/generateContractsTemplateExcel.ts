import ExcelJS from "exceljs";

function getVatModeByTableKey(tableKey: string): "includes_vat" | "excludes_vat" {
  return tableKey === "risk" ? "excludes_vat" : "includes_vat";
}

function getContractDisplayValue(contract: any, commissionType: string): string {
  if (!contract) return "";
  if (commissionType === "hekef") return contract.commissionHekefDisplay || contract.commissionHekef || "";
  if (commissionType === "nifraim") return contract.commissionNifraimDisplay || contract.commissionNifraim || "";
  if (commissionType === "niud") return contract.commissionNiudDisplay || contract.commissionNiud || "";
  return "";
}

function getPlaceholderText(valueMode: string, vatMode: string): string {
  const modeText = valueMode === "per_million" ? "לדוגמה: 1200" : "לדוגמה: 0.5";
  const vatText = vatMode === "includes_vat" ? "כולל מע״מ" : "ללא מע״מ";
  return `${modeText} | ${vatText}`;
}

const TABLE_HEADER_COLOR: Record<string, string> = {
  pension:    "FF4F81BD",
  retirement: "FF9B59B6",
  finance:    "FF217346",
  risk:       "FFC0392B",
  travel:     "FFE67E22",
};

const TABLE_LIGHT_COLOR: Record<string, string> = {
  pension:    "FFD6E4F7",
  retirement: "FFEDE0F7",
  finance:    "FFD6EEE0",
  risk:       "FFF7D6D6",
  travel:     "FFFDEEDD",
};

const HIDDEN_START_COL = 30;

export async function generateContractsTemplateExcel({
  tables,
  companiesByGroup,
  contracts = [],
  agentId = "",
  products = [],
}: any) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("הסכמים", {
    views: [{ rightToLeft: true }],
    properties: { defaultRowHeight: 20 },
  });

  let currentRow = 1;

  for (const table of tables || []) {
    const vatMode = getVatModeByTableKey(table.key);
    const headerColor = TABLE_HEADER_COLOR[table.key] || "FF4472C4";
    const lightColor  = TABLE_LIGHT_COLOR[table.key]  || "FFD6E4F7";

    for (const section of table.sections || []) {
      const companiesForGroup: any[] =
        companiesByGroup[String(section.productGroupId)] || [];

      const productsForSection = (products || []).filter((p: any) => {
        const sameGroup = String(p.productGroup) === String(section.productGroupId);
        const sectionSubGroupId = String(section.productSubGroupId || "").trim();
        const sameSubGroup = sectionSubGroupId
          ? String(p.productSubGroupId || "") === sectionSubGroupId
          : true;
        return sameGroup && sameSubGroup;
      });

      // זיהוי אם זה הסקשן הראשון בגרופ
      const firstSectionInGroup = table.sections.find(
        (s: any) => String(s.productGroupId) === String(section.productGroupId)
      );
      const isFirstSection = firstSectionInGroup?.key === section.key;

      const visibleCols = 2 + companiesForGroup.length;

      // ─── כותרת section ───
      const titleCell = sheet.getCell(currentRow, 1);
      titleCell.value = `${table.title}  ›  ${section.label}`;
      titleCell.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
      titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: headerColor } };
      titleCell.alignment = { horizontal: "right", vertical: "middle", readingOrder: "rtl" };
      titleCell.border = {
        top:    { style: "medium", color: { argb: headerColor } },
        bottom: { style: "medium", color: { argb: headerColor } },
        left:   { style: "medium", color: { argb: headerColor } },
        right:  { style: "medium", color: { argb: headerColor } },
      };
      sheet.getRow(currentRow).height = 26;
      if (visibleCols > 1) {
        sheet.mergeCells(currentRow, 1, currentRow, visibleCols);
      }
      currentRow++;

      // ─── כותרות עמודות ───
      const colHeaders = [
        "סוג עמלה",
        "ברירת מחדל",
        ...companiesForGroup.map((c: any) => c.companyName),
      ];

      colHeaders.forEach((header, colIdx) => {
        const cell = sheet.getCell(currentRow, colIdx + 1);
        cell.value = header;
        cell.font = { bold: true, size: 10, color: { argb: "FF1F3864" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: lightColor } };
        cell.alignment = { horizontal: "center", vertical: "middle", readingOrder: "rtl" };
        cell.border = {
          top:    { style: "thin",   color: { argb: headerColor } },
          bottom: { style: "medium", color: { argb: headerColor } },
          left:   { style: "thin",   color: { argb: "FFD0D0D0" } },
          right:  { style: "thin",   color: { argb: "FFD0D0D0" } },
        };
      });
      sheet.getRow(currentRow).height = 22;
      currentRow++;

      // ─── שורות עמלה ───
      for (const row of section.rows || []) {
        const isMinuy   = Boolean(row.minuySochen);
        const valueMode = row.valueMode || "percent";
        const rowBg     = isMinuy ? "FFFFF9F0" : "FFFFFFFF";
        const placeholderText = getPlaceholderText(valueMode, vatMode);
        const inputTitle      = valueMode === "per_million" ? "הזנה למיליון" : "הזנת אחוז";

        // עמודה 1 — תווית שורה
        const labelCell = sheet.getCell(currentRow, 1);
        labelCell.value = row.label;
        labelCell.font  = { size: 10, color: { argb: "FF1F3864" } };
        labelCell.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: lightColor } };
        labelCell.alignment = { horizontal: "right", vertical: "middle", readingOrder: "rtl", indent: 1 };
        labelCell.border = {
          top:    { style: "thin",   color: { argb: "FFE0E0E0" } },
          bottom: { style: "thin",   color: { argb: "FFE0E0E0" } },
          left:   { style: "thin",   color: { argb: "FFD0D0D0" } },
          right:  { style: "medium", color: { argb: headerColor } },
        };

        // עמודה 2 — ברירת מחדל
        const defaultCell = sheet.getCell(currentRow, 2);

        if (!isFirstSection) {
          // ─── סקשן משני — הצג הסבר במקום תא עריכה ───
          defaultCell.value = `משותף עם "${firstSectionInGroup?.label}"`;
          defaultCell.font = { size: 9, italic: true, color: { argb: "FF888888" } };
          defaultCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
          defaultCell.alignment = { horizontal: "center", vertical: "middle" };
          defaultCell.border = {
            top:    { style: "thin", color: { argb: "FFE0E0E0" } },
            bottom: { style: "thin", color: { argb: "FFE0E0E0" } },
            left:   { style: "thin", color: { argb: "FFD0D0D0" } },
            right:  { style: "thin", color: { argb: "FFD0D0D0" } },
          };
        } else {
          // ─── סקשן ראשון — תא עריכה רגיל ───
          const defaultContract = contracts.find(
            (c: any) =>
              c.AgentId === agentId &&
              c.productsGroup === String(section.productGroupId) &&
              c.company === "" &&
              c.product === "" &&
              Boolean(c.minuySochen) === isMinuy
          );
          const defaultValue = getContractDisplayValue(defaultContract, row.commissionType);

          defaultCell.value = defaultValue ? Number(defaultValue) || defaultValue : null;
          defaultCell.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: defaultValue ? "FFFFF3CD" : rowBg } };
          defaultCell.alignment = { horizontal: "center", vertical: "middle" };
          defaultCell.border = {
            top:    { style: "thin", color: { argb: "FFE0E0E0" } },
            bottom: { style: "thin", color: { argb: "FFE0E0E0" } },
            left:   { style: "thin", color: { argb: "FFD0D0D0" } },
            right:  { style: "thin", color: { argb: "FFD0D0D0" } },
          };
          defaultCell.dataValidation = {
            type: "decimal",
            operator: "greaterThanOrEqual",
            formulae: [0],
            showInputMessage: true,
            promptTitle: inputTitle,
            prompt: placeholderText,
            showErrorMessage: false,
          };
        }

        // עמודות חברות
        companiesForGroup.forEach((company: any, colIdx: number) => {
          const matchingContract = contracts.find((c: any) => {
            const sameCompany  = c.company === company.companyName;
            const sameMinuy    = Boolean(c.minuySochen) === isMinuy;
            const productMatch = productsForSection.some(
              (p: any) => p.productName === c.product
            );
            return (
              c.AgentId === agentId &&
              sameCompany &&
              sameMinuy &&
              c.productsGroup === "" &&
              productMatch
            );
          });

          const value = getContractDisplayValue(matchingContract, row.commissionType);
          const cell  = sheet.getCell(currentRow, 3 + colIdx);
          cell.value  = value ? Number(value) || value : null;
          cell.fill   = { type: "pattern", pattern: "solid", fgColor: { argb: value ? "FFFFF3CD" : rowBg } };
          cell.alignment = { horizontal: "center", vertical: "middle" };
          cell.border = {
            top:    { style: "thin", color: { argb: "FFE0E0E0" } },
            bottom: { style: "thin", color: { argb: "FFE0E0E0" } },
            left:   { style: "thin", color: { argb: "FFD0D0D0" } },
            right:  { style: "thin", color: { argb: "FFD0D0D0" } },
          };
          cell.dataValidation = {
            type: "decimal",
            operator: "greaterThanOrEqual",
            formulae: [0],
            showInputMessage: true,
            promptTitle: inputTitle,
            prompt: placeholderText,
            showErrorMessage: false,
          };
        });

        // ─── עמודות נסתרות — תמיד מעמודה 30 ───
        const metaCols = [
          table.key,
          section.key,
          row.commissionType,
          String(section.productGroupId),
          String(section.productSubGroupId || ""),
          isMinuy ? "true" : "false",
          valueMode,
          vatMode,
        ];

        metaCols.forEach((val, i) => {
          sheet.getCell(currentRow, HIDDEN_START_COL + i).value = val;
        });

        sheet.getRow(currentRow).height = 20;
        currentRow++;
      }

      currentRow += 2;
    }
  }

  sheet.getColumn(1).width = 24;
  sheet.getColumn(2).width = 16; // הרחבנו מעט לטקסט ההסבר
  for (let i = 3; i <= 29; i++) {
    sheet.getColumn(i).width = 12;
  }

  for (let i = HIDDEN_START_COL; i <= HIDDEN_START_COL + 7; i++) {
    sheet.getColumn(i).hidden = true;
  }

  const buffer   = await workbook.xlsx.writeBuffer();
  const date     = new Date().toISOString().slice(0, 10);
 const filename = `תבנית הזנת הסכמי עמלות - ${date}.xlsx`;


  return { buffer, filename };
}