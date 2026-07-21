import ExcelJS from "exceljs";

// ─── Types ───────────────────────────────────────────────────────────────────

type ElementaryProductGroupRow = { id: string; label: string; order?: number };
type ElementaryProductRow = {
  id: string;
  label: string;
  productGroupId: string;
  hasMozalTrack?: boolean;
  isManual?: boolean;
  order?: number;
};
type CompanyRow = { id: string; companyName: string; elementaryManual?: boolean };
type ReferrerRow = { id: string; name: string; active: boolean };

type GenerateParams = {
  agentId: string;
  isAgency4: boolean;
  companies: CompanyRow[];        // supportsElementary === true בלבד
  groups: ElementaryProductGroupRow[];
  products: ElementaryProductRow[];
  statusPolicies?: string[];      // רק agency4 — סטטוסים פעילים מתוך statusPolicy
  referrers?: ReferrerRow[];      // רק agency4 — agentReferrers עבור agentId זה
};

// כמה שורות מראש לתת ולידציית dropdown (כדי שגם שורות שהמשתמש יוסיף בעצמו יקבלו dropdown)
const DATA_VALIDATION_ROWS = 500;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1E5FA8" },
};

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = HEADER_FILL;
    cell.alignment = { horizontal: "right", vertical: "middle" };
  });
  row.height = 20;
}

function applyListValidation(
  sheet: ExcelJS.Worksheet,
  colLetter: string,
  formula: string
) {
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

// ─── Generator ────────────────────────────────────────────────────────────────

export async function generateElementaryTemplateExcel(
  params: GenerateParams
): Promise<{ buffer: ArrayBuffer; filename: string }> {
  const { isAgency4, companies, groups, products, statusPolicies = [], referrers = [] } = params;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("פוליסות", {
    views: [{ rightToLeft: true }],
  });

  // ── כותרות עמודות ──
  // סדר קבוע — ה-upload route קורא לפי שם הכותרת, לא לפי אינדקס עמודה,
  // כדי שסידור ידני של עמודות ע"י המשתמש לא ישבור את הקליטה.
  // ⚠️ שדה "מסלול" קיים רק ל-agency3 (הוסר ל-agency4 לפי בקשה).
  const headers = [
    'תעודת זהות לקוח',      // A
    'שם פרטי',               // B
    'שם משפחה',              // C
    'טלפון',                 // D
    'חברה',                  // E
    'מוצר',                  // F
    ...(isAgency4 ? [] : ['מסלול (מוזל/רגיל — רק אם רלוונטי למוצר)']), // G (agency3 בלבד)
    'מספר פוליסה (לא חובה)',
    'רישוי / כתובת',
    'תאריך תחילה (YYYY-MM-DD)',
    'תאריך סיום (YYYY-MM-DD)',
    'פרמיה',
    ...(isAgency4 ? ['סטטוס', 'הערות', 'נציג מפנה'] : ['אחוז עמלה (רק לחברות ידניות)']),
  ];

  const headerRow = sheet.addRow(headers);
  styleHeaderRow(headerRow);
  headers.forEach((_, i) => { sheet.getColumn(i + 1).width = 22; });

  // ── מיקומי עמודות (1-based) — לפי סדר headers מעלה ──
  const colOf = (name: string) => headers.indexOf(name) + 1;
  const colLetter = (idx: number) => String.fromCharCode(64 + idx); // תומך עד 26 עמודות (מספיק כאן)

  const companyCol = colLetter(colOf('חברה'));
  const productCol = colLetter(colOf('מוצר'));
  const trackHeaderIdx = headers.findIndex(h => h.startsWith('מסלול'));
  const trackCol = trackHeaderIdx >= 0 ? colLetter(trackHeaderIdx + 1) : null;
  const statusCol = isAgency4 ? colLetter(colOf('סטטוס')) : null;
  const referrerCol = isAgency4 ? colLetter(colOf('נציג מפנה')) : null;

  // ── שורת דוגמה (להמחשה — המשתמש מוחק/דורס אותה) ──
  const sampleRow: string[] = [
    '123456789', 'ישראל', 'ישראלי', '0501234567',
    companies[0]?.companyName || '', products[0]?.label || '',
  ];
  if (!isAgency4) sampleRow.push('');
  sampleRow.push('', '', '', '', '3500');
  if (isAgency4) sampleRow.push(statusPolicies[0] || '', '', referrers.find(r => r.active)?.name || '');
  else sampleRow.push('');

  const exampleRow = sheet.addRow(sampleRow);
  exampleRow.eachCell((cell) => {
    cell.font = { italic: true, color: { argb: "FF888888" } };
  });

  // ── לשונית עזר: רשימות חוקיות — גם לעיון וגם כמקור ל-dropdown בפועל ──
  const refSheet = workbook.addWorksheet("רשימות תקפות", {
    views: [{ rightToLeft: true }],
  });

  const activeReferrerNames = referrers.filter((r) => r.active).map((r) => r.name);
  const plainProductLabels = products.map((p) => p.label);

  const refHeaders = isAgency4
    ? ['חברות', 'מוצרים', 'סטטוסים', 'נציגים מפנים פעילים']
    : ['חברות', 'מוצרים', 'מסלול'];
  refSheet.addRow(refHeaders);
  styleHeaderRow(refSheet.getRow(1));

  const refColumns: string[][] = isAgency4
    ? [companies.map(c => c.companyName), plainProductLabels, statusPolicies, activeReferrerNames]
    : [companies.map(c => c.companyName), plainProductLabels, ['מוזל', 'רגיל']];

  const maxLen = Math.max(1, ...refColumns.map((c) => c.length));
  for (let i = 0; i < maxLen; i++) {
    refSheet.addRow(refColumns.map((c) => c[i] || ''));
  }
  refColumns.forEach((_, i) => { refSheet.getColumn(i + 1).width = 30; });

  // ── עמודות בלשונית העזר, לצורך בניית טווחי הולידציה ──
  const refCompanyCol = 'A';
  const refProductCol = 'B';
  const refTrackCol = !isAgency4 ? 'C' : null;
  const refStatusCol = isAgency4 ? 'C' : null;
  const refReferrerCol = isAgency4 ? 'D' : null;

  const refRange = (col: string, len: number) => `'רשימות תקפות'!$${col}$2:$${col}$${Math.max(2, len + 1)}`;

  // ── הצמדת dropdown בפועל לכל השורות בלשונית הראשית ──
  applyListValidation(sheet, companyCol, refRange(refCompanyCol, companies.length));
  applyListValidation(sheet, productCol, refRange(refProductCol, plainProductLabels.length));
  if (trackCol && refTrackCol) applyListValidation(sheet, trackCol, refRange(refTrackCol, 2));
  if (statusCol && refStatusCol) applyListValidation(sheet, statusCol, refRange(refStatusCol, statusPolicies.length));
  if (referrerCol && refReferrerCol) applyListValidation(sheet, referrerCol, refRange(refReferrerCol, activeReferrerNames.length));

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  const filename = `תבנית-אלמנטרי-${params.agentId}.xlsx`;

  return { buffer: arrayBuffer as ArrayBuffer, filename };
}