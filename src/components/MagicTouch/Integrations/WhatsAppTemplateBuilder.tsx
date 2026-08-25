"use client";


import {
  useEffect,
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

export type WhatsAppTemplateUrlButton = {
  text: string;
  url: string;
};

export type WhatsAppTemplateEditValue = {
  name: string;
  metaTemplateId: string;
  category?: string | null;
  language?: string | null;
  bodyText?: string | null;
  bodyExamples?: string[];
  quickReplyButtons?: string[];
  quickReplyActions?: Record<string, string>;
  urlButton?: WhatsAppTemplateUrlButton | null;
};

export type WhatsAppTemplateCreatedResult = {
  name: string;
  status: string;
  bodyText: string;
  quickReplyButtons: string[];
  quickReplyActions: Record<string, string>;
  urlButton?: WhatsAppTemplateUrlButton | null;
};

type TemplateMutationResponse = {
  ok?: boolean;
  name?: string;
  status?: string;
  urlButton?: WhatsAppTemplateUrlButton | null;
};

type Props = {
  agentId: string;
  compact?: boolean;
  defaultTemplateName?: string;
  defaultBodyText?: string;
  editingTemplate?: WhatsAppTemplateEditValue | null;
  onCreated?: (
    result:
      WhatsAppTemplateCreatedResult
  ) => void;
  onUpdated?: (
    result:
      WhatsAppTemplateCreatedResult
  ) => void;
  onCancelEdit?: () => void;
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

function normalizeHttpUrl(
  value: string
): string {
  const trimmed =
    value.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const parsed =
      new URL(
        trimmed
      );

    if (
      parsed.protocol !==
        "https:" &&
      parsed.protocol !==
        "http:"
    ) {
      return "";
    }

    return parsed.toString();
  } catch {
    return "";
  }
}

export default function WhatsAppTemplateBuilder({
  agentId,
  compact = false,
  defaultTemplateName = "",
  defaultBodyText = "",
  editingTemplate = null,
  onCreated,
  onUpdated,
  onCancelEdit,
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
    urlButtonText,
    setUrlButtonText,
  ] =
    useState("");

  const [
    urlButtonUrl,
    setUrlButtonUrl,
  ] =
    useState("");

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

  const isEditing =
    Boolean(
      editingTemplate?.metaTemplateId
    );

  useEffect(() => {
    if (!editingTemplate) return;

    const buttons = Array.isArray(editingTemplate.quickReplyButtons)
      ? editingTemplate.quickReplyButtons
      : [];
    const actions = editingTemplate.quickReplyActions || {};

    setTemplateName(editingTemplate.name);
    setCategory(String(editingTemplate.category || "UTILITY"));
    setLanguage(String(editingTemplate.language || "he"));
    setBodyText(String(editingTemplate.bodyText || ""));
    setExampleValue(String(editingTemplate.bodyExamples?.[0] || ""));
    setQuickReply1(String(buttons[0] || ""));
    setQuickReply1Action(buttons[0] ? String(actions[buttons[0]] || "other") : "interested");
    setQuickReply2(String(buttons[1] || ""));
    setQuickReply2Action(buttons[1] ? String(actions[buttons[1]] || "other") : "declined");
    setUrlButtonText(String(editingTemplate.urlButton?.text || ""));
    setUrlButtonUrl(String(editingTemplate.urlButton?.url || ""));
  }, [editingTemplate]);

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
        isEditing
          ? templateName.trim()
          : normalizeTemplateName(
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
        !isEditing &&
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

      const normalizedUrlButtonText =
        urlButtonText.trim();

      const normalizedUrlButtonUrl =
        normalizeHttpUrl(
          urlButtonUrl
        );

      if (
        (
          normalizedUrlButtonText &&
          !urlButtonUrl.trim()
        ) ||
        (
          !normalizedUrlButtonText &&
          urlButtonUrl.trim()
        )
      ) {
        showToast({
          type:
            "warning",

          title:
            "כפתור קישור לא שלם",

          message:
            "כדי להוסיף כפתור קישור יש להזין גם טקסט לכפתור וגם כתובת URL.",
        });

        return;
      }

      if (
        urlButtonUrl.trim() &&
        !normalizedUrlButtonUrl
      ) {
        showToast({
          type:
            "warning",

          title:
            "כתובת קישור לא תקינה",

          message:
            "יש להזין כתובת מלאה שמתחילה ב-http:// או https://.",
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

      const urlButton:
        WhatsAppTemplateUrlButton | null =
          normalizedUrlButtonText &&
          normalizedUrlButtonUrl
            ? {
                text:
                  normalizedUrlButtonText,

                url:
                  normalizedUrlButtonUrl,
              }
            : null;

      setIsCreating(
        true
      );

      try {
        const functionName =
          isEditing
            ? "updateWhatsAppTemplate"
            : "createWhatsAppTemplate";

        const fn =
          httpsCallable<
            {
              agentId:
                string;
              name:
                string;
              metaTemplateId?:
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
              urlButton:
                WhatsAppTemplateUrlButton | null;
            },
            TemplateMutationResponse
          >(
            functions,
            functionName
          );

        const response =
          await fn({
            agentId,

            name:
              normalizedName,

            metaTemplateId:
              editingTemplate?.metaTemplateId,

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

            urlButton,
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

            urlButton:
              response.data
                ?.urlButton ??
              urlButton,
          };

        showToast({
          type:
            "success",

          title:
            isEditing
              ? "התבנית עודכנה"
              : "התבנית נשלחה ל־Meta",

          message:
            isEditing
              ? `התבנית ${result.name} עודכנה מול Meta.`
              : `התבנית ${result.name} נוצרה בסטטוס ${result.status}.`,
        });

        if (isEditing) {
          onUpdated?.(result);
        } else {
          onCreated?.(result);
        }
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
            isEditing
              ? "עדכון התבנית נכשל"
              : "יצירת התבנית נכשלה",

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
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                {isEditing ? "עריכת תבנית" : "יצירת תבנית חדשה"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {isEditing
                  ? "השינויים יישלחו ל־Meta וייתכן שיעברו בדיקה מחדש."
                  : "התבנית תישלח לאישור Meta לפני שניתן יהיה להשתמש בה."}
              </p>
            </div>
            {isEditing ? (
              <button
                type="button"
                onClick={onCancelEdit}
                className="rounded-lg border px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                ביטול עריכה
              </button>
            ) : null}
          </div>

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
                onBlur={() => {
                  if (!isEditing) {
                    setTemplateName(
                      normalizeTemplateName(
                        templateName
                      )
                    );
                  }
                }}
                disabled={isEditing}
                placeholder="first_outbound_flow"
                className="w-full rounded-lg border px-3 py-2.5 font-mono outline-none focus:border-blue-500 disabled:bg-slate-100"
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

            <section className="rounded-xl border p-4">
              <div>
                <h3 className="font-bold text-slate-900">
                  כפתור קישור
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  אופציונלי. הכפתור יפתח כתובת אינטרנט ישירות מתוך הודעת ה־WhatsApp.
                </p>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">
                    טקסט לכפתור
                  </label>

                  <input
                    type="text"
                    value={
                      urlButtonText
                    }
                    onChange={(
                      event
                    ) =>
                      setUrlButtonText(
                        event.target.value
                      )
                    }
                    placeholder="לפרטים נוספים"
                    className="w-full rounded-lg border px-3 py-2.5"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">
                    כתובת URL
                  </label>

                  <input
                    type="url"
                    value={
                      urlButtonUrl
                    }
                    onChange={(
                      event
                    ) =>
                      setUrlButtonUrl(
                        event.target.value
                      )
                    }
                    placeholder="https://magicsale.co.il/landing"
                    className="w-full rounded-lg border px-3 py-2.5"
                    dir="ltr"
                  />
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
                ? (isEditing ? "מעדכן תבנית..." : "יוצר תבנית...")
                : (isEditing ? "שמירת שינויים ב־Meta" : "שליחת התבנית לאישור Meta")}
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
                quickReply2 ||
                urlButtonText ? (
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

                    {urlButtonText ? (
                      <div className="py-2 text-center text-sm font-semibold text-blue-600">
                        🔗 {urlButtonText}
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
