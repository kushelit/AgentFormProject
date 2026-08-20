"use client";


import {
  useMemo,
  useState,
} from "react";

import {
  httpsCallable,
} from "firebase/functions";

import {
  functions,
} from "@/lib/firebase/firebase";

type ToastKind =
  | "success"
  | "error"
  | "warning"
  | "info";

type ToastState = {
  type: ToastKind;
  title: string;
  message: string;
};

export type WhatsAppTemplateCreatedResult = {
  name: string;
  status: string;
  bodyText: string;
  quickReplyButtons: string[];
  quickReplyActions: Record<string, string>;
};

type CreateTemplateResponse = {
  ok?: boolean;
  name?: string;
  status?: string;
};

type Props = {
  agentId: string;
  compact?: boolean;
  defaultTemplateName?: string;
  defaultBodyText?: string;
  onCreated?: (
    result:
      WhatsAppTemplateCreatedResult
  ) => void;
};

function getTemplateVariableNumbers(
  value: string
): number[] {
  const matches =
    Array.from(
      value.matchAll(
        /\{\{(\d+)\}\}/g
      )
    );

  return Array.from(
    new Set(
      matches
        .map(
          (match) =>
            Number(
              match[1]
            )
        )
        .filter(
          (number) =>
            Number.isInteger(
              number
            ) &&
            number > 0
        )
    )
  ).sort(
    (first, second) =>
      first - second
  );
}

function normalizeTemplateName(
  value: string
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function replaceTemplatePreview(
  bodyText: string,
  exampleValue: string
): string {
  return String(
    bodyText || ""
  ).replace(
    /\{\{1\}\}/g,
    exampleValue ||
      "שם הלקוח"
  );
}

export default function WhatsAppTemplateBuilder({
  agentId,
  compact = false,
  defaultTemplateName = "",
  defaultBodyText = "",
  onCreated,
}: Props) {
  const [
    templateName,
    setTemplateName,
  ] =
    useState(
      defaultTemplateName
    );

  const [
    category,
    setCategory,
  ] =
    useState("UTILITY");

  const [
    language,
    setLanguage,
  ] =
    useState("he");

  const [
    bodyText,
    setBodyText,
  ] =
    useState(
      defaultBodyText
    );

  const [
    exampleValue,
    setExampleValue,
  ] =
    useState("");

  const [
    quickReply1,
    setQuickReply1,
  ] =
    useState("");

  const [
    quickReply1Action,
    setQuickReply1Action,
  ] =
    useState("interested");

  const [
    quickReply2,
    setQuickReply2,
  ] =
    useState("");

  const [
    quickReply2Action,
    setQuickReply2Action,
  ] =
    useState("declined");

  const [
    isCreating,
    setIsCreating,
  ] =
    useState(false);

  const [
    toast,
    setToast,
  ] =
    useState<ToastState | null>(
      null
    );

  const variableNumbers =
    useMemo(
      () =>
        getTemplateVariableNumbers(
          bodyText
        ),
      [
        bodyText,
      ]
    );

  const hasFirstVariable =
    variableNumbers.includes(
      1
    );

  const previewText =
    useMemo(
      () =>
        replaceTemplatePreview(
          bodyText,
          exampleValue ||
            "ישראל"
        ),
      [
        bodyText,
        exampleValue,
      ]
    );

  const fillRecommendedButtons =
    () => {
      setQuickReply1(
        "כן, אשמח"
      );

      setQuickReply1Action(
        "interested"
      );

      setQuickReply2(
        "לא מעוניין"
      );

      setQuickReply2Action(
        "declined"
      );
    };

  const showToast =
    (
      nextToast:
        ToastState
    ) => {
      setToast(
        nextToast
      );

      window.setTimeout(
        () => {
          setToast(
            null
          );
        },
        4500
      );
    };

  const handleCreateTemplate =
    async () => {
      if (
        !agentId ||
        isCreating
      ) {
        return;
      }

      const normalizedName =
        normalizeTemplateName(
          templateName
        );

      const normalizedBody =
        bodyText.trim();

      if (
        !normalizedName ||
        !normalizedBody
      ) {
        showToast({
          type:
            "warning",

          title:
            "חסרים נתונים",

          message:
            "יש להזין שם תבנית ותוכן הודעה.",
        });

        return;
      }

      if (
        normalizedName !==
        templateName.trim()
      ) {
        setTemplateName(
          normalizedName
        );
      }

      if (
        variableNumbers.length >
          0 &&
        (
          variableNumbers.length !==
            1 ||
          variableNumbers[0] !==
            1
        )
      ) {
        showToast({
          type:
            "warning",

          title:
            "משתנים לא תקינים",

          message:
            "בשלב זה ניתן להשתמש רק במשתנה {{1}} עבור שם הלקוח.",
        });

        return;
      }

      if (
        hasFirstVariable &&
        !exampleValue.trim()
      ) {
        showToast({
          type:
            "warning",

          title:
            "חסרה דוגמה למשתנה",

          message:
            "התבנית כוללת את {{1}}. יש להזין דוגמה, למשל: ישראל.",
        });

        return;
      }

      const normalizedQuickReply1 =
        quickReply1.trim();

      const normalizedQuickReply2 =
        quickReply2.trim();

      if (
        normalizedQuickReply1 &&
        normalizedQuickReply2 &&
        normalizedQuickReply1 ===
          normalizedQuickReply2
      ) {
        showToast({
          type:
            "warning",

          title:
            "כפתורים זהים",

          message:
            "יש להזין טקסט שונה לכל כפתור תגובה.",
        });

        return;
      }

      const quickReplyButtons =
        [
          normalizedQuickReply1,
          normalizedQuickReply2,
        ].filter(
          Boolean
        );

      const quickReplyActions:
        Record<string, string> = {};

      if (
        normalizedQuickReply1
      ) {
        quickReplyActions[
          normalizedQuickReply1
        ] =
          quickReply1Action;
      }

      if (
        normalizedQuickReply2
      ) {
        quickReplyActions[
          normalizedQuickReply2
        ] =
          quickReply2Action;
      }

      setIsCreating(
        true
      );

      try {
        const fn =
          httpsCallable<
            {
              agentId:
                string;
              name:
                string;
              category:
                string;
              language:
                string;
              bodyText:
                string;
              bodyExamples:
                string[];
              quickReplyButtons:
                string[];
              quickReplyActions:
                Record<string, string>;
            },
            CreateTemplateResponse
          >(
            functions,
            "createWhatsAppTemplate"
          );

        const response =
          await fn({
            agentId,

            name:
              normalizedName,

            category,

            language,

            bodyText:
              normalizedBody,

            bodyExamples:
              hasFirstVariable
                ? [
                    exampleValue.trim(),
                  ]
                : [],

            quickReplyButtons,

            quickReplyActions,
          });

        const result:
          WhatsAppTemplateCreatedResult = {
            name:
              response.data
                ?.name ||
              normalizedName,

            status:
              response.data
                ?.status ||
              "PENDING",

            bodyText:
              normalizedBody,

            quickReplyButtons,

            quickReplyActions,
          };

        showToast({
          type:
            "success",

          title:
            "התבנית נשלחה ל־Meta",

          message:
            `התבנית ${result.name} נוצרה בסטטוס ${result.status}.`,
        });

        onCreated?.(
          result
        );
      } catch (
        error: any
      ) {
        console.error(
          "[WhatsAppTemplateBuilder] Failed to create template",
          error
        );

        showToast({
          type:
            "error",

          title:
            "יצירת התבנית נכשלה",

          message:
            error?.message ||
            "לא ניתן היה ליצור את התבנית.",
        });
      } finally {
        setIsCreating(
          false
        );
      }
    };

  return (
    <section
      dir="rtl"
      className="w-full"
    >
      {toast ? (
        <div
          className={`
            fixed
            left-6
            top-20
            z-[200]
            w-[min(420px,calc(100vw-3rem))]
            rounded-xl
            border
            bg-white
            p-4
            shadow-2xl
            ${
              toast.type ===
              "success"
                ? "border-green-300"
                : toast.type ===
                    "error"
                  ? "border-red-300"
                  : toast.type ===
                      "warning"
                    ? "border-amber-300"
                    : "border-blue-300"
            }
          `}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-bold text-slate-900">
                {toast.title}
              </div>

              <div className="mt-1 text-sm text-slate-600">
                {toast.message}
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                setToast(
                  null
                )
              }
              className="text-xl text-slate-400 hover:text-slate-700"
            >
              ×
            </button>
          </div>
        </div>
      ) : null}

      <div
        className={[
          compact
            ? "grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]"
            : "grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]",
        ].join(" ")}
      >
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">
            יצירת תבנית חדשה
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            התבנית תישלח לאישור Meta לפני שניתן יהיה להשתמש בה.
          </p>

          <div className="mt-5 space-y-5">
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                שם תבנית *
              </label>

              <input
                type="text"
                value={
                  templateName
                }
                onChange={(
                  event
                ) =>
                  setTemplateName(
                    event.target.value
                  )
                }
                onBlur={() =>
                  setTemplateName(
                    normalizeTemplateName(
                      templateName
                    )
                  )
                }
                placeholder="first_outbound_flow"
                className="w-full rounded-lg border px-3 py-2.5 font-mono outline-none focus:border-blue-500"
              />

              <p className="mt-1 text-xs text-slate-500">
                אותיות אנגלית קטנות, מספרים וקו תחתון בלבד.
              </p>
            </div>

            {!compact ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">
                    קטגוריה
                  </label>

                  <select
                    value={
                      category
                    }
                    onChange={(
                      event
                    ) =>
                      setCategory(
                        event.target.value
                      )
                    }
                    className="w-full rounded-lg border px-3 py-2.5"
                  >
                    <option value="UTILITY">
                      UTILITY
                    </option>

                    <option value="MARKETING">
                      MARKETING
                    </option>

                    <option value="AUTHENTICATION">
                      AUTHENTICATION
                    </option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">
                    שפה
                  </label>

                  <select
                    value={
                      language
                    }
                    onChange={(
                      event
                    ) =>
                      setLanguage(
                        event.target.value
                      )
                    }
                    className="w-full rounded-lg border px-3 py-2.5"
                  >
                    <option value="he">
                      עברית (he)
                    </option>

                    <option value="en">
                      English (en)
                    </option>
                  </select>
                </div>
              </div>
            ) : null}

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                תוכן התבנית *
              </label>

              <textarea
                value={
                  bodyText
                }
                onChange={(
                  event
                ) =>
                  setBodyText(
                    event.target.value
                  )
                }
                rows={
                  compact
                    ? 5
                    : 7
                }
                placeholder={`שלום {{1}},
רציתי לבדוק האם תרצה שנקבע שיחה קצרה.`}
                className="w-full resize-y rounded-lg border px-3 py-3 outline-none focus:border-blue-500"
              />

              <div className="mt-2 rounded-lg border bg-slate-50 px-3 py-2 text-sm text-slate-600">
                ניתן לשלב שם פרטי באמצעות{" "}
                <span className="font-mono font-bold">
                  {"{{1}}"}
                </span>
                .
              </div>
            </div>

            {hasFirstVariable ? (
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">
                  דוגמה למשתנה {"{{1}}"} *
                </label>

                <input
                  type="text"
                  value={
                    exampleValue
                  }
                  onChange={(
                    event
                  ) =>
                    setExampleValue(
                      event.target.value
                    )
                  }
                  placeholder="ישראל"
                  className="w-full rounded-lg border px-3 py-2.5"
                />
              </div>
            ) : null}

            <section className="rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-900">
                    כפתורי תגובה מהירה
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    הטקסט מוצג ללקוח, והפעולה תשמש אחר כך את ה־Flow.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={
                    fillRecommendedButtons
                  }
                  className="rounded-lg border px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                >
                  מילוי מומלץ
                </button>
              </div>

              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                  <input
                    type="text"
                    value={
                      quickReply1
                    }
                    onChange={(
                      event
                    ) =>
                      setQuickReply1(
                        event.target.value
                      )
                    }
                    placeholder="כן, אשמח"
                    className="w-full rounded-lg border px-3 py-2.5"
                  />

                  <select
                    value={
                      quickReply1Action
                    }
                    onChange={(
                      event
                    ) =>
                      setQuickReply1Action(
                        event.target.value
                      )
                    }
                    className="w-full rounded-lg border px-3 py-2.5"
                  >
                    <option value="interested">
                      מעוניין
                    </option>

                    <option value="declined">
                      לא מעוניין
                    </option>

                    <option value="booking">
                      קביעת פגישה
                    </option>

                    <option value="other">
                      פעולה אחרת
                    </option>
                  </select>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                  <input
                    type="text"
                    value={
                      quickReply2
                    }
                    onChange={(
                      event
                    ) =>
                      setQuickReply2(
                        event.target.value
                      )
                    }
                    placeholder="לא מעוניין"
                    className="w-full rounded-lg border px-3 py-2.5"
                  />

                  <select
                    value={
                      quickReply2Action
                    }
                    onChange={(
                      event
                    ) =>
                      setQuickReply2Action(
                        event.target.value
                      )
                    }
                    className="w-full rounded-lg border px-3 py-2.5"
                  >
                    <option value="declined">
                      לא מעוניין
                    </option>

                    <option value="interested">
                      מעוניין
                    </option>

                    <option value="booking">
                      קביעת פגישה
                    </option>

                    <option value="other">
                      פעולה אחרת
                    </option>
                  </select>
                </div>
              </div>
            </section>

            <button
              type="button"
              onClick={() =>
                void handleCreateTemplate()
              }
              disabled={
                !agentId ||
                isCreating ||
                !templateName.trim() ||
                !bodyText.trim()
              }
              className="w-full rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCreating
                ? "יוצר תבנית..."
                : "שליחת התבנית לאישור Meta"}
            </button>
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="font-bold text-slate-900">
              תצוגה מקדימה
            </h2>

            <div className="mt-4 rounded-2xl bg-[#efeae2] p-4">
              <div className="rounded-xl bg-white p-4 shadow-sm">
                <div className="whitespace-pre-wrap text-sm text-slate-800">
                  {previewText ||
                    "תוכן התבנית יוצג כאן."}
                </div>

                {quickReply1 ||
                quickReply2 ? (
                  <div className="mt-4 divide-y border-t">
                    {quickReply1 ? (
                      <div className="py-2 text-center text-sm font-semibold text-blue-600">
                        {quickReply1}
                      </div>
                    ) : null}

                    {quickReply2 ? (
                      <div className="py-2 text-center text-sm font-semibold text-blue-600">
                        {quickReply2}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Meta עשויה לשנות את קטגוריית התבנית בהתאם לתוכן.
          </section>
        </aside>
      </div>
    </section>
  );
}
