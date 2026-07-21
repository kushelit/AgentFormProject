import ExcelJS from "exceljs";

// ─── Types ───────────────────────────────────────────────────────────────────

type ProductRow = { id: string; name: string; productGroup: string };
type PaymentStatusRow = { id: string; name: string };
type ReferrerRow = { id: string; name: string; active: boolean };

type GenerateParams = {
  agentId: string;
  isAgency4: boolean;
  companies: string[];
  products: ProductRow[];              // כבר מסונן מראש לקבוצות 1,4,6 בלבד
  statusPolicies: string[];
  workerNames: string[];
  sourceLeadNames: string[];
  paymentStatusOptions?: PaymentStatusRow[]; // agency3 בלבד
  depositStatusOptions?: PaymentStatusRow[]; // agency3 בלבד
  referrers?: ReferrerRow[];                 // agency4 בלבד
};

const DATA_VALIDATION_ROWS = 500;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E5FA8" } };

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = HEADER_FILL;
    cell.alignment = { horizontal: "right", vertical: "middle" };
  });
  row.height = 20;
}

function applyListValidation(sheet: ExcelJS.Worksheet, colLetter: string, formula: string) {
  for (let r = 2; r <= DATA_VALIDATION_ROWS + 1; r++) {
    sheet.getCell(`${colLetter}${r}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [formula],
      showErrorMessage: true,
      errorStyle: "warning",
      errorTitle: "ערך לא ברשימה",
      error: "הערך שהוזן לא נמצא ברשימת הערכים התקפים. אפשר לבחור מהרשימה הנפתחת, או לעיין בלשונית 'רשימות תקפות'.",
    };
  }
}

function colLetter(idx: number): string {
  // תומך עד 26 עמודות (מספיק כאן)
  return String.fromCharCode(64 + idx);
}

// ─── Generator ────────────────────────────────────────────────────────────────

export async function generatePensionFinanceTemplateExcel(
  params: GenerateParams
): Promise<{ buffer: ArrayBuffer; filename: string }> {
  const {
    isAgency4, companies, products, statusPolicies, workerNames, sourceLeadNames,
    paymentStatusOptions = [], depositStatusOptions = [], referrers = [],
  } = params;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("עסקאות - פנסיה ופיננסים", { views: [{ rightToLeft: true }] });

  const headers = [
    'תעודת זהות לקוח',        // A
    'שם פרטי',                 // B
    'שם משפחה',                // C
    'חברה',                    // D
    'מוצר',                    // E
    'חודש תפוקה (YYYY-MM-DD)', // F
    'סטטוס עסקה',              // G
    'מספר פוליסה (לא חובה)',
    'מינוי סוכן (כן/לא)',
    'עובד',
    'מקור ליד',
    'תאריך ביטול (YYYY-MM-DD)',
    'פרמיית פנסיה',
    'צבירת פנסיה',
    'פרמיית פיננסים',
    'צבירת פיננסים',
    'הערות',
    ...(isAgency4 ? [] : ['שולם היקף', 'שולם ניוד', 'סטטוס הפקדה']),
    ...(isAgency4 ? ['נציג מפנה', 'פעולה', 'חברה לניוד', 'סוג קופה לניוד', 'סטטוס קופה', 'סטטוס מועמד'] : []),
  ];

  const headerRow = sheet.addRow(headers);
  styleHeaderRow(headerRow);
  headers.forEach((_, i) => { sheet.getColumn(i + 1).width = 22; });

  const colOf = (name: string) => headers.indexOf(name) + 1;

  // ── שורת דוגמה ──
  const sampleRow: string[] = [
    '123456789', 'ישראל', 'ישראלי', companies[0] || '', products[0]?.name || '',
    '2026-01-01', statusPolicies[0] || '', '', 'לא', workerNames[0] || '', '', '',
    '3500', '', '', '', '',
  ];
  if (!isAgency4) sampleRow.push('', '', '');
  else sampleRow.push(referrers.find(r => r.active)?.name || '', 'קופה חדשה', '', '', 'פעיל', 'שכיר');
  const exampleRow = sheet.addRow(sampleRow);
  exampleRow.eachCell((cell) => { cell.font = { italic: true, color: { argb: "FF888888" } }; });

  // ── לשונית עזר ──
  const refSheet = workbook.addWorksheet("רשימות תקפות", { views: [{ rightToLeft: true }] });
  const activeReferrerNames = referrers.filter(r => r.active).map(r => r.name);
  const paymentNames = paymentStatusOptions.map(o => o.name);
  const depositNames = depositStatusOptions.map(o => o.name);
  const productNames = products.map(p => p.name);

  const refCols: { header: string; values: string[] }[] = [
    { header: 'חברות', values: companies },
    { header: 'מוצרים (פנסיה/פיננסים)', values: productNames },
    { header: 'סטטוסי עסקה', values: statusPolicies },
    { header: 'עובדים', values: workerNames },
    { header: 'מקורות ליד', values: sourceLeadNames },
    { header: 'כן / לא', values: ['כן', 'לא'] },
  ];
  if (!isAgency4) {
    refCols.push({ header: 'שולם היקף/ניוד', values: paymentNames });
    refCols.push({ header: 'סטטוס הפקדה', values: depositNames });
  } else {
    refCols.push({ header: 'נציגים מפנים פעילים', values: activeReferrerNames });
    refCols.push({ header: 'פעולה', values: ['קופה חדשה', 'ניוד'] });
    refCols.push({ header: 'סטטוס קופה', values: ['פעיל', 'לא פעיל'] });
    refCols.push({ header: 'סטטוס מועמד', values: ['עצמאי', 'שכיר'] });
  }

  refSheet.addRow(refCols.map(c => c.header));
  styleHeaderRow(refSheet.getRow(1));
  const maxLen = Math.max(1, ...refCols.map(c => c.values.length));
  for (let i = 0; i < maxLen; i++) {
    refSheet.addRow(refCols.map(c => c.values[i] || ''));
  }
  refCols.forEach((_, i) => { refSheet.getColumn(i + 1).width = 26; });

  const refRange = (colIdx: number, len: number) => {
    const col = colLetter(colIdx);
    return `'רשימות תקפות'!$${col}$2:$${col}$${Math.max(2, len + 1)}`;
  };

  // ── מיפוי: אינדקס עמודה בלשונית העזר לפי סדר refCols מעלה (1-based) ──
  let refIdx = 1;
  const refColIndex: Record<string, number> = {};
  refCols.forEach((c) => { refColIndex[c.header] = refIdx++; });

  applyListValidation(sheet, colLetter(colOf('חברה')), refRange(refColIndex['חברות'], companies.length));
  applyListValidation(sheet, colLetter(colOf('מוצר')), refRange(refColIndex['מוצרים (פנסיה/פיננסים)'], productNames.length));
  applyListValidation(sheet, colLetter(colOf('סטטוס עסקה')), refRange(refColIndex['סטטוסי עסקה'], statusPolicies.length));
  applyListValidation(sheet, colLetter(colOf('עובד')), refRange(refColIndex['עובדים'], workerNames.length));
  applyListValidation(sheet, colLetter(colOf('מקור ליד')), refRange(refColIndex['מקורות ליד'], sourceLeadNames.length));
  applyListValidation(sheet, colLetter(colOf('מינוי סוכן (כן/לא)')), refRange(refColIndex['כן / לא'], 2));

  if (!isAgency4) {
    applyListValidation(sheet, colLetter(colOf('שולם היקף')), refRange(refColIndex['שולם היקף/ניוד'], paymentNames.length));
    applyListValidation(sheet, colLetter(colOf('שולם ניוד')), refRange(refColIndex['שולם היקף/ניוד'], paymentNames.length));
    applyListValidation(sheet, colLetter(colOf('סטטוס הפקדה')), refRange(refColIndex['סטטוס הפקדה'], depositNames.length));
  } else {
    applyListValidation(sheet, colLetter(colOf('נציג מפנה')), refRange(refColIndex['נציגים מפנים פעילים'], activeReferrerNames.length));
    applyListValidation(sheet, colLetter(colOf('פעולה')), refRange(refColIndex['פעולה'], 2));
    applyListValidation(sheet, colLetter(colOf('חברה לניוד')), refRange(refColIndex['חברות'], companies.length));
    applyListValidation(sheet, colLetter(colOf('סוג קופה לניוד')), refRange(refColIndex['מוצרים (פנסיה/פיננסים)'], productNames.length));
    applyListValidation(sheet, colLetter(colOf('סטטוס קופה')), refRange(refColIndex['סטטוס קופה'], 2));
    applyListValidation(sheet, colLetter(colOf('סטטוס מועמד')), refRange(refColIndex['סטטוס מועמד'], 2));
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  const filename = `תבנית-פנסיה-פיננסים-${params.agentId}.xlsx`;
  return { buffer: arrayBuffer as ArrayBuffer, filename };
}