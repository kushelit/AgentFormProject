"use client";

import React from "react";

import type {
  FlowTrigger,
} from "@/lib/MagicTouch/flows/types";

type Props = {
  value:
    FlowTrigger;

  onChange:
    (
      value:
        FlowTrigger
    ) => void;
};

const TRIGGERS = [
  {
    value:
      "whatsapp_quick_reply_received",

    label:
      "לחיצה על כפתור WhatsApp",
  },

  {
    value:
      "whatsapp_message_received",

    label:
      "התקבלה הודעת WhatsApp",
  },

  {
    value:
      "microsoft_booking_created",

    label:
      "נקבעה פגישה ב-Microsoft Bookings",
  },

  {
    value:
      "microsoft_booking_cancelled",

    label:
      "בוטלה פגישה ב-Microsoft Bookings",
  },

  {
    value:
      "reengagement_message_sent",

    label:
      "נשלחה הודעת חידוש קשר",
  },

  {
    value:
      "manual",

    label:
      "הפעלה ידנית",
  },
];

export default function FlowTriggerEditor({
  value,
  onChange,
}: Props) {
  const patch = (
    next:
      Partial<FlowTrigger>
  ) => {
    onChange({
      ...value,
      ...next,
    });
  };

  return (
    <section className="rounded-xl border bg-white p-5">
      <h2 className="mb-4 text-lg font-semibold">
        מתי להפעיל את התהליך?
      </h2>

      <div className="grid gap-4 md:grid-cols-2">
        <label>
          <span className="mb-1 block text-sm font-medium">
            סוג אירוע
          </span>

          <select
            className="w-full rounded-lg border px-3 py-2"
            value={
              value.type
            }
            onChange={(
              event
            ) =>
              patch({
                type:
                  event
                    .target
                    .value,
              })
            }
          >
            {
              TRIGGERS.map(
                (
                  trigger
                ) => (
                  <option
                    key={
                      trigger
                        .value
                    }
                    value={
                      trigger
                        .value
                    }
                  >
                    {
                      trigger
                        .label
                    }
                  </option>
                )
              )
            }
          </select>
        </label>

        {
          value.type ===
            "whatsapp_quick_reply_received" &&
          (
            <>
              <label>
                <span className="mb-1 block text-sm font-medium">
                  שם תבנית WhatsApp
                </span>

                <input
                  className="w-full rounded-lg border px-3 py-2"
                  value={
                    value
                      .templateName ||
                    ""
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
                  placeholder="meir_reengagement_quick_reply_test"
                />
              </label>

              <label>
                <span className="mb-1 block text-sm font-medium">
                  פעולה מהכפתור
                </span>

                <select
                  className="w-full rounded-lg border px-3 py-2"
                  value={
                    value
                      .quickReplyAction ||
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
                    כל פעולה
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
                </select>
              </label>
            </>
          )
        }

        {
          (
            value.type ===
              "microsoft_booking_created" ||
            value.type ===
              "microsoft_booking_cancelled"
          ) &&
          (
            <label>
              <span className="mb-1 block text-sm font-medium">
                מערכת מקור
              </span>

              <input
                className="w-full rounded-lg border px-3 py-2"
                value={
                  value
                    .sourceSystem ||
                  "microsoft_bookings"
                }
                onChange={(
                  event
                ) =>
                  patch({
                    sourceSystem:
                      event
                        .target
                        .value,
                  })
                }
              />
            </label>
          )
        }
      </div>
    </section>
  );
}
