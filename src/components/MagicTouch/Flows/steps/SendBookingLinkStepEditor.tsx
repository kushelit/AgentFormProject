"use client";

import React from "react";

import type {
  FlowStep,
} from "@/lib/MagicTouch/flows/types";

type Props = {
  step:
    FlowStep;

  onConfigChange:
    (
      patch:
        Record<
          string,
          unknown
        >
    ) => void;
};

export default function SendBookingLinkStepEditor({
  step,
  onConfigChange,
}: Props) {
  const messageBefore =
    String(
      step.config?.messageBefore ||
      ""
    );

  const messageAfter =
    String(
      step.config?.messageAfter ||
      ""
    );

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-xl">
            📅
          </div>

          <div>
            <div className="font-bold text-slate-900">
              פגישת ברירת המחדל
            </div>

            <p className="mt-1 text-sm leading-6 text-slate-600">
              בזמן הריצה MagicTouch ישתמש אוטומטית
              בקישור של פגישת ברירת המחדל שהוגדרה
              לסוכן ב־Microsoft Bookings.
            </p>
          </div>
        </div>
      </div>

      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">
          מלל לפני הקישור
        </span>

        <textarea
          className="min-h-32 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
          value={
            messageBefore
          }
          onChange={(event) =>
            onConfigChange({
              messageBefore:
                event.target.value,
            })
          }
          placeholder="לדוגמה: מעולה, נשמח לתאם פגישה. ניתן לבחור מועד בקישור הבא:"
        />
      </label>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="text-xs font-semibold text-slate-500">
          הקישור שישולב אוטומטית
        </div>

        <div className="mt-2 flex items-center gap-2">
          <span className="text-lg">
            🔗
          </span>

          <span className="text-sm font-bold text-slate-800">
            קישור פגישת ברירת המחדל של הסוכן
          </span>
        </div>

        <p className="mt-2 text-xs leading-5 text-slate-500">
          אין צורך להדביק URL בתוך ה־Flow.
        </p>
      </div>

      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">
          מלל אחרי הקישור
        </span>

        <textarea
          className="min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
          value={
            messageAfter
          }
          onChange={(event) =>
            onConfigChange({
              messageAfter:
                event.target.value,
            })
          }
          placeholder="אופציונלי, לדוגמה: מחכים לראותך 🙂"
        />
      </label>

      <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm leading-6 text-emerald-800">
        ההודעה תישלח ב־WhatsApp ותכלול אוטומטית את
        קישור ה־Bookings של הסוכן בזמן הריצה.
      </div>
    </div>
  );
}