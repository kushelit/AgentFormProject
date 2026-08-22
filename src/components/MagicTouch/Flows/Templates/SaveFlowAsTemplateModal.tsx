"use client";

import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  listFlowTemplates,
  saveFlowAsTemplate,
} from "@/lib/MagicTouch/flowTemplates/api";

import type {
  FlowTemplateSummary,
} from "@/lib/MagicTouch/flowTemplates/types";

import type {
  FlowStep,
  FlowTrigger,
} from "@/lib/MagicTouch/flows/types";

interface Props {
  open: boolean;
  agentId: string;
  flowId: string;
  flowName: string;
  flowDescription?: string;
  flowTrigger: FlowTrigger;
  flowSteps: Record<string, FlowStep>;
  onClose: () => void;
  onSaved: () => void;
}

const CATEGORY_OPTIONS = [
  { value: "appointments", label: "פגישות" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "surense", label: "Surense" },
  { value: "service", label: "שירות" },
  { value: "sales", label: "מכירה" },
  { value: "operations", label: "תפעול" },
  { value: "reengagement", label: "חידוש קשר" },
  { value: "general", label: "כללי" },
] as const;

const INTEGRATION_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  surense: "Surense",
  microsoftBookings: "Microsoft Bookings",
};

function normalizeTechnicalPart(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function makeTechnicalKey(
  trigger: FlowTrigger,
  flowId: string
): string {
  const triggerPart =
    normalizeTechnicalPart(
      trigger?.type
    ) ||
    "flow";

  const flowPart =
    normalizeTechnicalPart(
      flowId
    ).slice(
      0,
      16
    );

  return `${triggerPart}_${flowPart}`.slice(
    0,
    100
  );
}

function detectRequiredIntegrations(
  trigger: FlowTrigger,
  steps: Record<string, FlowStep>
): string[] {
  const result = new Set<string>();
  const triggerType = String(trigger?.type || "");

  if (triggerType.startsWith("microsoft_booking_")) {
    result.add("microsoftBookings");
  }

  if (triggerType.startsWith("whatsapp_")) {
    result.add("whatsapp");
  }

  Object.values(steps || {}).forEach((step) => {
    const type = String(step?.type || "");

    if (type === "send_whatsapp") {
      result.add("whatsapp");
    }

    if (
      type === "sync_surense_activity" ||
      type === "create_surense_power_of_attorney"
    ) {
      result.add("surense");
    }
  });

  return Array.from(result);
}

export default function SaveFlowAsTemplateModal({
  open,
  agentId,
  flowId,
  flowName,
  flowDescription,
  flowTrigger,
  flowSteps,
  onClose,
  onSaved,
}: Props) {
  const [templates, setTemplates] =
    useState<FlowTemplateSummary[]>([]);

  const [templateId, setTemplateId] =
    useState("");

  const [name, setName] =
    useState(flowName);

  const [description, setDescription] =
    useState(flowDescription || "");

  const [templateKey, setTemplateKey] =
    useState(
      makeTechnicalKey(
        flowTrigger,
        flowId
      )
    );

  const [category, setCategory] =
    useState("general");

  const [status, setStatus] =
    useState<"draft" | "published">(
      "draft"
    );

  const [showAdvanced, setShowAdvanced] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  const selected = useMemo(
    () =>
      templates.find(
        (item) =>
          item.templateId === templateId
      ),
    [templates, templateId]
  );

  const stepCount =
    Object.keys(flowSteps || {}).length;

  const requiredIntegrations =
    useMemo(
      () =>
        detectRequiredIntegrations(
          flowTrigger,
          flowSteps
        ),
      [flowTrigger, flowSteps]
    );

  useEffect(() => {
    if (!open) {
      return;
    }

    setName(flowName);
    setDescription(
      flowDescription || ""
    );
    setTemplateKey(
      makeTechnicalKey(
        flowTrigger,
        flowId
      )
    );
    setTemplateId("");
    setCategory("general");
    setStatus("draft");
    setShowAdvanced(false);
    setError("");

    void listFlowTemplates()
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }, [
    open,
    flowName,
    flowDescription,
    flowTrigger,
    flowId,
  ]);

  useEffect(() => {
    if (!selected) {
      return;
    }

    setName(selected.name);
    setDescription(
      selected.description || ""
    );
    setTemplateKey(
      selected.templateKey
    );
    setCategory(
      selected.category || "general"
    );
    setStatus(
      selected.status === "published"
        ? "published"
        : "draft"
    );
  }, [selected]);

  if (!open) {
    return null;
  }

  const submit = async () => {
    setError("");

    if (
      !agentId ||
      !flowId ||
      !name.trim() ||
      !templateKey.trim()
    ) {
      setError(
        "יש למלא שם תהליך. לא ניתן ליצור מזהה טכני תקין לתבנית."
      );
      return;
    }

    try {
      setSaving(true);

      await saveFlowAsTemplate({
        agentId,
        flowId,
        templateId:
          templateId || undefined,
        name: name.trim(),
        description:
          description.trim(),
        templateKey:
          templateKey.trim(),
        category,
        status,
      });

      onSaved();
      onClose();
    } catch (saveError: any) {
      setError(
        saveError?.message ||
        "פרסום התהליך בספרייה נכשל"
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
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">
              פרסום Flow כתבנית מערכת
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              התהליך המלא יישמר בספריית התהליכים ויהיה ניתן להתקנה אצל כל סוכן. ה־Flow המקורי אינו משתנה.
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

        <div className="grid gap-4">
          <label className="grid gap-1 text-sm font-medium">
            פעולה
            <select
              value={templateId}
              onChange={(event) =>
                setTemplateId(
                  event.target.value
                )
              }
              className="rounded-lg border px-3 py-2"
            >
              <option value="">
                יצירת תבנית מערכת חדשה
              </option>

              {templates.map((item) => (
                <option
                  key={item.templateId}
                  value={item.templateId}
                >
                  עדכון “{item.name}” לגרסה {item.version + 1}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-sm font-medium">
            שם התהליך
            <input
              value={name}
              onChange={(event) =>
                setName(
                  event.target.value
                )
              }
              placeholder="לדוגמה: ביטול פגישה בבוקינג"
              className="rounded-lg border px-3 py-2"
            />
          </label>

          <label className="grid gap-1 text-sm font-medium">
            תיאור
            <textarea
              value={description}
              onChange={(event) =>
                setDescription(
                  event.target.value
                )
              }
              placeholder="מה התהליך עושה ומתי כדאי להתקין אותו"
              className="min-h-24 rounded-lg border px-3 py-2"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium">
              קטגוריה
              <select
                value={category}
                onChange={(event) =>
                  setCategory(
                    event.target.value
                  )
                }
                className="rounded-lg border px-3 py-2"
              >
                {CATEGORY_OPTIONS.map(
                  (option) => (
                    <option
                      key={option.value}
                      value={option.value}
                    >
                      {option.label}
                    </option>
                  )
                )}
              </select>
            </label>

            <label className="grid gap-1 text-sm font-medium">
              סטטוס בספרייה
              <select
                value={status}
                onChange={(event) =>
                  setStatus(
                    event.target.value as
                      | "draft"
                      | "published"
                  )
                }
                className="rounded-lg border px-3 py-2"
              >
                <option value="draft">
                  טיוטה
                </option>
                <option value="published">
                  מפורסמת בספרייה
                </option>
              </select>
            </label>
          </div>

          <section className="rounded-xl border bg-slate-50 p-4">
            <h3 className="font-semibold">
              מה יישמר בתבנית
            </h3>

            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">
                  Trigger
                </dt>
                <dd className="font-medium" dir="ltr">
                  {flowTrigger?.type || "-"}
                </dd>
              </div>

              <div>
                <dt className="text-slate-500">
                  מספר שלבים
                </dt>
                <dd className="font-medium">
                  {stepCount}
                </dd>
              </div>
            </dl>

            <div className="mt-3">
              <div className="text-sm text-slate-500">
                אינטגרציות נדרשות
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                {requiredIntegrations.length > 0 ? (
                  requiredIntegrations.map(
                    (integration) => (
                      <span
                        key={integration}
                        className="rounded-full bg-white px-2 py-1 text-xs text-slate-700 ring-1 ring-slate-200"
                      >
                        {INTEGRATION_LABELS[
                          integration
                        ] || integration}
                      </span>
                    )
                  )
                ) : (
                  <span className="text-sm text-slate-500">
                    לא זוהתה אינטגרציה חיצונית
                  </span>
                )}
              </div>
            </div>
          </section>

          <button
            type="button"
            onClick={() =>
              setShowAdvanced(
                (current) => !current
              )
            }
            className="w-fit text-sm font-medium text-blue-700"
          >
            {showAdvanced
              ? "הסתר אפשרויות מתקדמות"
              : "אפשרויות מתקדמות"}
          </button>

          {showAdvanced && (
            <label className="grid gap-1 text-sm font-medium">
              מזהה טכני של התבנית
              <input
                value={templateKey}
                onChange={(event) =>
                  setTemplateKey(
                    normalizeTechnicalPart(
                      event.target.value
                    )
                  )
                }
                className="rounded-lg border px-3 py-2"
                dir="ltr"
              />
              <span className="text-xs font-normal text-slate-500">
                משמש לייבוא, ייצוא וגרסאות. בדרך כלל אין צורך לשנות אותו.
              </span>
            </label>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 border-t pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border px-4 py-2"
            >
              ביטול
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={() =>
                void submit()
              }
              className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
            >
              {saving
                ? "שומר..."
                : templateId
                  ? "שמירת גרסה חדשה"
                  : "פרסום כתבנית מערכת"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
