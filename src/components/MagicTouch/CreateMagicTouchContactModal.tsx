'use client';

import { FormEvent, useState } from 'react';
import { httpsCallable } from 'firebase/functions';

import { functions } from '@/lib/firebase/firebase';

type CreateMagicTouchContactResponse = {
  ok: boolean;
  agentId: string;
  contactId: string;
  action: 'created' | 'updated';
  sourceSystem: 'manual';
  sourceRecordId: string;
};

type CreateMagicTouchContactRequest = {
  agentId: string;
  fullName: string;
  phone?: string;
  email?: string;
  idNumber?: string;
  birthDate?: string;
  gender?: string;
  notes?: string;
  tags?: string[];
};

type Props = {
  agentId: string;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
};

export default function CreateMagicTouchContactModal({
  agentId,
  onClose,
  onCreated,
}: Props) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState('');
  const [notes, setNotes] = useState('');
  const [tagsText, setTagsText] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (isSaving) {
      return;
    }

    if (!agentId) {
      setErrorMessage(
        'לא נמצא סוכן פעיל להוספת איש הקשר.'
      );
      return;
    }

    const normalizedFullName =
      fullName.trim();

    const normalizedPhone =
      phone.trim();

    const normalizedEmail =
      email.trim();

    if (!normalizedFullName) {
      setErrorMessage(
        'יש להזין שם איש קשר.'
      );
      return;
    }

    if (
      !normalizedPhone &&
      !normalizedEmail
    ) {
      setErrorMessage(
        'יש להזין לפחות מספר טלפון או כתובת אימייל.'
      );
      return;
    }

    const tags =
      tagsText
        .split(',')
        .map((tag) =>
          tag.trim()
        )
        .filter(Boolean);

    setIsSaving(true);
    setErrorMessage('');

    try {
      const fn = httpsCallable<
        CreateMagicTouchContactRequest,
        CreateMagicTouchContactResponse
      >(
        functions,
        'createMagicTouchContact'
      );

      await fn({
        agentId,
        fullName:
          normalizedFullName,

        phone:
          normalizedPhone ||
          undefined,

        email:
          normalizedEmail ||
          undefined,

        idNumber:
          idNumber.trim() ||
          undefined,

        birthDate:
          birthDate.trim() ||
          undefined,

        gender:
          gender.trim() ||
          undefined,

        notes:
          notes.trim() ||
          undefined,

        tags,
      });

      await onCreated();
      onClose();
    } catch (error: any) {
      console.error(
        '[CreateMagicTouchContactModal] Failed to create contact',
        error
      );

      setErrorMessage(
        error?.message ||
          'אירעה שגיאה ביצירת איש הקשר.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="
        fixed
        inset-0
        z-[100]
        flex
        items-center
        justify-center
        bg-black/50
        p-4
      "
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-contact-title"
      onMouseDown={(event) => {
        if (
          event.target ===
            event.currentTarget &&
          !isSaving
        ) {
          onClose();
        }
      }}
    >
      <div
        className="
          max-h-[90vh]
          w-full
          max-w-2xl
          overflow-y-auto
          rounded-2xl
          bg-white
          shadow-2xl
        "
      >
        <div className="flex items-start justify-between border-b px-6 py-5">
          <div>
            <h2
              id="create-contact-title"
              className="text-xl font-bold text-slate-900"
            >
              הוספת איש קשר
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              איש הקשר יתווסף למאגר Magic Touch כמקור ידני.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="
              rounded-lg
              px-3
              py-1
              text-xl
              text-slate-500
              hover:bg-slate-100
              disabled:opacity-50
            "
            aria-label="סגירת החלון"
          >
            ×
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-5 p-6"
        >
          {errorMessage ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          <div>
            <label
              htmlFor="magic-touch-full-name"
              className="mb-1 block text-sm font-semibold text-slate-700"
            >
              שם מלא *
            </label>

            <input
              id="magic-touch-full-name"
              type="text"
              value={fullName}
              onChange={(event) =>
                setFullName(
                  event.target.value
                )
              }
              disabled={isSaving}
              autoFocus
              className="w-full rounded-lg border px-3 py-2.5 outline-none focus:border-blue-500"
              placeholder="לדוגמה: ישראל ישראלי"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label
                htmlFor="magic-touch-phone"
                className="mb-1 block text-sm font-semibold text-slate-700"
              >
                טלפון
              </label>

              <input
                id="magic-touch-phone"
                type="tel"
                value={phone}
                onChange={(event) =>
                  setPhone(
                    event.target.value
                  )
                }
                disabled={isSaving}
                dir="ltr"
                className="w-full rounded-lg border px-3 py-2.5 text-right outline-none focus:border-blue-500"
                placeholder="050-1234567"
              />
            </div>

            <div>
              <label
                htmlFor="magic-touch-email"
                className="mb-1 block text-sm font-semibold text-slate-700"
              >
                אימייל
              </label>

              <input
                id="magic-touch-email"
                type="email"
                value={email}
                onChange={(event) =>
                  setEmail(
                    event.target.value
                  )
                }
                disabled={isSaving}
                dir="ltr"
                className="w-full rounded-lg border px-3 py-2.5 text-left outline-none focus:border-blue-500"
                placeholder="customer@example.com"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label
                htmlFor="magic-touch-id-number"
                className="mb-1 block text-sm font-semibold text-slate-700"
              >
                תעודת זהות
              </label>

              <input
                id="magic-touch-id-number"
                type="text"
                value={idNumber}
                onChange={(event) =>
                  setIdNumber(
                    event.target.value
                  )
                }
                disabled={isSaving}
                dir="ltr"
                className="w-full rounded-lg border px-3 py-2.5 text-right outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label
                htmlFor="magic-touch-birth-date"
                className="mb-1 block text-sm font-semibold text-slate-700"
              >
                תאריך לידה
              </label>

              <input
                id="magic-touch-birth-date"
                type="date"
                value={birthDate}
                onChange={(event) =>
                  setBirthDate(
                    event.target.value
                  )
                }
                disabled={isSaving}
                className="w-full rounded-lg border px-3 py-2.5 outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label
                htmlFor="magic-touch-gender"
                className="mb-1 block text-sm font-semibold text-slate-700"
              >
                מגדר
              </label>

              <select
                id="magic-touch-gender"
                value={gender}
                onChange={(event) =>
                  setGender(
                    event.target.value
                  )
                }
                disabled={isSaving}
                className="w-full rounded-lg border px-3 py-2.5 outline-none focus:border-blue-500"
              >
                <option value="">
                  לא הוגדר
                </option>

                <option value="זכר">
                  זכר
                </option>

                <option value="נקבה">
                  נקבה
                </option>

                <option value="אחר">
                  אחר
                </option>
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="magic-touch-tags"
              className="mb-1 block text-sm font-semibold text-slate-700"
            >
              תגיות
            </label>

            <input
              id="magic-touch-tags"
              type="text"
              value={tagsText}
              onChange={(event) =>
                setTagsText(
                  event.target.value
                )
              }
              disabled={isSaving}
              className="w-full rounded-lg border px-3 py-2.5 outline-none focus:border-blue-500"
              placeholder="לקוח קיים, ביטוח, מעקב"
            />

            <div className="mt-1 text-xs text-slate-500">
              יש להפריד בין תגיות באמצעות פסיק.
            </div>
          </div>

          <div>
            <label
              htmlFor="magic-touch-notes"
              className="mb-1 block text-sm font-semibold text-slate-700"
            >
              הערות
            </label>

            <textarea
              id="magic-touch-notes"
              value={notes}
              onChange={(event) =>
                setNotes(
                  event.target.value
                )
              }
              disabled={isSaving}
              rows={4}
              className="w-full resize-y rounded-lg border px-3 py-2.5 outline-none focus:border-blue-500"
              placeholder="מידע נוסף על איש הקשר..."
            />
          </div>

          <div className="flex items-center justify-end gap-3 border-t pt-5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="
                rounded-lg
                border
                px-5
                py-2.5
                font-medium
                text-slate-700
                hover:bg-slate-50
                disabled:opacity-50
              "
            >
              ביטול
            </button>

            <button
              type="submit"
              disabled={
                isSaving ||
                !agentId
              }
              className="
                rounded-lg
                bg-blue-600
                px-5
                py-2.5
                font-semibold
                text-white
                hover:bg-blue-700
                disabled:cursor-not-allowed
                disabled:opacity-50
              "
            >
              {isSaving
                ? 'שומר...'
                : 'הוסף איש קשר'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}