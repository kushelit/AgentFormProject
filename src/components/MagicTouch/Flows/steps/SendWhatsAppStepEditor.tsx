"use client";

import React, {
  useRef,
} from "react";

import type {
  FlowStep,
} from "@/lib/MagicTouch/flows/types";

type Props = {
  step:
    FlowStep;

  onConfigChange:
    (
      patch:
        Record<
          string,
          unknown
        >
    ) => void;
};

const BOOKING_URL_TOKEN =
  "{{agent.booking.defaultServiceUrl}}";

export default function SendWhatsAppStepEditor({
  step,
  onConfigChange,
}: Props) {
  const textareaRef =
    useRef<HTMLTextAreaElement | null>(
      null
    );

  const message =
    String(
      step.config?.message ||
      ""
    );

  const updateMessage = (
    nextMessage:
      string
  ) => {
    onConfigChange({
      mode:
        "text",

      message:
        nextMessage,
    });
  };

  const insertToken = (
    token:
      string
  ) => {
    const textarea =
      textareaRef.current;

    if (!textarea) {
      const separator =
        message &&
        !message.endsWith(
          "\n"
        )
          ? "\n"
          : "";

      updateMessage(
        `${message}${separator}${token}`
      );

      return;
    }

    const start =
      textarea.selectionStart ??
      message.length;

    const end =
      textarea.selectionEnd ??
      start;

    const before =
      message.slice(
        0,
        start
      );

    const after =
      message.slice(
        end
      );

    const nextMessage =
      `${before}${token}${after}`;

    updateMessage(
      nextMessage
    );

    requestAnimationFrame(
      () => {
        textarea.focus();

        const nextPosition =
          start +
          token.length;

        textarea.setSelectionRange(
          nextPosition,
          nextPosition
        );
      }
    );
  };

  const bookingTokenExists =
    message.includes(
      BOOKING_URL_TOKEN
    );

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">
          תוכן ההודעה
        </span>

        <textarea
          ref={
            textareaRef
          }
          className="min-h-44 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
          value={
            message
          }
          onChange={(
            event
          ) =>
            updateMessage(
              event.target.value
            )
          }
          placeholder="כתבי את ההודעה שתישלח ללקוח..."
        />
      </label>

      <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
        <div className="text-sm font-bold text-slate-800">
          הוספת מידע דינמי
        </div>

        <p className="mt-1 text-xs leading-5 text-slate-500">
          המערכת תחליף את המשתנה בזמן הריצה בערך של הסוכן שמפעיל את ה־Flow.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              insertToken(
                BOOKING_URL_TOKEN
              )
            }
            className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-50"
          >
            <span>
              📅
            </span>

            <span>
              קישור לפגישת ברירת המחדל
            </span>
          </button>
        </div>

        {bookingTokenExists ? (
          <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
            ✓ ההודעה משתמשת בקישור ה־Booking של הסוכן
          </div>
        ) : null}

        <div className="mt-3 text-xs text-slate-400">
          בזמן הריצה:
          {" "}
          <span
            dir="ltr"
            className="font-mono"
          >
            {BOOKING_URL_TOKEN}
          </span>
        </div>
      </div>
    </div>
  );
}