"use client";

import React from "react";
import type { FlowTrigger } from "@/lib/MagicTouch/flows/types";

type Props = {
  value: FlowTrigger;
  onChange: (value: FlowTrigger) => void;
};

type TriggerOption = {
  value: string;
  label: string;
  sourceSystem?: string;
};

const TRIGGERS: TriggerOption[] = [
  {
    value: "whatsapp_quick_reply_received",
    label: "לחיצה על כפתור WhatsApp",
    sourceSystem: "whatsapp",
  },
  {
    value: "whatsapp_message_received",
    label: "התקבלה הודעת WhatsApp",
    sourceSystem: "whatsapp",
  },
  {
    value: "microsoft_booking_created",
    label: "נקבעה פגישה ב־Microsoft Bookings",
    sourceSystem: "microsoft_bookings",
  },
  {
    value: "microsoft_booking_cancelled",
    label: "בוטלה פגישה ב־Microsoft Bookings",
    sourceSystem: "microsoft_bookings",
  },
  {
    value: "reengagement_message_sent",
    label: "נשלחה הודעת חידוש קשר",
    sourceSystem: "whatsapp",
  },
  {
    value: "manual",
    label: "הפעלה ידנית",
    sourceSystem: "manual",
  },
];

const SOURCE_SYSTEMS = [
  { value: "microsoft_bookings", label: "Microsoft Bookings" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "surense", label: "שורנס" },
  { value: "magicsale", label: "MagicSale" },
  { value: "manual", label: "הפעלה ידנית" },
];

const fieldClass =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50";

export default function FlowTriggerEditor({
  value,
  onChange,
}: Props) {
  const patch = (next: Partial<FlowTrigger>) => {
    onChange({
      ...value,
      ...next,
    });
  };

  const handleTriggerChange = (type: string) => {
    const option = TRIGGERS.find((item) => item.value === type);

    patch({
      type,
      sourceSystem: option?.sourceSystem || value.sourceSystem || "",
      templateName:
        type === "whatsapp_quick_reply_received"
          ? value.templateName || ""
          : undefined,
      quickReplyAction:
        type === "whatsapp_quick_reply_received"
          ? value.quickReplyAction || ""
          : undefined,
    });
  };

  return (
<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">     
<div className="mb-3 flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-lg">
          ⚡
        </div>

        <div>
          <h2 className="text-lg font-bold text-slate-900">
            מתי להפעיל את התהליך?
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            בחרי אירוע. מערכת המקור תמולא אוטומטית וניתנת לשינוי.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label>
          <span className="mb-2 block text-sm font-semibold text-slate-700">
            סוג אירוע
          </span>
          <select
            className={fieldClass}
            value={value.type || ""}
            onChange={(event) => handleTriggerChange(event.target.value)}
          >
            <option value="">בחרי אירוע...</option>
            {TRIGGERS.map((trigger) => (
              <option key={trigger.value} value={trigger.value}>
                {trigger.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="mb-2 block text-sm font-semibold text-slate-700">
            מערכת מקור
          </span>
          <select
            className={fieldClass}
            value={value.sourceSystem || ""}
            onChange={(event) =>
              patch({
                sourceSystem: event.target.value,
              })
            }
          >
            <option value="">ללא הגבלה על מערכת מקור</option>
            {SOURCE_SYSTEMS.map((source) => (
              <option key={source.value} value={source.value}>
                {source.label}
              </option>
            ))}
          </select>
          <span className="mt-2 block text-xs text-slate-400">
            הערך הטכני נשמר מאחורי הקלעים.
          </span>
        </label>

        {value.type === "whatsapp_quick_reply_received" ? (
          <>
            <label>
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                שם תבנית WhatsApp
              </span>
              <input
                className={fieldClass}
                value={value.templateName || ""}
                onChange={(event) =>
                  patch({
                    templateName: event.target.value,
                  })
                }
                placeholder="meir_reengagement_quick_reply_test"
                dir="ltr"
              />
            </label>

            <label>
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                תשובת הכפתור
              </span>
              <select
                className={fieldClass}
                value={value.quickReplyAction || ""}
                onChange={(event) =>
                  patch({
                    quickReplyAction: event.target.value,
                  })
                }
              >
                <option value="">כל תשובה</option>
                <option value="interested">מעוניין</option>
                <option value="declined">לא מעוניין</option>
                <option value="book">קביעת פגישה</option>
                <option value="reschedule_yes">רוצה לתאם מחדש</option>
                <option value="reschedule_no">לא רוצה לתאם מחדש</option>
              </select>
            </label>
          </>
        ) : null}
      </div>
    </section>
  );
}
