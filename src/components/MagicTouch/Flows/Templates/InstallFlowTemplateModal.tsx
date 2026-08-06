"use client";

import React, {
  useEffect,
  useState,
} from "react";

import type {
  FlowTemplateSummary,
} from "@/lib/MagicTouch/flowTemplates/types";

import {
  installFlowTemplateForAgent,
} from "@/lib/MagicTouch/flowTemplates/api";

type Props = {
  template:
    FlowTemplateSummary;
  agentId:
    string;
  agentName?:
    string;
  onClose:
    () => void;
  onInstalled:
    (result: {
      flowId: string;
      flowName: string;
      stepCount: number;
    }) => void;
};

export default function InstallFlowTemplateModal({
  template,
  agentId,
  agentName,
  onClose,
  onInstalled,
}: Props) {
  const [name, setName] =
    useState(template.name);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  useEffect(() => {
    setName(template.name);
    setError("");
  }, [template]);

  const submit = async () => {
    if (!agentId) {
      setError(
        "לא נבחר סוכן במערכת"
      );
      return;
    }

    if (!name.trim()) {
      setError(
        "יש להזין שם לתהליך שייווצר"
      );
      return;
    }

    try {
      setSaving(true);
      setError("");

      const result =
        await installFlowTemplateForAgent({
          templateId:
            template.templateId,
          agentId,
          name:
            name.trim(),
        });

      onInstalled(result);
    } catch (installError: any) {
      setError(
        installError?.message ||
        "התקנת התבנית נכשלה"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      dir="rtl"
    >
      <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">
              התקנת תבנית Flow אצל הסוכן
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              ייווצר עותק מלא ונפרד של התהליך, כולל כל השלבים והחיבורים.
              העותק יישמר כטיוטה ויהיה ניתן לעריכה עבור הסוכן.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-xl text-slate-500"
            aria-label="סגירה"
          >
            ×
          </button>
        </div>

        <div className="mt-5 rounded-lg bg-slate-50 p-3 text-sm">
          <div>
            <span className="text-slate-500">תבנית: </span>
            <strong>{template.name}</strong>
          </div>
          <div className="mt-1">
            <span className="text-slate-500">מספר שלבים: </span>
            <strong>
              {Object.keys(template.steps || {}).length}
            </strong>
          </div>
          <div className="mt-1 break-all" dir="ltr">
            <span className="text-slate-500">סוכן יעד: </span>
            <strong>{agentName || agentId || "לא נבחר"}</strong>
          </div>
        </div>

        <label className="mt-5 block text-sm font-medium">
          שם התהליך אצל הסוכן
        </label>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="mt-2 w-full rounded-lg border px-3 py-2"
        />

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving || !agentId}
            className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {saving ? "מתקין..." : "יצירת Flow אצל הסוכן"}
          </button>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border px-4 py-2"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
