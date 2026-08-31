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
  FlowTrigger,
} from "@/lib/MagicTouch/flows/types";

import {
  FLOW_SYSTEMS,
  getFlowSystem,
  getSystemForTrigger,
} from "@/lib/MagicTouch/flows/flowBuilderRegistry";

import {
  useMagicTouchAgent,
} from "@/components/MagicTouch/MagicTouchAgentContext";

type Props = {
  value: FlowTrigger;
  onChange: (
    value: FlowTrigger
  ) => void;
};

type WhatsAppTemplateOption = {
  name: string;
  label: string;
  status: string;
};

const fieldClass =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50";

export default function FlowTriggerEditor({
  value,
  onChange,
}: Props) {
  const {
    effectiveAgentId:
      agentId,
  } =
    useMagicTouchAgent();

  const [
    whatsappTemplates,
    setWhatsAppTemplates,
  ] =
    useState<
      WhatsAppTemplateOption[]
    >([]);

  const [
    templatesLoading,
    setTemplatesLoading,
  ] =
    useState(false);

  const [
    templatesError,
    setTemplatesError,
  ] =
    useState("");

  const currentSystem =
    useMemo(() => {
      if (
        value.sourceSystem
      ) {
        const bySource =
          getFlowSystem(
            value.sourceSystem
          );

        if (
          bySource
        ) {
          return bySource;
        }
      }

      return getSystemForTrigger(
        value.type ||
          ""
      );
    }, [
      value.sourceSystem,
      value.type,
    ]);

  const selectedSystemId =
    currentSystem?.id ||
    "";

  const availableSystems =
    FLOW_SYSTEMS.filter(
      (
        system
      ) =>
        system.triggers
          .length >
        0
    );

  const availableTriggers =
    currentSystem?.triggers ||
    [];

  const patch = (
    next:
      Partial<FlowTrigger>
  ) => {
    onChange({
      ...value,
      ...next,
    });
  };

  /*
   * טוענים את תבניות ה-WhatsApp
   * של הסוכן הפעיל.
   *
   * אנחנו לא מסתמכים על query של status
   * כדי לא לדרוש אינדקס נוסף.
   * הטעינה קטנה ומסוננת בצד הלקוח.
   */
  useEffect(() => {
    if (
      !agentId ||
      value.type !==
        "whatsapp_quick_reply_received"
    ) {
      setWhatsAppTemplates(
        []
      );

      setTemplatesError(
        ""
      );

      return;
    }

    let cancelled =
      false;

    const loadTemplates =
      async () => {
        setTemplatesLoading(
          true
        );

        setTemplatesError(
          ""
        );

        try {
          const templatesRef =
            collection(
              db,
              "agents",
              agentId,
              "whatsapp_templates"
            );

          const snapshot =
            await getDocs(
              templatesRef
            );

          if (
            cancelled
          ) {
            return;
          }

          const templates =
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

                  const name =
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
                    name:
                      name ||
                      templateDoc.id,

                    label:
                      displayName ||
                      name ||
                      templateDoc.id,

                    status,
                  };
                }
              )
              .filter(
                (
                  template
                ) =>
                  template.status ===
                  "APPROVED"
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
            templates
          );
        } catch (
          error
        ) {
          console.error(
            "[FlowTriggerEditor] Failed to load WhatsApp templates",
            error
          );

          if (
            cancelled
          ) {
            return;
          }

          setWhatsAppTemplates(
            []
          );

          setTemplatesError(
            "לא ניתן היה לטעון את תבניות ה-WhatsApp של הסוכן."
          );
        } finally {
          if (
            !cancelled
          ) {
            setTemplatesLoading(
              false
            );
          }
        }
      };

    void loadTemplates();

    return () => {
      cancelled =
        true;
    };
  }, [
    agentId,
    value.type,
  ]);

  const handleSystemChange = (
    systemId:
      string
  ) => {
    const system =
      getFlowSystem(
        systemId
      );

    if (
      !system
    ) {
      patch({
        sourceSystem:
          "",
        type:
          "",
        templateName:
          undefined,
        quickReplyAction:
          undefined,
      });

      return;
    }

    const currentTriggerStillValid =
      system.triggers.some(
        (
          trigger
        ) =>
          trigger.type ===
          value.type
      );

    patch({
      sourceSystem:
        system.id,

      type:
        currentTriggerStillValid
          ? value.type
          : "",

      templateName:
        currentTriggerStillValid &&
        value.type ===
          "whatsapp_quick_reply_received"
          ? value.templateName ||
            ""
          : undefined,

      quickReplyAction:
        currentTriggerStillValid &&
        value.type ===
          "whatsapp_quick_reply_received"
          ? value.quickReplyAction ||
            ""
          : undefined,
    });
  };

  const handleTriggerChange = (
    type:
      string
  ) => {
    patch({
      type,

      sourceSystem:
        currentSystem?.id ||
        "",

      templateName:
        type ===
        "whatsapp_quick_reply_received"
          ? value.templateName ||
            ""
          : undefined,

      quickReplyAction:
        type ===
        "whatsapp_quick_reply_received"
          ? value.quickReplyAction ||
            ""
          : undefined,
    });
  };

  const selectedTemplateExists =
    Boolean(
      value.templateName &&
        whatsappTemplates.some(
          (
            template
          ) =>
            template.name ===
            value.templateName
        )
    );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-lg">
          ⚡
        </div>

        <div>
          <h2 className="text-lg font-bold text-slate-900">
            מתי להפעיל את התהליך?
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            בחרי קודם את המערכת שממנה מגיע
            האירוע, ולאחר מכן את האירוע
            שמפעיל את התהליך.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label>
          <span className="mb-2 block text-sm font-semibold text-slate-700">
            מערכת
          </span>

          <select
            className={
              fieldClass
            }
            value={
              selectedSystemId
            }
            onChange={(
              event
            ) =>
              handleSystemChange(
                event
                  .target
                  .value
              )
            }
          >
            <option value="">
              בחרי מערכת...
            </option>

            {availableSystems.map(
              (
                system
              ) => (
                <option
                  key={
                    system.id
                  }
                  value={
                    system.id
                  }
                >
                  {system.icon}{" "}
                  {system.label}
                </option>
              )
            )}
          </select>
        </label>

        <label>
          <span className="mb-2 block text-sm font-semibold text-slate-700">
            אירוע
          </span>

          <select
            className={
              fieldClass
            }
            value={
              value.type ||
              ""
            }
            disabled={
              !selectedSystemId
            }
            onChange={(
              event
            ) =>
              handleTriggerChange(
                event
                  .target
                  .value
              )
            }
          >
            <option value="">
              {selectedSystemId
                ? "בחרי אירוע..."
                : "בחרי קודם מערכת"}
            </option>

            {availableTriggers.map(
              (
                trigger
              ) => (
                <option
                  key={
                    trigger.type
                  }
                  value={
                    trigger.type
                  }
                >
                  {trigger.label}
                </option>
              )
            )}
          </select>
        </label>

        {value.type ===
        "whatsapp_quick_reply_received" ? (
          <>
            <label>
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                תבנית WhatsApp
              </span>

              <select
                className={
                  fieldClass
                }
                value={
                  value.templateName ||
                  ""
                }
                disabled={
                  templatesLoading ||
                  !agentId
                }
                onChange={(
                  event
                ) =>
                  patch({
                    templateName:
                      event
                        .target
                        .value,
                  })
                }
                dir="rtl"
              >
                <option value="">
                  {templatesLoading
                    ? "טוען תבניות..."
                    : !agentId
                      ? "לא נמצא סוכן פעיל"
                      : "בחרי תבנית..."}
                </option>

                {/*
                 * אם נטען Flow קיים עם
                 * templateName שכבר לא מופיע
                 * ברשימת APPROVED,
                 * לא נעלים את הערך הקיים.
                 */}
                {value.templateName &&
                !selectedTemplateExists ? (
                  <option
                    value={
                      value.templateName
                    }
                  >
                    {value.templateName}{" "}
                    (לא נמצאה בין התבניות המאושרות)
                  </option>
                ) : null}

                {whatsappTemplates.map(
                  (
                    template
                  ) => (
                    <option
                      key={
                        template.name
                      }
                      value={
                        template.name
                      }
                    >
                      {
                        template.label
                      }
                    </option>
                  )
                )}
              </select>

              {templatesError ? (
                <span className="mt-2 block text-xs font-medium text-rose-600">
                  {templatesError}
                </span>
              ) : !templatesLoading &&
                agentId &&
                whatsappTemplates.length ===
                  0 ? (
                <span className="mt-2 block text-xs text-amber-600">
                  לא נמצאו תבניות WhatsApp
                  מאושרות אצל הסוכן.
                </span>
              ) : (
                <span className="mt-2 block text-xs text-slate-400">
                  מוצגות התבניות המאושרות של
                  הסוכן הפעיל.
                </span>
              )}
            </label>

            <label>
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                תשובת הכפתור
              </span>

              <select
                className={
                  fieldClass
                }
                value={
                  value.quickReplyAction ||
                  ""
                }
                onChange={(
                  event
                ) =>
                  patch({
                    quickReplyAction:
                      event
                        .target
                        .value,
                  })
                }
              >
                <option value="">
                  כל תשובה
                </option>

                <option value="interested">
                  מעוניין
                </option>

                <option value="declined">
                  לא מעוניין
                </option>

                <option value="booking">
                  קביעת פגישה
                </option>

                <option value="reschedule_yes">
                  רוצה לתאם מחדש
                </option>

                <option value="reschedule_no">
                  לא רוצה לתאם מחדש
                </option>
              </select>

              <span className="mt-2 block text-xs text-slate-400">
                בשלב הבא נוכל לחבר גם את
                הרשימה הזו אוטומטית לכפתורים
                שמוגדרים בתבנית שנבחרה.
              </span>
            </label>
          </>
        ) : null}
      </div>
    </section>
  );
}