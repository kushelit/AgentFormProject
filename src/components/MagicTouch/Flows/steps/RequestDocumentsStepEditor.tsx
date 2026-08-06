"use client";

import React from "react";
import type {FlowStep} from "@/lib/MagicTouch/flows/types";

type Props = {
  step: FlowStep;
  onConfigChange: (patch: Record<string, unknown>) => void;
};

export default function RequestDocumentsStepEditor({step, onConfigChange}: Props) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
        בשלב זה הלקוח יקבל קישור מאובטח לצילום הצד הקדמי והצד האחורי של תעודת הזהות.
      </div>

      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">
          תוכן הודעת WhatsApp
        </span>
        <textarea
          className="min-h-40 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
          value={String(step.config?.message || "")}
          onChange={(event) => onConfigChange({message: event.target.value})}
          placeholder={"לצורך הכנת התהליך יש להעלות צילום ברור של שני צדי תעודת הזהות.\n\n{{uploadUrl}}"}
        />
        <span className="mt-2 block text-xs text-slate-500">
          ניתן לשלב את המשתנה <code dir="ltr">{"{{uploadUrl}}"}</code>. אם לא יופיע, הקישור יתווסף בסוף ההודעה.
        </span>
      </label>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="text-sm font-semibold text-emerald-900">
          התהליך ימתין להעלאת שני הצדדים
        </div>
        <div className="mt-1 text-xs leading-5 text-emerald-700">
          הקישור נשאר פעיל ללא הגבלת זמן. לאחר העלאת הצד הקדמי והצד האחורי, ה־Flow ימשיך אוטומטית לשלב הבא.
        </div>
      </div>
    </div>
  );
}
