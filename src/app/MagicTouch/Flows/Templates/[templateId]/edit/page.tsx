"use client";

import React, {
  useEffect,
  useState,
} from "react";

import {
  useParams,
} from "next/navigation";

import FlowEditor from
  "@/components/MagicTouch/Flows/FlowEditor";

import {
  listFlowTemplates,
  updateFlowTemplate,
} from "@/lib/MagicTouch/flowTemplates/api";

import type {
  FlowTemplateSummary,
} from "@/lib/MagicTouch/flowTemplates/types";

import type {
  FlowDocument,
} from "@/lib/MagicTouch/flows/types";

export default function EditMagicTouchFlowTemplatePage() {
  const params =
    useParams<{
      templateId:
        string;
    }>();

  const [
    template,
    setTemplate,
  ] =
    useState<
      FlowTemplateSummary |
      null
    >(
      null
    );

  const [
    error,
    setError,
  ] =
    useState(
      ""
    );

  useEffect(
    () => {
      const load =
        async () => {
          try {
            setError(
              ""
            );

            const templates =
              await listFlowTemplates();

            const found =
              templates.find(
                (
                  item
                ) =>
                  item.templateId ===
                  params.templateId
              );

            if (
              !found
            ) {
              throw new Error(
                "התבנית לא נמצאה בספרייה"
              );
            }

            setTemplate(
              found
            );
          } catch (
            loadError:
              any
          ) {
            setError(
              loadError
                ?.message ||
              "טעינת התבנית נכשלה"
            );
          }
        };

      void load();
    },
    [
      params.templateId,
    ]
  );

  if (
    error
  ) {
    return (
      <main
        dir="rtl"
        className="mx-auto max-w-4xl p-6"
      >
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      </main>
    );
  }

  if (
    !template
  ) {
    return (
      <main
        dir="rtl"
        className="mx-auto max-w-4xl p-6"
      >
        טוען תבנית...
      </main>
    );
  }

  /*
   * אנחנו רק מתאימים את Template
   * למבנה שה-FlowEditor כבר מכיר.
   *
   * published ב-Template מיוצג בתוך
   * ה-Editor כ-active.
   */
  const initialFlow =
    {
      flowId:
        template.templateId,

      agentId:
        template.sourceAgentId,

      name:
        template.name,

      description:
        template.description ||
        "",

      status:
        template.status ===
        "published"
          ? "active"
          : "draft",

      version:
        template.version ||
        1,

      trigger:
        template.trigger,

      firstStepId:
        template.firstStepId,

      steps:
        template.steps,

    } as unknown as FlowDocument;

  return (
    <FlowEditor
      initialFlow={
        initialFlow
      }

      agentId={
        template.sourceAgentId
      }

      mode="template"

      backHref="/MagicTouch/Flows/Templates"

      onSaveOverride={async (
        editedFlow,
        status
      ) => {
        const result =
          await updateFlowTemplate({
            templateId:
              template.templateId,

            name:
              editedFlow.name,

            description:
              editedFlow.description ||
              "",

            status:
              status ===
              "active"
                ? "published"
                : "draft",

            trigger:
              editedFlow.trigger as unknown as Record<
                string,
                unknown
              >,

            firstStepId:
              editedFlow.firstStepId,

            steps:
              editedFlow.steps as unknown as Record<
                string,
                unknown
              >,
variables:
  template.variables || [],
          });

        setTemplate(
          (
            current
          ) =>
            current
              ? {
                  ...current,

                  name:
                    editedFlow.name,

                  description:
                    editedFlow.description ||
                    "",

                  trigger:
                    editedFlow.trigger as unknown as Record<
                      string,
                      unknown
                    >,

                  firstStepId:
                    editedFlow.firstStepId,

                  steps:
                    editedFlow.steps as unknown as Record<
                      string,
                      unknown
                    >,

               variables:
  current.variables,

                  status:
                    result.status,

                  version:
                    result.version,
                }
              : current
        );

        return {
          version:
            result.version,
        };
      }}
    />
  );
}