"use client";

import React, { useMemo } from "react";

import type {
  FlowTrigger,
} from "@/lib/MagicTouch/flows/types";

import {
  FLOW_SYSTEMS,
  getFlowSystem,
  getSystemForTrigger,
} from "@/lib/MagicTouch/flows/flowBuilderRegistry";

import type {
  FlowSystemId,
} from "@/lib/MagicTouch/flows/flowBuilderRegistry";

type Props = {
  value: FlowTrigger;
  onChange: (value: FlowTrigger) => void;
};

const fieldClass =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50";

export default function FlowTriggerEditor({
  value,
  onChange,
}: Props) {
  const currentSystem = useMemo(() => {
    if (value.sourceSystem) {
      const bySource = getFlowSystem(
        value.sourceSystem
      );

      if (bySource) {
        return bySource;
      }
    }

    return getSystemForTrigger(
      value.type || ""
    );
  }, [
    value.sourceSystem,
    value.type,
  ]);

  const selectedSystemId =
    currentSystem?.id || "";

  const availableSystems =
    FLOW_SYSTEMS.filter(
      (system) =>
        system.triggers.length > 0
    );

  const availableTriggers =
    currentSystem?.triggers || [];

  const patch = (
    next: Partial<FlowTrigger>
  ) => {
    onChange({
      ...value,
      ...next,
    });
  };

  const handleSystemChange = (
    systemId: string
  ) => {
    const system =
      getFlowSystem(systemId);

    if (!system) {
      patch({
        sourceSystem: "",
        type: "",
        templateName: undefined,
        quickReplyAction: undefined,
      });

      return;
    }

    const currentTriggerStillValid =
      system.triggers.some(
        (trigger) =>
          trigger.type === value.type
      );

    patch({
      sourceSystem: system.id,
      type:
        currentTriggerStillValid
          ? value.type
          : "",
      templateName:
        currentTriggerStillValid &&
        value.type ===
          "whatsapp_quick_reply_received"
          ? value.templateName || ""
          : undefined,
      quickReplyAction:
        currentTriggerStillValid &&
        value.type ===
          "whatsapp_quick_reply_received"
          ? value.quickReplyAction || ""
          : undefined,
    });
  };

  const handleTriggerChange = (
    type: string
  ) => {
    patch({
      type,
      sourceSystem:
        currentSystem?.id || "",
      templateName:
        type ===
        "whatsapp_quick_reply_received"
          ? value.templateName || ""
          : undefined,
      quickReplyAction:
        type ===
        "whatsapp_quick_reply_received"
          ? value.quickReplyAction || ""
          : undefined,
    });
  };

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
            className={fieldClass}
            value={selectedSystemId}
            onChange={(event) =>
              handleSystemChange(
                event.target.value
              )
            }
          >
            <option value="">
              בחרי מערכת...
            </option>

            {availableSystems.map(
              (system) => (
                <option
                  key={system.id}
                  value={system.id}
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
            className={fieldClass}
            value={value.type || ""}
            disabled={!selectedSystemId}
            onChange={(event) =>
              handleTriggerChange(
                event.target.value
              )
            }
          >
            <option value="">
              {selectedSystemId
                ? "בחרי אירוע..."
                : "בחרי קודם מערכת"}
            </option>

            {availableTriggers.map(
              (trigger) => (
                <option
                  key={trigger.type}
                  value={trigger.type}
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
                שם תבנית WhatsApp
              </span>

              <input
                className={fieldClass}
                value={
                  value.templateName || ""
                }
                onChange={(event) =>
                  patch({
                    templateName:
                      event.target.value,
                  })
                }
                placeholder="meir_reengagement_quick_reply_test"
                dir="ltr"
              />

              <span className="mt-2 block text-xs text-slate-400">
                בשלב הבא נחליף את השדה
                הזה בבחירה מתוך התבניות של
                הסוכן.
              </span>
            </label>

            <label>
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                תשובת הכפתור
              </span>

              <select
                className={fieldClass}
                value={
                  value.quickReplyAction ||
                  ""
                }
                onChange={(event) =>
                  patch({
                    quickReplyAction:
                      event.target.value,
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

                <option value="book">
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
                גם את הרשימה הזו נחבר
                בהמשך לתשובות שמוגדרות
                בתבנית שנבחרה.
              </span>
            </label>
          </>
        ) : null}
      </div>
    </section>
  );
}