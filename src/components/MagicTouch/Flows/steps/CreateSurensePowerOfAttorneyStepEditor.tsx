"use client";

import React from "react";
import type { FlowStep } from "@/lib/MagicTouch/flows/types";

type Props = {
  step: FlowStep;
  onConfigChange: (patch: Record<string, unknown>) => void;
};

type OptionProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export default function CreateSurensePowerOfAttorneyStepEditor({
  step,
  onConfigChange,
}: Props) {
  const includeHb = step.config?.includeHb !== false;
  const includePolicies = step.config?.includePolicies !== false;
  const includeSwiftness = step.config?.includeSwiftness !== false;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
        המערכת תיקח אוטומטית את מזהה הלקוח בשורנס, תפנה ל־Make,
        תקבל קישור חתימה ותשמור אותו באיש הקשר.
      </div>

      <fieldset className="rounded-xl border border-slate-200 bg-white p-4">
        <legend className="px-2 text-sm font-bold text-slate-800">
          אילו ייפויי כוח ליצור?
        </legend>

        <div className="mt-2 grid gap-3 md:grid-cols-3">
          <Option
            label="הר הביטוח — נספח ה׳"
            checked={includeHb}
            onChange={(checked) =>
              onConfigChange({ includeHb: checked })
            }
          />

          <Option
            label="פוליסות — נספח ב׳"
            checked={includePolicies}
            onChange={(checked) =>
              onConfigChange({ includePolicies: checked })
            }
          />

          <Option
            label="מסלקה — נספח א׳"
            checked={includeSwiftness}
            onChange={(checked) =>
              onConfigChange({ includeSwiftness: checked })
            }
          />
        </div>
      </fieldset>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-bold text-slate-800">
          נתיב שמירה באיש הקשר
        </div>

        <div
          className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700"
          dir="ltr"
        >
          engagement.reengagement.powerOfAttorney
        </div>
      </div>

      <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm leading-6 text-emerald-800">
        בשלב WhatsApp הבא השתמשי במשתנה:
        <div
          className="mt-2 overflow-x-auto rounded-lg border border-emerald-200 bg-white px-3 py-2 font-mono text-xs"
          dir="ltr"
        >
          {"{{contact.engagement.reengagement.powerOfAttorney.signingUrl}}"}
        </div>
      </div>
    </div>
  );
}

function Option({
  label,
  checked,
  onChange,
}: OptionProps) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="text-sm font-semibold text-slate-700">
        {label}
      </span>
    </label>
  );
}
