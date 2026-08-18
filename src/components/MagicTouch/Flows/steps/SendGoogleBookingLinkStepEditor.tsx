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
        Record<string, unknown>
    ) => void;
};

const fieldClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50";

export default function SendGoogleBookingLinkStepEditor({
  step,
  onConfigChange,
}: Props) {
  const messageBefore =
    String(
      step.config
        ?.messageBefore ||
      ""
    );

  const messageAfter =
    String(
      step.config
        ?.messageAfter ||
      ""
    );

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-blue-100 bg-blue-50 p-4">
        <div className="text-sm font-bold text-blue-900">
          Google Calendar
        </div>

        <p className="mt-1 text-sm leading-6 text-blue-800">
          הקישור יילקח אוטומטית מקישור
          ברירת המחדל שהוגדר בחיבור
          Google Calendar של הסוכן.
        </p>

        <p className="mt-2 text-xs leading-5 text-blue-700">
          לאחר שליחה מוצלחת MagicTouch
          תעדכן אוטומטית שהלקוח ממתין
          לקביעת פגישה דרך Google.
        </p>
      </section>

      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">
          מלל לפני הקישור
        </span>

        <textarea
          rows={4}
          className={fieldClass}
          value={
            messageBefore
          }
          onChange={(
            event
          ) =>
            onConfigChange({
              messageBefore:
                event.target
                  .value,
            })
          }
          placeholder="לדוגמה: מעולה, נשמח לתאם פגישה. ניתן לבחור מועד שנוח לך בקישור הבא:"
        />

        <span className="mt-2 block text-xs text-slate-400">
          הקישור עצמו יתווסף אוטומטית
          אחרי הטקסט הזה.
        </span>
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">
          מלל אחרי הקישור
        </span>

        <textarea
          rows={3}
          className={fieldClass}
          value={
            messageAfter
          }
          onChange={(
            event
          ) =>
            onConfigChange({
              messageAfter:
                event.target
                  .value,
            })
          }
          placeholder="אופציונלי"
        />

        <span className="mt-2 block text-xs text-slate-400">
          אפשר להשאיר ריק.
        </span>
      </label>

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="text-xs font-bold text-slate-500">
          מבנה ההודעה
        </div>

        <div className="mt-3 whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700">
          {messageBefore ||
            "מלל לפני הקישור"}

          {"\n\n"}

          <span className="font-semibold text-blue-700">
            [קישור Google Calendar של הסוכן]
          </span>

          {messageAfter ? (
            <>
              {"\n\n"}
              {messageAfter}
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}