import ExcelJS from "exceljs";

export async function generateContractsTemplateExcel({
  tables,
  companiesByGroup,
}: any) {
  const workbook = new ExcelJS.Workbook();

  for (const table of tables) {
    const sheet = workbook.addWorksheet(table.title, {
      views: [{ rightToLeft: true }],
    });

    let rowIndex = 1;

    sheet.getCell(rowIndex, 1).value = table.title;
    sheet.getCell(rowIndex, 1).font = { bold: true, size: 16 };
    rowIndex += 2;

    for (const section of table.sections) {
      const companies = companiesByGroup[section.productGroupId] || [];

      sheet.getCell(rowIndex, 1).value = section.label;
      sheet.getCell(rowIndex, 1).font = { bold: true };
      rowIndex++;

      const headers = [
        "סוג עמלה",
        ...(table.showDefaultColumn ? ["ברירת מחדל"] : []),
        ...companies.map((c: any) => c.companyName),
      ];

      headers.forEach((h, i) => {
        const cell = sheet.getCell(rowIndex, i + 1);
        cell.value = h;
        cell.font = { bold: true };
      });

      rowIndex++;

      for (const row of section.rows) {
        sheet.getCell(rowIndex, 1).value = row.label;

        let col = 2;

        if (table.showDefaultColumn) {
          sheet.getCell(rowIndex, col).value = "";
          col++;
        }

        companies.forEach(() => {
          sheet.getCell(rowIndex, col).value = "";
          col++;
        });

        rowIndex++;
      }

      rowIndex += 2;
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return {
    buffer,
    filename: "contracts-template.xlsx",
  };
}