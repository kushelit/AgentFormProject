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

type Props = {
  initialFlow:
    FlowDocument;

  agentId?:
    string;
};

export default function FlowEditor({
  initialFlow,
  agentId,
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

        const result =
          await saveFlow(
            nextFlow,
            {
              agentId,
            }
          );

        setValidation(
          result
            .validation
        );

        setFlow({
          ...nextFlow,

          flowId:
            result
              .flowId,

          version:
            result
              .version,
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
          "שמירת התהליך נכשלה"
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
      className="mx-auto max-w-6xl p-6"
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {
              flow.flowId
                ? "עריכת תהליך"
                : "תהליך חדש"
            }
          </h1>

          {
            flow.flowId &&
            (
              <p className="mt-1 text-sm text-gray-500">
                מזהה: {flow.flowId}
                {
                  flow.version
                    ? ` · גרסה ${flow.version}`
                    : ""
                }
              </p>
            )
          }
        </div>

        <button
          type="button"
          className="rounded-lg border px-4 py-2"
          onClick={() =>
            router.push(
              "/MagicTouch/Flows"
            )
          }
        >
          חזרה לרשימה
        </button>
      </div>

      {
        error &&
        (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
            {error}
          </div>
        )
      }

      {
        success &&
        (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-green-700">
            {success}
          </div>
        )
      }

      <div className="space-y-5">
        <section className="rounded-xl border bg-white p-5">
          <h2 className="mb-4 text-lg font-semibold">
            פרטי התהליך
          </h2>

          <div className="grid gap-4 md:grid-cols-2">
            <label>
              <span className="mb-1 block text-sm font-medium">
                שם
              </span>

              <input
                className="w-full rounded-lg border px-3 py-2"
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

            <label>
              <span className="mb-1 block text-sm font-medium">
                סטטוס נוכחי
              </span>

              <input
                className="w-full rounded-lg border bg-gray-50 px-3 py-2"
                value={
                  flow.status
                }
                readOnly
              />
            </label>

            <label className="md:col-span-2">
              <span className="mb-1 block text-sm font-medium">
                תיאור
              </span>

              <textarea
                className="min-h-20 w-full rounded-lg border px-3 py-2"
                value={
                  flow
                    .description
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

        <section className="sticky bottom-0 flex flex-wrap justify-end gap-3 rounded-xl border bg-white/95 p-4 shadow-lg backdrop-blur">
          <button
            type="button"
            className="rounded-lg border px-4 py-2"
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
            className="rounded-lg bg-gray-800 px-4 py-2 text-white disabled:opacity-50"
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
            className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
            disabled={
              saving
            }
            onClick={() =>
              save(
                "active"
              )
            }
          >
            שמירה והפעלה
          </button>
        </section>
      </div>
    </main>
  );
}
