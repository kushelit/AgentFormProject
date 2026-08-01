'use client';

import { ChangeEvent, useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import * as XLSX from 'xlsx';

import { functions } from '@/lib/firebase/firebase';

const COL = {
  FULL_NAME: 'שם מלא',
  PHONE: 'טלפון',
  EMAIL: 'אימייל',
  ID_NUMBER: 'תעודת זהות',
  BIRTH_DATE: 'תאריך לידה',
  GENDER: 'מגדר',
  TAGS: 'תגיות',
  NOTES: 'הערות',
} as const;

const REQUIRED_HEADERS = [
  COL.FULL_NAME,
  COL.PHONE,
  COL.EMAIL,
];

const EXAMPLE_ID = '123456789';
const BATCH_SIZE = 100;

type ParsedContactRow = {
  rowNumber: number;
  fullName: string;
  phone: string;
  email: string;
  idNumber: string;
  birthDate: string;
  gender: string;
  tags: string[];
  notes: string;
};

type InvalidRow = {
  rowNumber: number;
  error: string;
};

type ImportResponse = {
  ok: boolean;
  partialSuccess: boolean;
  received: number;
  created: number;
  updated: number;
  failed: number;
  results: Array<{
    rowNumber: number;
    ok: boolean;
    error?: string;
  }>;
};

type Props = {
  agentId: string;
  onClose: () => void;
  onImported: () => void | Promise<void>;
};

function cellText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).trim();
}

function normalizeDate(value: unknown): string {
  if (!value) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const raw = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (match) {
    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');

    return `${match[3]}-${month}-${day}`;
  }

  return raw;
}

function splitTags(value: unknown): string[] {
  return String(value ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function createImportId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  return `excel_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}`;
}

export default function ImportMagicTouchExcelModal({
  agentId,
  onClose,
  onImported,
}: Props) {
  const [fileName, setFileName] = useState('');
  const [validRows, setValidRows] = useState<ParsedContactRow[]>([]);
  const [invalidRows, setInvalidRows] = useState<InvalidRow[]>([]);

  const [isReading, setIsReading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [result, setResult] = useState<{
    created: number;
    updated: number;
    failed: number;
  } | null>(null);

  const previewRows = useMemo(
    () => validRows.slice(0, 20),
    [validRows]
  );

  const resetFileState = () => {
    setFileName('');
    setValidRows([]);
    setInvalidRows([]);
    setResult(null);
    setErrorMessage('');
  };

  const handleFileChange = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    resetFileState();

    if (!file) {
      return;
    }

    if (!agentId) {
      setErrorMessage('לא נמצא סוכן פעיל.');
      return;
    }

    setIsReading(true);
    setFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();

      const workbook = XLSX.read(buffer, {
        type: 'array',
        cellDates: true,
      });

      const worksheet =
        workbook.Sheets['אנשי קשר'] ||
        workbook.Sheets[workbook.SheetNames[0]];

      if (!worksheet) {
        throw new Error('לא נמצאה לשונית אנשי קשר בקובץ.');
      }

      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        worksheet,
        {
          defval: '',
          raw: false,
        }
      );

      const headerRow = XLSX.utils.sheet_to_json<unknown[]>(
        worksheet,
        {
          header: 1,
          range: 0,
          blankrows: false,
        }
      )[0] || [];

      const headers = headerRow
        .map((header) => cellText(header))
        .filter(Boolean);

      const missingHeaders = REQUIRED_HEADERS.filter(
        (header) => !headers.includes(header)
      );

      if (missingHeaders.length > 0) {
        throw new Error(
          `חסרות עמודות בתבנית: ${missingHeaders.join(', ')}`
        );
      }

      const nextValidRows: ParsedContactRow[] = [];
      const nextInvalidRows: InvalidRow[] = [];

      rows.forEach((row, index) => {
        const rowNumber = index + 2;

        const fullName = cellText(row[COL.FULL_NAME]);
        const phone = cellText(row[COL.PHONE]);
        const email = cellText(row[COL.EMAIL]);
        const idNumber = cellText(row[COL.ID_NUMBER]);

        const isCompletelyEmpty =
          !fullName &&
          !phone &&
          !email &&
          !idNumber;

        if (isCompletelyEmpty) {
          return;
        }

        if (idNumber === EXAMPLE_ID) {
          return;
        }

        const errors: string[] = [];

        if (!fullName) {
          errors.push('חסר שם מלא');
        }

        if (!phone && !email) {
          errors.push('חובה להזין טלפון או אימייל');
        }

        const gender = cellText(row[COL.GENDER]);

        if (
          gender &&
          !['זכר', 'נקבה', 'אחר'].includes(gender)
        ) {
          errors.push('מגדר לא תקין');
        }

        if (errors.length > 0) {
          nextInvalidRows.push({
            rowNumber,
            error: errors.join('; '),
          });

          return;
        }

        nextValidRows.push({
          rowNumber,
          fullName,
          phone,
          email,
          idNumber,
          birthDate: normalizeDate(row[COL.BIRTH_DATE]),
          gender,
          tags: splitTags(row[COL.TAGS]),
          notes: cellText(row[COL.NOTES]),
        });
      });

      setValidRows(nextValidRows);
      setInvalidRows(nextInvalidRows);

      if (
        nextValidRows.length === 0 &&
        nextInvalidRows.length === 0
      ) {
        setErrorMessage(
          'לא נמצאו אנשי קשר לייבוא. שורת הדוגמה אינה מיובאת.'
        );
      }
    } catch (error: any) {
      console.error(
        '[ImportMagicTouchExcelModal] File parsing failed',
        error
      );

      setErrorMessage(
        error?.message || 'כשל בקריאת קובץ Excel.'
      );

      setValidRows([]);
      setInvalidRows([]);
    } finally {
      setIsReading(false);
      event.target.value = '';
    }
  };

  const handleImport = async () => {
    if (isImporting || validRows.length === 0) {
      return;
    }

    setIsImporting(true);
    setErrorMessage('');
    setResult(null);

    const importId = createImportId();

    let totalCreated = 0;
    let totalUpdated = 0;
    let totalFailed = 0;

    try {
      const fn = httpsCallable<
        {
          agentId: string;
          importId: string;
          fileName: string;
          rows: ParsedContactRow[];
        },
        ImportResponse
      >(
        functions,
        'importMagicTouchExcelContacts'
      );

      for (
        let index = 0;
        index < validRows.length;
        index += BATCH_SIZE
      ) {
        const batchRows = validRows.slice(
          index,
          index + BATCH_SIZE
        );

        const response = await fn({
          agentId,
          importId,
          fileName,
          rows: batchRows,
        });

        totalCreated += response.data.created || 0;
        totalUpdated += response.data.updated || 0;
        totalFailed += response.data.failed || 0;
      }

      setResult({
        created: totalCreated,
        updated: totalUpdated,
        failed: totalFailed,
      });

      await onImported();
    } catch (error: any) {
      console.error(
        '[ImportMagicTouchExcelModal] Import failed',
        error
      );

      setErrorMessage(
        error?.message ||
          'כשל בייבוא אנשי הקשר ל־Magic Touch.'
      );
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (
          event.target === event.currentTarget &&
          !isReading &&
          !isImporting
        ) {
          onClose();
        }
      }}
    >
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b px-6 py-5">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              ייבוא אנשי קשר מ־Excel
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              העלי את תבנית Magic Touch לאחר שמילאת את אנשי הקשר.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isReading || isImporting}
            className="rounded-lg px-3 py-1 text-xl text-slate-500 hover:bg-slate-100 disabled:opacity-50"
          >
            ×
          </button>
        </div>

        <div className="space-y-5 p-6">
          {errorMessage ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
            <input
              id="magic-touch-excel-file"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              disabled={isReading || isImporting}
              className="hidden"
            />

            <label
              htmlFor="magic-touch-excel-file"
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700"
            >
              <span>📄</span>
              <span>
                {isReading
                  ? 'קורא קובץ...'
                  : 'בחירת קובץ Excel'}
              </span>
            </label>

            {fileName ? (
              <div className="mt-3 text-sm text-slate-600">
                קובץ נבחר: <strong>{fileName}</strong>
              </div>
            ) : null}
          </div>

          {validRows.length > 0 || invalidRows.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-xl border bg-slate-50 p-4 text-center">
                <div className="text-sm text-slate-500">
                  שורות שנקראו
                </div>
                <div className="mt-1 text-2xl font-bold">
                  {validRows.length + invalidRows.length}
                </div>
              </div>

              <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
                <div className="text-sm text-green-700">
                  תקינות לייבוא
                </div>
                <div className="mt-1 text-2xl font-bold text-green-800">
                  {validRows.length}
                </div>
              </div>

              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
                <div className="text-sm text-red-700">
                  שורות עם שגיאה
                </div>
                <div className="mt-1 text-2xl font-bold text-red-800">
                  {invalidRows.length}
                </div>
              </div>
            </div>
          ) : null}

          {previewRows.length > 0 ? (
            <section>
              <h3 className="mb-3 font-bold text-slate-900">
                תצוגה מקדימה
              </h3>

              <div className="overflow-x-auto rounded-xl border">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="px-3 py-2 text-right">
                        שורה
                      </th>
                      <th className="px-3 py-2 text-right">
                        שם מלא
                      </th>
                      <th className="px-3 py-2 text-right">
                        טלפון
                      </th>
                      <th className="px-3 py-2 text-right">
                        אימייל
                      </th>
                      <th className="px-3 py-2 text-right">
                        תעודת זהות
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {previewRows.map((row) => (
                      <tr
                        key={row.rowNumber}
                        className="border-t"
                      >
                        <td className="px-3 py-2">
                          {row.rowNumber}
                        </td>
                        <td className="px-3 py-2">
                          {row.fullName}
                        </td>
                        <td
                          className="px-3 py-2"
                          dir="ltr"
                        >
                          {row.phone || '—'}
                        </td>
                        <td
                          className="px-3 py-2"
                          dir="ltr"
                        >
                          {row.email || '—'}
                        </td>
                        <td className="px-3 py-2">
                          {row.idNumber || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {validRows.length > previewRows.length ? (
                <div className="mt-2 text-xs text-slate-500">
                  מוצגות 20 השורות הראשונות מתוך {validRows.length}.
                </div>
              ) : null}
            </section>
          ) : null}

          {invalidRows.length > 0 ? (
            <section>
              <h3 className="mb-3 font-bold text-red-700">
                שורות שלא ייובאו
              </h3>

              <div className="max-h-48 overflow-y-auto rounded-xl border border-red-200 bg-red-50">
                {invalidRows.map((row) => (
                  <div
                    key={`${row.rowNumber}-${row.error}`}
                    className="border-b border-red-100 px-4 py-2 text-sm text-red-700 last:border-b-0"
                  >
                    שורה {row.rowNumber}: {row.error}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {result ? (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-4 text-green-800">
              הייבוא הסתיים: {result.created} נוצרו,{' '}
              {result.updated} עודכנו, {result.failed} נכשלו.
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-5">
            <button
              type="button"
              onClick={onClose}
              disabled={isReading || isImporting}
              className="rounded-lg border px-5 py-2.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              סגור
            </button>

            <button
              type="button"
              onClick={handleImport}
              disabled={
                isReading ||
                isImporting ||
                validRows.length === 0
              }
              className="rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isImporting
                ? 'מייבא...'
                : `ייבוא ${validRows.length} אנשי קשר`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}