import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";

export const runtime = "nodejs";

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E5FA8" } };

export async function POST(req: NextRequest) {
  try {
    const { sheetName, headers, rows } = await req.json();

    if (!Array.isArray(headers) || !Array.isArray(rows)) {
      return NextResponse.json({ error: "headers ו-rows חייבים להיות מערכים" }, { status: 400 });
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(String(sheetName || "דוח").slice(0, 31), {
      views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
    });

    const headerRow = sheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = HEADER_FILL;
      cell.alignment = { horizontal: "right", vertical: "middle" };
    });
    headerRow.height = 20;

    rows.forEach((row: any[]) => {
      const addedRow = sheet.addRow(row);
      addedRow.alignment = { horizontal: "right" };
    });

    // רוחב עמודה אוטומטי לפי התוכן הארוך ביותר בעמודה (עם רצפה/תקרה סבירים)
    headers.forEach((h: string, i: number) => {
      const colValues = rows.map((r: any[]) => String(r[i] ?? ""));
      const longest = Math.max(String(h).length, ...colValues.map((v) => v.length), 8);
      sheet.getColumn(i + 1).width = Math.min(longest + 4, 45);
    });

    // סה"כ שורות בתחתית התצוגה
    const summaryRow = sheet.addRow([`סה"כ — ${rows.length} רשומות`]);
    summaryRow.getCell(1).font = { bold: true, italic: true, color: { argb: "FF5F5E5A" } };

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const fileBuffer = Buffer.isBuffer(arrayBuffer) ? arrayBuffer : Buffer.from(arrayBuffer as ArrayBuffer);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(String(sheetName || 'דוח'))}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("export-report error:", error);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}