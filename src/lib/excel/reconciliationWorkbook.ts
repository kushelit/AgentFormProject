// src/lib/excel/reconciliationWorkbook.ts
// "דוח התאמה לחברה" — אקסל מעוצב (exceljs, נטען דינמית רק בלחיצה).
// גיליונות: סיכום · נעלמו · נוספו · שינוי בעמלה · השוואה מלאה
// בכל גיליון פוליסות: דוח מקור, חודש א׳ מול חודש ב׳, פער כנוסחה, שורת SUM, מסננים, כותרת מוקפאת.
// בגיליון הסיכום: טבלת סטטוסים + "פערים לפי דוח" (לאיזה קובץ של החברה לפנות).

export type ReconRow = {
  company: string;
  template: string; // שם הדוח (תבנית המקור)
  policy: string;
  customerId: string;
  fullName: string;
  agentCode: string;
  product: string;
  p1: number | null;
  c1: number | null;
  r1: number | null; // אחוז (למשל 0.25 = 0.25%)
  p2: number | null;
  c2: number | null;
  r2: number | null;
  delta: number;
  statusLabel: string;
};

export type ReconStatusLine = { label: string; count: number; c1: number; c2: number; delta: number };

export type ReconTemplateLine = {
  company: string;
  template: string;
  removed: number;
  added: number;
  changed: number;
  c1: number;
  c2: number;
  delta: number;
};

export type ReconMeta = {
  title: string;
  agentName: string;
  basisLabel: string;
  m1Label: string;
  m2Label: string;
  scopeLabel: string;
  toleranceLabel: string;
  filterLabel?: string;
};

// ─── צבעים ───────────────────────────────────────────────────────────
const C = {
  navy: 'FF1E3A5F',
  navySoft: 'FF2E4A70',
  white: 'FFFFFFFF',
  m1: 'FFE6F1FB',
  m1Head: 'FF3B6EA8',
  m2: 'FFE7F6EE',
  m2Head: 'FF2F8A5B',
  delta: 'FFFFF7E6',
  deltaHead: 'FFB7791F',
  zebra: 'FFF7F9FC',
  border: 'FFD5DCE6',
  green: 'FF15803D',
  red: 'FFB91C1C',
  gray: 'FF64748B',
  totalFill: 'FFE9EEF5',
};

const NUM = '#,##0.00;[Red]-#,##0.00';
const DELTA = '+#,##0.00;[Red]-#,##0.00;0.00';
const PCT = '0.0%;[Red]-0.0%';
const RATE = '0.00"%"';

const thin = (argb = C.border) => ({ style: 'thin' as const, color: { argb } });
const boxBorder = (argb?: string) => ({ top: thin(argb), left: thin(argb), bottom: thin(argb), right: thin(argb) });
const solid = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } });

async function loadExcelJS(): Promise<any> {
  const mod: any = await import('exceljs');
  return mod.default ?? mod;
}

// ─── גיליון פוליסות ──────────────────────────────────────────────────
// עמודות: A חברה · B דוח · C פוליסה · D ת"ז · E שם · F מס׳ סוכן · G מוצר
//         H פרמיה1 · I עמלה1 · J %1 · K פרמיה2 · L עמלה2 · M %2 · N פער · O פער% · P סטטוס
function addPolicySheet(wb: any, name: string, rows: ReconRow[], meta: ReconMeta, tabColor?: string) {
  const ws = wb.addWorksheet(name, {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 2 }],
    properties: tabColor ? { tabColor: { argb: tabColor } } : undefined,
  });

  ws.columns = [
    { width: 12 }, { width: 24 }, { width: 14 }, { width: 12 }, { width: 22 }, { width: 11 }, { width: 20 }, // A-G פרטים
    { width: 13 }, { width: 13 }, { width: 9 }, // H-J חודש א׳
    { width: 13 }, { width: 13 }, { width: 9 }, // K-M חודש ב׳
    { width: 13 }, { width: 10 }, // N-O פער
    { width: 14 }, // P סטטוס
  ];

  const groups: Array<[string, string, string, string]> = [
    ['A1', 'G1', 'פרטי פוליסה', C.navy],
    ['H1', 'J1', meta.m1Label, C.m1Head],
    ['K1', 'M1', meta.m2Label, C.m2Head],
    ['N1', 'O1', 'פער', C.deltaHead],
    ['P1', 'P1', '', C.navy],
  ];
  groups.forEach(([from, to, text, fill]) => {
    if (from !== to) ws.mergeCells(`${from}:${to}`);
    const cell = ws.getCell(from);
    cell.value = text;
    cell.fill = solid(fill);
    cell.font = { bold: true, color: { argb: C.white }, size: 12 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  ws.getRow(1).height = 22;

  const headers = ['חברה', 'דוח', 'מס׳ פוליסה', 'ת"ז לקוח', 'שם לקוח', 'מספר סוכן', 'מוצר', 'פרמיה', 'עמלה', '% עמלה', 'פרמיה', 'עמלה', '% עמלה', 'פער עמלה', 'פער %', 'סטטוס'];
  const hr = ws.getRow(2);
  headers.forEach((h, i) => {
    const cell = hr.getCell(i + 1);
    cell.value = h;
    const col = i + 1;
    const fill = col >= 8 && col <= 10 ? C.m1Head : col >= 11 && col <= 13 ? C.m2Head : col >= 14 && col <= 15 ? C.deltaHead : C.navySoft;
    cell.fill = solid(fill);
    cell.font = { bold: true, color: { argb: C.white } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = boxBorder(C.white);
  });
  hr.height = 20;

  if (!rows.length) {
    ws.mergeCells('A3:P3');
    const c = ws.getCell('A3');
    c.value = 'אין פוליסות בקטגוריה זו';
    c.font = { italic: true, color: { argb: C.gray } };
    c.alignment = { horizontal: 'center' };
    return;
  }

  rows.forEach((r, i) => {
    const x = i + 3;
    const row = ws.getRow(x);
    row.values = [
      r.company, r.template, r.policy, r.customerId, r.fullName, r.agentCode, r.product,
      r.p1, r.c1, r.r1, r.p2, r.c2, r.r2,
      { formula: `N(L${x})-N(I${x})`, result: r.delta },
      r.c1 ? { formula: `IF(N(I${x})=0,"",(N(L${x})-N(I${x}))/ABS(N(I${x})))`, result: r.delta / Math.abs(r.c1) } : null,
      r.statusLabel,
    ];

    const zebra = i % 2 === 1;
    row.eachCell({ includeEmpty: true }, (cell: any, col: number) => {
      cell.border = boxBorder();
      cell.alignment = { vertical: 'middle', horizontal: col === 1 || col === 2 || col === 5 ? 'right' : 'center', wrapText: col === 2 };
      if (col >= 8 && col <= 10) cell.fill = solid(C.m1);
      else if (col >= 11 && col <= 13) cell.fill = solid(C.m2);
      else if (col >= 14 && col <= 15) cell.fill = solid(C.delta);
      else if (zebra) cell.fill = solid(C.zebra);
    });

    [8, 9, 11, 12].forEach((col) => (row.getCell(col).numFmt = NUM));
    [10, 13].forEach((col) => (row.getCell(col).numFmt = RATE));
    const d = row.getCell(14);
    d.numFmt = DELTA;
    d.font = { bold: true, color: { argb: r.delta > 0.004 ? C.green : r.delta < -0.004 ? C.red : C.gray } };
    row.getCell(15).numFmt = PCT;
    row.getCell(5).font = { bold: true };
    row.getCell(2).font = { color: { argb: C.navy } };
  });

  const last = rows.length + 2;
  const tx = last + 1;
  const sum = (key: string) => rows.reduce((acc, r) => acc + (Number((r as any)[key]) || 0), 0);
  const totalDelta = sum('delta');
  const tr = ws.getRow(tx);
  tr.values = [
    'סה"כ', `${rows.length} פוליסות`, '', '', '', '', '',
    { formula: `SUM(H3:H${last})`, result: sum('p1') },
    { formula: `SUM(I3:I${last})`, result: sum('c1') },
    '',
    { formula: `SUM(K3:K${last})`, result: sum('p2') },
    { formula: `SUM(L3:L${last})`, result: sum('c2') },
    '',
    { formula: `SUM(N3:N${last})`, result: totalDelta },
    '',
    '',
  ];
  tr.eachCell({ includeEmpty: true }, (cell: any, col: number) => {
    cell.fill = solid(C.totalFill);
    cell.font = { bold: true, color: { argb: col === 14 ? (totalDelta < -0.004 ? C.red : totalDelta > 0.004 ? C.green : C.navy) : C.navy } };
    cell.border = { top: { style: 'double', color: { argb: C.navy } }, bottom: thin(C.navy) };
    cell.alignment = { horizontal: col <= 2 ? 'right' : 'center', vertical: 'middle' };
  });
  [8, 9, 11, 12].forEach((col) => (tr.getCell(col).numFmt = NUM));
  tr.getCell(14).numFmt = DELTA;
  tr.height = 20;

  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: last, column: 16 } };
}

// ─── גיליון סיכום ────────────────────────────────────────────────────
function addSummarySheet(wb: any, meta: ReconMeta, lines: ReconStatusLine[], total: ReconStatusLine, byTemplate: ReconTemplateLine[]) {
  const ws = wb.addWorksheet('סיכום', { views: [{ rightToLeft: true, showGridLines: false }] });
  ws.columns = [{ width: 16 }, { width: 30 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 17 }, { width: 17 }, { width: 17 }];

  ws.mergeCells('A1:H1');
  const title = ws.getCell('A1');
  title.value = meta.title;
  title.font = { bold: true, size: 16, color: { argb: C.white } };
  title.fill = solid(C.navy);
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;

  const info: Array<[string, string]> = [
    ['סוכן', meta.agentName],
    ['השוואה לפי', meta.basisLabel],
    ['חודש א׳', meta.m1Label],
    ['חודש ב׳', meta.m2Label],
    ['רמת השוואה', meta.scopeLabel],
    ['סף סטייה', meta.toleranceLabel],
    ...(meta.filterLabel ? ([['סינון', meta.filterLabel]] as Array<[string, string]>) : []),
    ['הופק', new Date().toLocaleString('he-IL')],
  ];
  let r = 3;
  info.forEach(([k, v]) => {
    ws.mergeCells(`B${r}:H${r}`);
    const kc = ws.getCell(`A${r}`);
    const vc = ws.getCell(`B${r}`);
    kc.value = k;
    vc.value = v;
    kc.font = { bold: true, color: { argb: C.navy } };
    kc.fill = solid(C.totalFill);
    vc.alignment = { horizontal: 'right' };
    [kc, vc].forEach((c) => (c.border = { bottom: thin() }));
    r++;
  });

  // פער כולל — הדגשה
  r++;
  ws.mergeCells(`A${r}:D${r}`);
  ws.mergeCells(`E${r}:H${r}`);
  const kl = ws.getCell(`A${r}`);
  const kv = ws.getCell(`E${r}`);
  kl.value = `פער כולל (${meta.m2Label} מול ${meta.m1Label})`;
  kv.value = total.delta;
  kv.numFmt = DELTA + ' "₪"';
  kl.font = { bold: true, size: 13, color: { argb: C.navy } };
  kv.font = { bold: true, size: 16, color: { argb: total.delta < -0.004 ? C.red : total.delta > 0.004 ? C.green : C.navy } };
  [kl, kv].forEach((c) => {
    c.fill = solid(C.delta);
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = boxBorder(C.deltaHead);
  });
  ws.getRow(r).height = 40;

  // טבלת סטטוסים
  r += 2;
  // טבלת סטטוסים — עמודות A,B (תווית) · C (פוליסות) · F,G,H (סכומים)
  const STATUS_COLS = [1, 3, 6, 7, 8];
  ws.mergeCells(`A${r}:B${r}`);
  ws.mergeCells(`C${r}:E${r}`);
  const head = ['סטטוס', 'פוליסות', `עמלה · ${meta.m1Label}`, `עמלה · ${meta.m2Label}`, 'פער עמלה'];
  const hr = ws.getRow(r);
  head.forEach((h, i) => {
    const c = hr.getCell(STATUS_COLS[i]);
    c.value = h;
    c.fill = solid(C.navySoft);
    c.font = { bold: true, color: { argb: C.white } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = boxBorder(C.white);
  });
  hr.height = 32; // כותרות עם שם חודש ארוך — שתי שורות

  const writeLine = (rowNo: number, l: ReconStatusLine, isTotal = false) => {
    ws.mergeCells(`A${rowNo}:B${rowNo}`);
    ws.mergeCells(`C${rowNo}:E${rowNo}`);
    const row = ws.getRow(rowNo);
    const vals = [l.label, l.count, l.c1, l.c2, l.delta];
    STATUS_COLS.forEach((col, i) => {
      const c = row.getCell(col);
      c.value = vals[i];
      c.border = isTotal ? { top: { style: 'double', color: { argb: C.navy } }, bottom: thin(C.navy) } : boxBorder();
      c.alignment = { horizontal: i === 0 ? 'right' : 'center', vertical: 'middle' };
      if (isTotal) c.fill = solid(C.totalFill);
      c.font = { bold: isTotal || i === 4, color: { argb: i === 4 ? (l.delta < -0.004 ? C.red : l.delta > 0.004 ? C.green : C.gray) : C.navy } };
    });
    [6, 7].forEach((col) => (row.getCell(col).numFmt = NUM));
    row.getCell(8).numFmt = DELTA;
  };

  lines.forEach((l) => writeLine(++r, l));
  writeLine(++r, total, true);

  // ─── פערים לפי דוח ───
  if (byTemplate.length) {
    r += 2;
    ws.mergeCells(`A${r}:H${r}`);
    const tt = ws.getCell(`A${r}`);
    tt.value = 'פערים לפי דוח — מאיזה קובץ של החברה מגיעים הפערים';
    tt.font = { bold: true, size: 12, color: { argb: C.navy } };
    tt.border = { bottom: { style: 'medium', color: { argb: C.navy } } };
    r++;
    const th = ['חברה', 'דוח', 'נעלמו', 'נוספו', 'שינוי', `עמלה · ${meta.m1Label}`, `עמלה · ${meta.m2Label}`, 'פער עמלה'];
    const thr = ws.getRow(r);
    th.forEach((h, i) => {
      const c = thr.getCell(i + 1);
      c.value = h;
      c.fill = solid(C.navySoft);
      c.font = { bold: true, color: { argb: C.white } };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.border = boxBorder(C.white);
    });
    thr.height = 30;
    byTemplate.forEach((l, i) => {
      const row = ws.getRow(++r);
      row.values = [l.company, l.template, l.removed || null, l.added || null, l.changed || null, l.c1, l.c2, l.delta];
      row.eachCell({ includeEmpty: true }, (c: any, col: number) => {
        c.border = boxBorder();
        c.alignment = { horizontal: col <= 2 ? 'right' : 'center', vertical: 'middle', wrapText: col === 2 };
        if (i % 2 === 1) c.fill = solid(C.zebra);
      });
      row.getCell(3).font = { bold: !!l.removed, color: { argb: l.removed ? C.red : C.gray } };
      row.getCell(4).font = { bold: !!l.added, color: { argb: l.added ? C.green : C.gray } };
      [6, 7].forEach((col) => (row.getCell(col).numFmt = NUM));
      const d = row.getCell(8);
      d.numFmt = DELTA;
      d.font = { bold: true, color: { argb: l.delta < -0.004 ? C.red : l.delta > 0.004 ? C.green : C.gray } };
    });
  }

  r += 2;
  ws.mergeCells(`A${r}:H${r}`);
  const note = ws.getCell(`A${r}`);
  note.value = 'פער = עמלה בחודש ב׳ פחות עמלה בחודש א׳. פירוט הפוליסות בגיליונות "נעלמו", "נוספו", "שינוי בעמלה" ו"השוואה מלאה".';
  note.font = { italic: true, size: 9, color: { argb: C.gray } };
  note.alignment = { horizontal: 'right', wrapText: true };
  ws.getRow(r).height = 28;
}

function download(buffer: ArrayBuffer, fileName: string) {
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** דוח התאמה מלא */
export async function exportReconciliationXlsx(p: {
  meta: ReconMeta;
  statusLines: ReconStatusLine[];
  total: ReconStatusLine;
  byTemplate: ReconTemplateLine[];
  removed: ReconRow[];
  added: ReconRow[];
  changed: ReconRow[];
  all: ReconRow[];
  fileName: string;
}) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MagicSale';
  wb.created = new Date();

  addSummarySheet(wb, p.meta, p.statusLines, p.total, p.byTemplate);
  addPolicySheet(wb, 'נעלמו', p.removed, p.meta, 'FFDC2626');
  addPolicySheet(wb, 'נוספו', p.added, p.meta, 'FF16A34A');
  addPolicySheet(wb, 'שינוי בעמלה', p.changed, p.meta, 'FFD97706');
  addPolicySheet(wb, 'השוואה מלאה', p.all, p.meta, 'FF1E3A5F');

  download(await wb.xlsx.writeBuffer(), p.fileName);
}

/** גיליון בודד — "ייצוא הטבלה הזו" */
export async function exportPolicyTableXlsx(p: { meta: ReconMeta; sheetName: string; rows: ReconRow[]; fileName: string }) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MagicSale';
  addPolicySheet(wb, p.sheetName, p.rows, p.meta);
  download(await wb.xlsx.writeBuffer(), p.fileName);
}