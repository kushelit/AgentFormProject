import ExcelJS from 'exceljs';

const HEADERS = [
  'שם מלא',
  'טלפון',
  'אימייל',
  'תעודת זהות',
  'תאריך לידה',
  'מגדר',
  'תגיות',
  'הערות',
];

export async function generateMagicTouchContactsTemplateExcel(): Promise<{
  buffer: ExcelJS.Buffer;
  filename: string;
}> {
  const workbook = new ExcelJS.Workbook();

  workbook.creator = 'Magic Touch';
  workbook.created = new Date();

  const contactsSheet = workbook.addWorksheet('אנשי קשר', {
    views: [
      {
        rightToLeft: true,
        state: 'frozen',
        ySplit: 1,
      },
    ],
  });

  contactsSheet.addRow(HEADERS);

  const headerRow = contactsSheet.getRow(1);

  headerRow.height = 26;
  headerRow.font = {
    bold: true,
  };

  headerRow.alignment = {
    horizontal: 'center',
    vertical: 'middle',
  };

  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: {
        argb: 'FFDCE6F1',
      },
    };

    cell.border = {
      bottom: {
        style: 'thin',
        color: {
          argb: 'FF94A3B8',
        },
      },
    };
  });

  /*
   * שורת דוגמה.
   * במסך ההעלאה נדלג על השורה כאשר תעודת הזהות היא 123456789.
   */
  contactsSheet.addRow([
    'ישראל ישראלי',
    '0501234567',
    'israel@example.com',
    '123456789',
    '1990-01-15',
    'זכר',
    'לקוח קיים, מעקב',
    'שורת דוגמה — ניתן למחוק לפני ההעלאה',
  ]);

  const exampleRow = contactsSheet.getRow(2);

  exampleRow.font = {
    italic: true,
    color: {
      argb: 'FF64748B',
    },
  };

  contactsSheet.columns = [
    {
      key: 'fullName',
      width: 24,
    },
    {
      key: 'phone',
      width: 18,
    },
    {
      key: 'email',
      width: 30,
    },
    {
      key: 'idNumber',
      width: 18,
    },
    {
      key: 'birthDate',
      width: 18,
    },
    {
      key: 'gender',
      width: 14,
    },
    {
      key: 'tags',
      width: 32,
    },
    {
      key: 'notes',
      width: 42,
    },
  ];

  contactsSheet.getColumn(2).numFmt = '@';
  contactsSheet.getColumn(4).numFmt = '@';

 for (let rowNumber = 2; rowNumber <= 1000; rowNumber++) {
  contactsSheet.getCell(`F${rowNumber}`).dataValidation = {
    type: 'list',
    allowBlank: true,
    formulae: ['"זכר,נקבה,אחר"'],
    showErrorMessage: true,
    errorTitle: 'ערך לא תקין',
    error: 'יש לבחור זכר, נקבה או אחר',
  };
}

  contactsSheet.autoFilter = {
    from: 'A1',
    to: 'H1',
  };

  const instructionsSheet = workbook.addWorksheet('הנחיות', {
    views: [
      {
        rightToLeft: true,
      },
    ],
  });

  instructionsSheet.columns = [
    {
      width: 26,
    },
    {
      width: 85,
    },
  ];

  instructionsSheet.addRow([
    'נושא',
    'הנחיה',
  ]);

  instructionsSheet.addRows([
    [
      'שם מלא',
      'שדה חובה. לדוגמה: ישראל ישראלי.',
    ],
    [
      'טלפון או אימייל',
      'בכל שורה חייב להופיע לפחות מספר טלפון או כתובת אימייל.',
    ],
    [
      'טלפון',
      'ניתן להזין 0501234567, 050-1234567 או מספר בפורמט בינלאומי.',
    ],
    [
      'תאריך לידה',
      'מומלץ להזין בפורמט YYYY-MM-DD, לדוגמה 1990-01-15.',
    ],
    [
      'מגדר',
      'ניתן לבחור זכר, נקבה או אחר.',
    ],
    [
      'תגיות',
      'ניתן להזין מספר תגיות כשהן מופרדות בפסיקים.',
    ],
    [
      'שורת דוגמה',
      'השורה עם תעודת הזהות 123456789 היא שורת דוגמה ותידלג אוטומטית.',
    ],
    [
      'כותרות',
      'אין לשנות את שמות הכותרות. ניתן לשנות את סדר העמודות.',
    ],
  ]);

  const instructionsHeader =
    instructionsSheet.getRow(1);

  instructionsHeader.font = {
    bold: true,
  };

  instructionsHeader.alignment = {
    horizontal: 'center',
  };

  instructionsHeader.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: {
        argb: 'FFDCE6F1',
      },
    };
  });

  const buffer =
    await workbook.xlsx.writeBuffer();

  return {
    buffer,
    filename:
      'MagicTouch_תבנית_אנשי_קשר.xlsx',
  };
}