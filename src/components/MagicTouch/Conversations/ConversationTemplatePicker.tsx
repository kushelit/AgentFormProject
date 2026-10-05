'use client';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/firebase';

/*
 * בחירת תבנית WhatsApp מאושרת מתוך שיחה (ווב).
 * מקבילה ל-TemplatePicker באפליקציית המובייל: אותו מקור נתונים
 * (agents/{agentId}/whatsapp_templates עם status APPROVED).
 */

export type ConversationTemplateRow = {
  id: string;
  name: string;
  bodyText: string;
  category: string;
  language: string;
};

export default function ConversationTemplatePicker({
  agentId,
  isOpen,
  isSending,
  onClose,
  onSelect,
}: {
  agentId: string;
  isOpen: boolean;
  isSending: boolean;
  onClose: () => void;
  onSelect: (template: ConversationTemplateRow) => void;
}) {
  const [rows, setRows] = useState<ConversationTemplateRow[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!isOpen || !agentId) {
      return;
    }

    setIsLoading(true);
    setLoadError('');

    const unsubscribe = onSnapshot(
      query(
        collection(db, 'agents', agentId, 'whatsapp_templates'),
        where('status', '==', 'APPROVED')
      ),
      (snapshot) => {
        const nextRows = snapshot.docs
          .map((templateDoc) => {
            const data = templateDoc.data() as Record<string, unknown>;

            return {
              id: templateDoc.id,
              name: String(data?.name || templateDoc.id),
              bodyText: String(data?.bodyText || ''),
              category: String(data?.category || ''),
              language: String(data?.language || ''),
            };
          })
          .sort((left, right) => left.name.localeCompare(right.name));

        setRows(nextRows);
        setIsLoading(false);
      },
      (error) => {
        console.error('[ConversationTemplatePicker] Failed to load templates', error);
        setRows([]);
        setIsLoading(false);
        setLoadError('לא ניתן היה לטעון את התבניות.');
      }
    );

    return () => unsubscribe();
  }, [agentId, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setSearch('');
    }
  }, [isOpen]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return rows;
    }

    return rows.filter((row) =>
      [row.name, row.bodyText, row.category]
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  }, [rows, search]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white text-right shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">שליחת תבנית</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              תבניות WhatsApp מאושרות. אפשר לשלוח גם כשחלון השירות סגור.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="סגירה"
          >
            ×
          </button>
        </div>

        <div className="border-b p-3">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="חיפוש תבנית"
            className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-slate-500">טוען תבניות...</div>
          ) : loadError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {loadError}
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">
              {rows.length === 0
                ? 'אין תבניות מאושרות. אפשר ליצור תבנית במסך התבניות.'
                : 'לא נמצאו תבניות מתאימות.'}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredRows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  disabled={isSending}
                  onClick={() => onSelect(row)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-right transition hover:border-green-300 hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate font-bold text-slate-900" dir="ltr">
                      {row.name}
                    </div>
                    <div className="shrink-0 text-[11px] text-slate-500">
                      {[row.category, row.language].filter(Boolean).join(' · ')}
                    </div>
                  </div>

                  {row.bodyText ? (
                    <div className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                      {row.bodyText}
                    </div>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
