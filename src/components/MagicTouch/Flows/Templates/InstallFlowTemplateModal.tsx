"use client";

import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  collection,
  getDocs,
} from "firebase/firestore";

import {
  db,
} from "@/lib/firebase/firebase";

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

type WhatsAppTemplateOption = {
  name: string;
  label: string;
};

export default function InstallFlowTemplateModal({
  template,
  agentId,
  agentName,
  onClose,
  onInstalled,
}: Props) {
  const [
    name,
    setName,
  ] =
    useState(
      template.name
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
    whatsappTemplates,
    setWhatsAppTemplates,
  ] =
    useState<
      WhatsAppTemplateOption[]
    >([]);

  const [
    selectedWhatsAppTemplate,
    setSelectedWhatsAppTemplate,
  ] =
    useState(
      ""
    );

  const [
    loadingWhatsAppTemplates,
    setLoadingWhatsAppTemplates,
  ] =
    useState(
      false
    );

  const trigger =
    template.trigger as {
      type?: string;
      templateName?: string;
    };

  /*
   * צריך בחירת תבנית רק כאשר:
   *
   * 1. הטריגר הוא Quick Reply של WhatsApp
   * 2. התבנית שבספרייה לא מקושרת כבר
   *    ל-templateName ספציפי.
   */
  const requiresWhatsAppTemplate =
    useMemo(
      () =>
        trigger?.type ===
          "whatsapp_quick_reply_received" &&
        !String(
          trigger?.templateName ||
          ""
        ).trim(),
      [
        trigger?.type,
        trigger?.templateName,
      ]
    );

  useEffect(() => {
    setName(
      template.name
    );

    setError(
      ""
    );

    setSelectedWhatsAppTemplate(
      ""
    );
  }, [
    template,
  ]);

  /*
   * אם התהליך הגנרי דורש תבנית WhatsApp,
   * טוענים את התבניות המאושרות
   * של הסוכן שאליו מתקינים.
   */
  useEffect(() => {
    if (
      !agentId ||
      !requiresWhatsAppTemplate
    ) {
      setWhatsAppTemplates(
        []
      );

      return;
    }

    let cancelled =
      false;

    const loadWhatsAppTemplates =
      async () => {
        try {
          setLoadingWhatsAppTemplates(
            true
          );

          const snapshot =
            await getDocs(
              collection(
                db,
                "agents",
                agentId,
                "whatsapp_templates"
              )
            );

          if (
            cancelled
          ) {
            return;
          }

          const options =
            snapshot.docs
              .map(
                (
                  templateDoc
                ) => {
                  const data =
                    templateDoc.data() as Record<
                      string,
                      any
                    >;

                  const status =
                    String(
                      data.status ||
                      ""
                    )
                      .trim()
                      .toUpperCase();

                  const templateName =
                    String(
                      data.name ||
                      data.templateName ||
                      templateDoc.id
                    ).trim();

                  const displayName =
                    String(
                      data.displayName ||
                      data.label ||
                      ""
                    ).trim();

                  return {
                    status,

                    name:
                      templateName ||
                      templateDoc.id,

                    label:
                      displayName ||
                      templateName ||
                      templateDoc.id,
                  };
                }
              )
              .filter(
                (
                  item
                ) =>
                  item.status ===
                  "APPROVED"
              )
              .map(
                (
                  item
                ) => ({
                  name:
                    item.name,

                  label:
                    item.label,
                })
              )
              .sort(
                (
                  a,
                  b
                ) =>
                  a.label.localeCompare(
                    b.label,
                    "he"
                  )
              );

          setWhatsAppTemplates(
            options
          );
        } catch (
          loadError
        ) {
          console.error(
            "[InstallFlowTemplateModal] Failed loading WhatsApp templates",
            loadError
          );

          if (
            !cancelled
          ) {
            setWhatsappTemplatesSafe();
            setError(
              "לא ניתן היה לטעון את תבניות ה-WhatsApp של הסוכן."
            );
          }
        } finally {
          if (
            !cancelled
          ) {
            setLoadingWhatsAppTemplates(
              false
            );
          }
        }
      };

    const setWhatsappTemplatesSafe =
      () => {
        setWhatsAppTemplates(
          []
        );
      };

    void loadWhatsAppTemplates();

    return () => {
      cancelled =
        true;
    };
  }, [
    agentId,
    requiresWhatsAppTemplate,
  ]);

  const submit =
    async () => {
      if (
        !agentId
      ) {
        setError(
          "לא נבחר סוכן במערכת"
        );

        return;
      }

      if (
        !name.trim()
      ) {
        setError(
          "יש להזין שם לתהליך שייווצר"
        );

        return;
      }

      if (
        requiresWhatsAppTemplate &&
        !selectedWhatsAppTemplate
      ) {
        setError(
          "יש לבחור תבנית WhatsApp עבור התהליך."
        );

        return;
      }

      try {
        setSaving(
          true
        );

        setError(
          ""
        );

        const result =
          await installFlowTemplateForAgent({
            templateId:
              template.templateId,

            agentId,

            name:
              name.trim(),

            whatsappTemplateName:
              requiresWhatsAppTemplate
                ? selectedWhatsAppTemplate
                : undefined,
          });

        onInstalled(
          result
        );
      } catch (
        installError:
          any
      ) {
        setError(
          installError
            ?.message ||
          "התקנת התבנית נכשלה"
        );
      } finally {
        setSaving(
          false
        );
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
              ייווצר עותק מלא ונפרד של התהליך,
              כולל כל השלבים והחיבורים.
              העותק יישמר כטיוטה ויהיה ניתן
              לעריכה עבור הסוכן.
            </p>
          </div>

          <button
            type="button"
            onClick={
              onClose
            }
            className="text-xl text-slate-500"
            aria-label="סגירה"
          >
            ×
          </button>
        </div>

        <div className="mt-5 rounded-lg bg-slate-50 p-3 text-sm">
          <div>
            <span className="text-slate-500">
              תבנית:{" "}
            </span>

            <strong>
              {template.name}
            </strong>
          </div>

          <div className="mt-1">
            <span className="text-slate-500">
              מספר שלבים:{" "}
            </span>

            <strong>
              {Object.keys(
                template.steps ||
                {}
              ).length}
            </strong>
          </div>

          <div
            className="mt-1 break-all"
            dir="ltr"
          >
            <span className="text-slate-500">
              סוכן יעד:{" "}
            </span>

            <strong>
              {agentName ||
                agentId ||
                "לא נבחר"}
            </strong>
          </div>
        </div>

        <label className="mt-5 block text-sm font-medium">
          שם התהליך אצל הסוכן
        </label>

        <input
          value={
            name
          }
          onChange={(
            event
          ) =>
            setName(
              event.target.value
            )
          }
          className="mt-2 w-full rounded-lg border px-3 py-2"
        />

        {requiresWhatsAppTemplate ? (
          <div className="mt-5">
            <label className="block text-sm font-medium">
              תבנית WhatsApp להפעלת התהליך
            </label>

            <p className="mt-1 text-xs text-slate-500">
              התהליך בספרייה הוא כללי.
              בחרי את תבנית ה-WhatsApp של
              הסוכן שהלחיצה על הכפתור שלה
              תפעיל את התהליך.
            </p>

            <select
              value={
                selectedWhatsAppTemplate
              }
              onChange={(
                event
              ) =>
                setSelectedWhatsAppTemplate(
                  event.target.value
                )
              }
              disabled={
                loadingWhatsAppTemplates
              }
              className="mt-2 w-full rounded-lg border px-3 py-2 disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="">
                {loadingWhatsAppTemplates
                  ? "טוען תבניות..."
                  : "בחרי תבנית WhatsApp..."}
              </option>

              {whatsappTemplates.map(
                (
                  option
                ) => (
                  <option
                    key={
                      option.name
                    }
                    value={
                      option.name
                    }
                  >
                    {option.label}
                  </option>
                )
              )}
            </select>

            {!loadingWhatsAppTemplates &&
            whatsappTemplates.length ===
              0 ? (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                לא נמצאו תבניות WhatsApp
                מאושרות אצל הסוכן.
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() =>
              void submit()
            }
            disabled={
              saving ||
              !agentId ||
              (
                requiresWhatsAppTemplate &&
                !selectedWhatsAppTemplate
              )
            }
            className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving
              ? "מתקין..."
              : "יצירת Flow אצל הסוכן"}
          </button>

          <button
            type="button"
            onClick={
              onClose
            }
            disabled={
              saving
            }
            className="rounded-lg border px-4 py-2"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}