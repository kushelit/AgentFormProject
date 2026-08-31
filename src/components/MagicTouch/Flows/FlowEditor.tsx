"use client";

import React, {
  useEffect,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import type {
  FlowDocument,
  ValidationResult,
} from "@/lib/MagicTouch/flows/types";

import {
  saveFlow,
  validateFlow,
} from "@/lib/MagicTouch/flows/api";

import FlowTriggerEditor from
  "@/components/MagicTouch/Flows/FlowTriggerEditor";

import FlowStepsEditor from
  "@/components/MagicTouch/Flows/FlowStepsEditor";

import FlowValidationPanel from
  "@/components/MagicTouch/Flows/FlowValidationPanel";

type EditorMode =
  | "flow"
  | "template";

type SaveResult = {
  version: number;

  validation?:
    ValidationResult |
    null;
};

type Props = {
  initialFlow:
    FlowDocument;

  agentId?:
    string;

  mode?:
    EditorMode;

  backHref?:
    string;

  onSaveOverride?: (
    flow:
      FlowDocument,

    status:
      "draft" |
      "active"
  ) =>
    Promise<SaveResult>;
};

const fieldClass =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50";

function statusLabel(
  status:
    string,
  mode:
    EditorMode
): string {
  if (
    mode ===
    "template"
  ) {
    switch (
      status
    ) {
      case "active":
        return "פורסם";

      case "draft":
        return "טיוטה";

      default:
        return (
          status ||
          "לא ידוע"
        );
    }
  }

  switch (
    status
  ) {
    case "active":
      return "פעיל";

    case "draft":
      return "טיוטה";

    case "inactive":
      return "לא פעיל";

    default:
      return (
        status ||
        "לא ידוע"
      );
  }
}

export default function FlowEditor({
  initialFlow,
  agentId,
  mode = "flow",
  backHref,
  onSaveOverride,
}: Props) {
  const router =
    useRouter();

  const [
    flow,
    setFlow,
  ] =
    useState<FlowDocument>(
      initialFlow
    );

  const [
    validation,
    setValidation,
  ] =
    useState<
      ValidationResult |
      null
    >(
      null
    );

  const [
    saving,
    setSaving,
  ] =
    useState(
      false
    );

  const [
    error,
    setError,
  ] =
    useState(
      ""
    );

  const [
    success,
    setSuccess,
  ] =
    useState(
      ""
    );

  useEffect(
    () => {
      setFlow(
        initialFlow
      );
    },
    [
      initialFlow,
    ]
  );

  const resolvedBackHref =
    backHref ||
    (
      mode ===
      "template"
        ? "/MagicTouch/Flows/Templates"
        : "/MagicTouch/Flows"
    );

  const runValidation =
    async () => {
      setError(
        ""
      );

      try {
        const result =
          await validateFlow(
            flow,
            {
              agentId,
            }
          );

        setValidation(
          result
        );

        return result;
      } catch (
        validationError:
          any
      ) {
        setError(
          validationError
            ?.message ||
          "בדיקת התקינות נכשלה"
        );

        return null;
      }
    };

  const save =
    async (
      status:
        "draft" |
        "active"
    ) => {
      setSaving(
        true
      );

      setError(
        ""
      );

      setSuccess(
        ""
      );

      try {
        const nextFlow:
          FlowDocument = {
            ...flow,
            status,
          };

        /*
         * מצב Template:
         * ה-page שמארח את ה-Editor
         * מחליט איך לשמור.
         */
        if (
          onSaveOverride
        ) {
          const result =
            await onSaveOverride(
              nextFlow,
              status
            );

          if (
            result.validation
          ) {
            setValidation(
              result.validation
            );
          }

          setFlow({
            ...nextFlow,

            version:
              result.version,
          });

          setSuccess(
            mode ===
            "template"
              ? (
                  status ===
                  "active"
                    ? "התבנית נשמרה ופורסמה בספרייה."
                    : "התבנית נשמרה כטיוטה."
                )
              : (
                  status ===
                  "active"
                    ? "התהליך נשמר והופעל."
                    : "הטיוטה נשמרה."
                )
          );

          router.refresh();

          return;
        }

        /*
         * התנהגות Flow הרגילה נשארת
         * בדיוק כפי שהייתה.
         */
        const result =
          await saveFlow(
            nextFlow,
            {
              agentId,
            }
          );

        setValidation(
          result.validation
        );

        setFlow({
          ...nextFlow,

          flowId:
            result.flowId,

          version:
            result.version,
        });

        setSuccess(
          status ===
          "active"
            ? "התהליך נשמר והופעל."
            : "הטיוטה נשמרה."
        );

        if (
          !flow.flowId
        ) {
          router.replace(
            `/MagicTouch/Flows/${result.flowId}`
          );
        }

        router.refresh();
      } catch (
        saveError:
          any
      ) {
        const serverValidation =
          saveError
            ?.details
            ?.validation as
            ValidationResult |
            undefined;

        if (
          serverValidation
        ) {
          setValidation(
            serverValidation
          );
        }

        setError(
          saveError
            ?.message ||
          (
            mode ===
            "template"
              ? "שמירת התבנית נכשלה"
              : "שמירת התהליך נכשלה"
          )
        );
      } finally {
        setSaving(
          false
        );
      }
    };

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6"
    >
      <div className="mx-auto max-w-7xl">

        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>

            <div className="text-sm font-semibold text-blue-600">
              {mode ===
              "template"
                ? "MagicTouch · ספריית תהליכים"
                : "MagicTouch · אוטומציות"}
            </div>

            <h1 className="mt-1 text-3xl font-bold text-slate-900">
              {mode ===
              "template"
                ? "עריכת תבנית תהליך"
                : (
                    flow.flowId
                      ? "עריכת תהליך"
                      : "תהליך חדש"
                  )}
            </h1>

            {flow.version ? (
              <p className="mt-2 text-sm text-slate-500">
                גרסה{" "}
                {flow.version}
              </p>
            ) : null}

          </div>

          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            onClick={() =>
              router.push(
                resolvedBackHref
              )
            }
          >
            {mode ===
            "template"
              ? "חזרה לספרייה"
              : "חזרה לרשימה"}
          </button>
        </header>

        {error ? (
          <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700">
            {success}
          </div>
        ) : null}

        <div className="space-y-6">

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">

            <div className="mb-3 flex items-center justify-between gap-3">

              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {mode ===
                  "template"
                    ? "פרטי התבנית"
                    : "פרטי התהליך"}
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  {mode ===
                  "template"
                    ? "שם ותיאור שיוצגו בספריית התהליכים."
                    : "שם ותיאור שיעזרו לזהות את האוטומציה."}
                </p>
              </div>

              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                {statusLabel(
                  flow.status,
                  mode
                )}
              </span>

            </div>

            <div className="grid gap-3 md:grid-cols-2">

              <label>
                <span className="mb-2 block text-sm font-semibold text-slate-700">
                  {mode ===
                  "template"
                    ? "שם התבנית"
                    : "שם התהליך"}
                </span>

                <input
                  className={
                    fieldClass
                  }
                  value={
                    flow.name
                  }
                  onChange={(
                    event
                  ) =>
                    setFlow({
                      ...flow,

                      name:
                        event
                          .target
                          .value,
                    })
                  }
                />
              </label>

              <div>
                <span className="mb-2 block text-sm font-semibold text-slate-700">
                  סטטוס נוכחי
                </span>

                <div className="flex h-10 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-600">
                  {statusLabel(
                    flow.status,
                    mode
                  )}
                </div>
              </div>

              <label className="md:col-span-2">

                <span className="mb-2 block text-sm font-semibold text-slate-700">
                  תיאור
                </span>

                <textarea
                  className="min-h-16 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                  value={
                    flow.description
                  }
                  onChange={(
                    event
                  ) =>
                    setFlow({
                      ...flow,

                      description:
                        event
                          .target
                          .value,
                    })
                  }
                />

              </label>

            </div>

          </section>

          <FlowTriggerEditor
            value={
              flow.trigger
            }
            onChange={(
              trigger
            ) =>
              setFlow({
                ...flow,
                trigger,
              })
            }
          />

          <FlowStepsEditor
            value={
              flow
            }
            onChange={
              setFlow
            }
          />

          <FlowValidationPanel
            validation={
              validation
            }
          />

          <section className="sticky bottom-3 z-40 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur">

            <div className="text-sm text-slate-500">
              {mode ===
              "template"
                ? "השינויים יישמרו בתבנית שבספרייה בלבד."
                : "השינויים נשמרים רק בלחיצה על אחד מכפתורי השמירה."}
            </div>

            <div className="flex flex-wrap justify-end gap-3">

              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                disabled={
                  saving
                }
                onClick={
                  runValidation
                }
              >
                בדיקת תקינות
              </button>

              <button
                type="button"
                className="rounded-xl bg-slate-800 px-5 py-2.5 font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
                disabled={
                  saving
                }
                onClick={() =>
                  save(
                    "draft"
                  )
                }
              >
                שמירה כטיוטה
              </button>

              <button
                type="button"
                className="rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                disabled={
                  saving
                }
                onClick={() =>
                  save(
                    "active"
                  )
                }
              >
                {saving
                  ? "שומר..."
                  : (
                      mode ===
                      "template"
                        ? "שמירה ופרסום"
                        : "שמירה והפעלה"
                    )}
              </button>

            </div>

          </section>

        </div>
      </div>
    </main>
  );
}