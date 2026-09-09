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

export type WhatsAppTemplateVariable1Source =
  | "first_name"
  | "full_name";

export type WhatsAppTemplateUrlButton = {
  text: string;
  url: string;
};

export type WhatsAppTemplateHeaderMedia = {
  type:
    | "DOCUMENT"
    | "IMAGE"
    | "VIDEO";

  handle: string;

  storagePath?: string;

  fileName: string;

  mimeType: string;

  size: number;
};

export type WhatsAppTemplateEditValue = {
  name: string;

  metaTemplateId: string;

  category?: string | null;

  language?: string | null;

  bodyText?: string | null;

  bodyExamples?: string[];

  /*
   * קובע איזה ערך ייכנס ל-{{1}}.
   *
   * תבניות ישנות שלא מכילות את השדה
   * ממשיכות להתנהג כמו בעבר:
   * first_name.
   */
  bodyVariable1Source?:
    WhatsAppTemplateVariable1Source |
    null;

  quickReplyButtons?: string[];

  quickReplyActions?:
    Record<string, string>;

  urlButton?:
    WhatsAppTemplateUrlButton |
    null;

  headerMedia?:
    WhatsAppTemplateHeaderMedia |
    null;
};

export type WhatsAppTemplateCreatedResult = {
  name: string;

  status: string;

  bodyText: string;

  bodyVariable1Source:
    WhatsAppTemplateVariable1Source;

  quickReplyButtons: string[];

  quickReplyActions:
    Record<string, string>;

  urlButton?:
    WhatsAppTemplateUrlButton |
    null;

  headerMedia?:
    WhatsAppTemplateHeaderMedia |
    null;
};

type TemplateMutationResponse = {
  ok?: boolean;

  name?: string;

  status?: string;

  bodyVariable1Source?:
    WhatsAppTemplateVariable1Source;

  urlButton?:
    WhatsAppTemplateUrlButton |
    null;

  headerMedia?:
    WhatsAppTemplateHeaderMedia |
    null;
};

type UploadTemplateMediaResponse = {
  ok?: boolean;

  agentId?: string;

  mediaType?:
    | "DOCUMENT"
    | "IMAGE"
    | "VIDEO";

  handle?: string;

  storagePath?: string;

  fileName?: string;

  mimeType?: string;

  size?: number;
};

type Props = {
  agentId: string;

  compact?: boolean;

  defaultTemplateName?: string;

  defaultBodyText?: string;

  editingTemplate?:
    WhatsAppTemplateEditValue |
    null;

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
          (
            match
          ) =>
            Number(
              match[1]
            )
        )
        .filter(
          (
            number
          ) =>
            Number.isInteger(
              number
            ) &&
            number > 0
        )
    )
  ).sort(
    (
      first,
      second
    ) =>
      first - second
  );
}

function normalizeTemplateName(
  value: string
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(
      /\s+/g,
      "_"
    )
    .replace(
      /[^a-z0-9_]/g,
      ""
    );
}

function normalizeVariable1Source(
  value: unknown
): WhatsAppTemplateVariable1Source {
  return value ===
    "full_name"
    ? "full_name"
    : "first_name";
}

function replaceTemplatePreview(
  bodyText: string,
  exampleValue: string
): string {
  return String(
    bodyText ||
    ""
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

  if (
    !trimmed
  ) {
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

function fileToBase64(
  file: File
): Promise<string> {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      const reader =
        new FileReader();

      reader.onload =
        () => {
          const result =
            String(
              reader.result ||
              ""
            );

          const commaIndex =
            result.indexOf(
              ","
            );

          resolve(
            commaIndex >= 0
              ? result.slice(
                  commaIndex +
                    1
                )
              : result
          );
        };

      reader.onerror =
        () => {
          reject(
            new Error(
              "לא ניתן היה לקרוא את הקובץ."
            )
          );
        };

      reader.readAsDataURL(
        file
      );
    }
  );
}

function formatFileSize(
  size: number
): string {
  if (
    size <
    1024
  ) {
    return `${size} B`;
  }

  if (
    size <
    1024 *
      1024
  ) {
    return `${(
      size /
      1024
    ).toFixed(
      1
    )} KB`;
  }

  return `${(
    size /
    (
      1024 *
      1024
    )
  ).toFixed(
    1
  )} MB`;
}

function getMediaLabel(
  mimeType: string
): string {
  if (
    mimeType ===
    "application/pdf"
  ) {
    return "PDF";
  }

  if (
    mimeType ===
    "video/mp4"
  ) {
    return "VIDEO";
  }

  if (
    mimeType ===
      "image/jpeg" ||
    mimeType ===
      "image/png"
  ) {
    return "IMAGE";
  }

  return "MEDIA";
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
    useState(
      "UTILITY"
    );

  const [
    language,
    setLanguage,
  ] =
    useState(
      "he"
    );

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
    useState(
      ""
    );

  const [
    bodyVariable1Source,
    setBodyVariable1Source,
  ] =
    useState<WhatsAppTemplateVariable1Source>(
      "first_name"
    );

  const [
    quickReply1,
    setQuickReply1,
  ] =
    useState(
      ""
    );

  const [
    quickReply1Action,
    setQuickReply1Action,
  ] =
    useState(
      "interested"
    );

  const [
    quickReply2,
    setQuickReply2,
  ] =
    useState(
      ""
    );

  const [
    quickReply2Action,
    setQuickReply2Action,
  ] =
    useState(
      "declined"
    );

  const [
    urlButtonText,
    setUrlButtonText,
  ] =
    useState(
      ""
    );

  const [
    urlButtonUrl,
    setUrlButtonUrl,
  ] =
    useState(
      ""
    );

  const [
    mediaFile,
    setMediaFile,
  ] =
    useState<File | null>(
      null
    );

  const [
    mediaPreviewUrl,
    setMediaPreviewUrl,
  ] =
    useState(
      ""
    );

  const [
    existingHeaderMedia,
    setExistingHeaderMedia,
  ] =
    useState<
      WhatsAppTemplateHeaderMedia |
      null
    >(
      null
    );

  const [
    isCreating,
    setIsCreating,
  ] =
    useState(
      false
    );

  const [
    toast,
    setToast,
  ] =
    useState<ToastState | null>(
      null
    );

  const isEditing =
    Boolean(
      editingTemplate
        ?.metaTemplateId
    );

  useEffect(() => {
    if (
      !editingTemplate
    ) {
      return;
    }

    const buttons =
      Array.isArray(
        editingTemplate
          .quickReplyButtons
      )
        ? editingTemplate
            .quickReplyButtons
        : [];

    const actions =
      editingTemplate
        .quickReplyActions ||
      {};

    setTemplateName(
      editingTemplate.name
    );

    setCategory(
      String(
        editingTemplate
          .category ||
        "UTILITY"
      )
    );

    setLanguage(
      String(
        editingTemplate
          .language ||
        "he"
      )
    );

    setBodyText(
      String(
        editingTemplate
          .bodyText ||
        ""
      )
    );

    setExampleValue(
      String(
        editingTemplate
          .bodyExamples?.[0] ||
        ""
      )
    );

    /*
     * חשוב:
     * תבניות קיימות שנוצרו לפני היכולת החדשה
     * לא כוללות bodyVariable1Source.
     *
     * עבורן ברירת המחדל נשארת first_name,
     * בדיוק כמו ההתנהגות הקיימת היום.
     */
    setBodyVariable1Source(
      normalizeVariable1Source(
        editingTemplate
          .bodyVariable1Source
      )
    );

    setQuickReply1(
      String(
        buttons[0] ||
        ""
      )
    );

    setQuickReply1Action(
      buttons[0]
        ? String(
            actions[
              buttons[0]
            ] ||
            "other"
          )
        : "interested"
    );

    setQuickReply2(
      String(
        buttons[1] ||
        ""
      )
    );

    setQuickReply2Action(
      buttons[1]
        ? String(
            actions[
              buttons[1]
            ] ||
            "other"
          )
        : "declined"
    );

    setUrlButtonText(
      String(
        editingTemplate
          .urlButton
          ?.text ||
        ""
      )
    );

    setUrlButtonUrl(
      String(
        editingTemplate
          .urlButton
          ?.url ||
        ""
      )
    );

    setExistingHeaderMedia(
      editingTemplate
        .headerMedia ||
      null
    );

    setMediaFile(
      null
    );
  }, [
    editingTemplate,
  ]);

  useEffect(() => {
    if (
      !mediaFile
    ) {
      setMediaPreviewUrl(
        ""
      );

      return;
    }

    if (
      mediaFile.type !==
        "video/mp4" &&
      mediaFile.type !==
        "image/jpeg" &&
      mediaFile.type !==
        "image/png"
    ) {
      setMediaPreviewUrl(
        ""
      );

      return;
    }

    const objectUrl =
      URL.createObjectURL(
        mediaFile
      );

    setMediaPreviewUrl(
      objectUrl
    );

    return () => {
      URL.revokeObjectURL(
        objectUrl
      );
    };
  }, [
    mediaFile,
  ]);

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
            (
              bodyVariable1Source ===
              "full_name"
                ? "כהן סוכנות לביטוח"
                : "ישראל"
            )
        ),
      [
        bodyText,
        exampleValue,
        bodyVariable1Source,
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

  const handleMediaFileChange =
    (
      file:
        File |
        null
    ) => {
      if (
        !file
      ) {
        setMediaFile(
          null
        );

        return;
      }

      const allowedMimeTypes =
        [
          "application/pdf",
          "image/jpeg",
          "image/png",
          "video/mp4",
        ];

      if (
        !allowedMimeTypes.includes(
          file.type
        )
      ) {
        showToast({
          type:
            "warning",

          title:
            "סוג קובץ לא נתמך",

          message:
            "ניתן להעלות PDF, JPG, PNG או וידאו MP4.",
        });

        return;
      }

      let maxSize =
        5 *
        1024 *
        1024;

      if (
        file.type ===
        "application/pdf"
      ) {
        maxSize =
          10 *
          1024 *
          1024;
      }

      if (
        file.type ===
        "video/mp4"
      ) {
        maxSize =
          16 *
          1024 *
          1024;
      }

      if (
        file.size >
        maxSize
      ) {
        let message =
          "בשלב זה ניתן להעלות תמונה עד 5MB.";

        if (
          file.type ===
          "application/pdf"
        ) {
          message =
            "בשלב זה ניתן להעלות PDF עד 10MB.";
        }

        if (
          file.type ===
          "video/mp4"
        ) {
          message =
            "בשלב זה ניתן להעלות וידאו MP4 עד 16MB.";
        }

        showToast({
          type:
            "warning",

          title:
            "הקובץ גדול מדי",

          message,
        });

        return;
      }

      setMediaFile(
        file
      );
    };

  const uploadHeaderMedia =
    async (): Promise<
      WhatsAppTemplateHeaderMedia |
      null
    > => {
      if (
        !mediaFile
      ) {
        return existingHeaderMedia;
      }

      const base64Data =
        await fileToBase64(
          mediaFile
        );

      const uploadFn =
        httpsCallable<
          {
            agentId: string;
            fileName: string;
            mimeType: string;
            base64Data: string;
          },
          UploadTemplateMediaResponse
        >(
          functions,
          "uploadWhatsAppTemplateMedia"
        );

      const response =
        await uploadFn({
          agentId,

          fileName:
            mediaFile.name,

          mimeType:
            mediaFile.type,

          base64Data,
        });

      console.log(
        "[WhatsAppTemplateBuilder] upload response",
        response.data
      );

      const handle =
        String(
          response.data
            ?.handle ||
          ""
        ).trim();

      const storagePath =
        String(
          response.data
            ?.storagePath ||
          ""
        ).trim();

      const mediaType =
        response.data
          ?.mediaType;

      if (
        !handle ||
        (
          mediaType !==
            "DOCUMENT" &&
          mediaType !==
            "IMAGE" &&
          mediaType !==
            "VIDEO"
        )
      ) {
        throw new Error(
          "Meta לא החזירה מזהה תקין לקובץ."
        );
      }

      if (
        !storagePath
      ) {
        console.error(
          "[WhatsAppTemplateBuilder] Missing storagePath",
          response.data
        );

        throw new Error(
          "הקובץ הועלה אבל השרת לא החזיר storagePath."
        );
      }

      return {
        type:
          mediaType,

        handle,

        storagePath,

        fileName:
          response.data
            ?.fileName ||
          mediaFile.name,

        mimeType:
          response.data
            ?.mimeType ||
          mediaFile.type,

        size:
          Number(
            response.data
              ?.size ||
            mediaFile.size
          ),
      };
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
            bodyVariable1Source ===
            "full_name"
              ? "התבנית כוללת את {{1}}. יש להזין דוגמה לשם מלא, למשל: כהן סוכנות לביטוח."
              : "התבנית כוללת את {{1}}. יש להזין דוגמה לשם פרטי, למשל: ישראל.",
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

      if (
        isEditing &&
        existingHeaderMedia &&
        !String(
          existingHeaderMedia
            .storagePath ||
          ""
        ).trim() &&
        !mediaFile
      ) {
        showToast({
          type:
            "warning",

          title:
            "יש להעלות מחדש את הקובץ",

          message:
            "התבנית נוצרה לפני שהוספנו שמירה קבועה של קבצים. כדי לעדכן אותה יש לבחור מחדש את ה-PDF, התמונה או הווידאו המצורפים.",
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
        Record<string, string> =
        {};

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
        WhatsAppTemplateUrlButton |
        null =
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
        /*
         * בעריכת תבנית קיימת, אם לא נבחר קובץ חדש:
         * לא שולחים ל-Backend את ה-handle הישן של Meta.
         *
         * ה-Backend ישמור את המדיה הקיימת מתוך Firestore,
         * אבל לא ישלח את ה-handle הישן שוב ל-Meta.
         *
         * אם נבחר קובץ חדש - מעלים אותו ומעבירים handle חדש.
         */
        let headerMedia:
          WhatsAppTemplateHeaderMedia |
          null =
            isEditing
              ? null
              : existingHeaderMedia;

        if (
          mediaFile
        ) {
          headerMedia =
            await uploadHeaderMedia();
        }

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

              bodyVariable1Source:
                WhatsAppTemplateVariable1Source;

              quickReplyButtons:
                string[];

              quickReplyActions:
                Record<
                  string,
                  string
                >;

              urlButton:
                WhatsAppTemplateUrlButton |
                null;

              headerMedia:
                WhatsAppTemplateHeaderMedia |
                null;
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
              editingTemplate
                ?.metaTemplateId,

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

            bodyVariable1Source,

            quickReplyButtons,

            quickReplyActions,

            urlButton,

            headerMedia,
          });

        const result:
          WhatsAppTemplateCreatedResult =
          {
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

            bodyVariable1Source:
              normalizeVariable1Source(
                response.data
                  ?.bodyVariable1Source ||
                bodyVariable1Source
              ),

            quickReplyButtons,

            quickReplyActions,

            urlButton:
              response.data
                ?.urlButton ??
              urlButton,

            headerMedia:
              response.data
                ?.headerMedia ??
              headerMedia ??
              existingHeaderMedia,
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

        if (
          isEditing
        ) {
          onUpdated?.(
            result
          );
        } else {
          onCreated?.(
            result
          );
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
        ].join(
          " "
        )}
      >
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                {isEditing
                  ? "עריכת תבנית"
                  : "יצירת תבנית חדשה"}
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
                onClick={
                  onCancelEdit
                }
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
                    event.target
                      .value
                  )
                }
                onBlur={() => {
                  if (
                    !isEditing
                  ) {
                    setTemplateName(
                      normalizeTemplateName(
                        templateName
                      )
                    );
                  }
                }}
                disabled={
                  isEditing
                }
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
                        event.target
                          .value
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
                        event.target
                          .value
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
                    event.target
                      .value
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
                ניתן לשלב את שם הלקוח באמצעות{" "}
                <span className="font-mono font-bold">
                  {"{{1}}"}
                </span>
                .
              </div>
            </div>

            {hasFirstVariable ? (
              <div className="space-y-4 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">
                    איזה שם ייכנס ל־{"{{1}}"}?
                  </label>

                  <select
                    value={
                      bodyVariable1Source
                    }
                    onChange={(
                      event
                    ) =>
                      setBodyVariable1Source(
                        normalizeVariable1Source(
                          event.target
                            .value
                        )
                      )
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5"
                  >
                    <option value="first_name">
                      שם פרטי בלבד
                    </option>

                    <option value="full_name">
                      שם מלא
                    </option>
                  </select>

                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    {bodyVariable1Source ===
                    "full_name"
                      ? "בשליחה ייכנס כל הערך השמור ב־fullName. מתאים גם לשמות של סוכנויות ועסקים."
                      : "בשליחה ייכנס השם הפרטי בלבד. זו ההתנהגות הקיימת של התבניות היום."}
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">
                    דוגמה למשתנה{" "}
                    {"{{1}}"} *
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
                        event.target
                          .value
                      )
                    }
                    placeholder={
                      bodyVariable1Source ===
                      "full_name"
                        ? "כהן סוכנות לביטוח"
                        : "ישראל"
                    }
                    className="w-full rounded-lg border px-3 py-2.5"
                  />

                  <p className="mt-1 text-xs text-slate-500">
                    הדוגמה נשלחת ל־Meta לצורך אישור התבנית בלבד.
                  </p>
                </div>
              </div>
            ) : null}

            <section className="rounded-xl border p-4">
              <div>
                <h3 className="font-bold text-slate-900">
                  מדיה לתבנית
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  אופציונלי. ניתן לצרף PDF, תמונה או וידאו MP4 שיופיעו בראש הודעת ה־WhatsApp.
                </p>
              </div>

              <div className="mt-4">
                <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.mp4,application/pdf,image/jpeg,image/png,video/mp4"
                    className="hidden"
                    onChange={(
                      event
                    ) =>
                      handleMediaFileChange(
                        event.target
                          .files?.[0] ||
                        null
                      )
                    }
                  />

                  {mediaFile
                    ? "החלפת מדיה שנבחרה"
                    : existingHeaderMedia
                      ? "החלפת המדיה המצורפת"
                      : "בחירת PDF, תמונה או וידאו"}
                </label>

                <div className="mt-2 text-xs text-slate-500">
                  תמונה עד 5MB · PDF עד 10MB · וידאו MP4 עד 16MB
                </div>

                {mediaFile ? (
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border bg-white p-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-800">
                        {
                          mediaFile.name
                        }
                      </div>

                      <div className="mt-1 text-xs text-slate-500">
                        קובץ חדש ·{" "}
                        {getMediaLabel(
                          mediaFile.type
                        )}{" "}
                        ·{" "}
                        {formatFileSize(
                          mediaFile.size
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setMediaFile(
                          null
                        )
                      }
                      className="shrink-0 rounded-lg border px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                    >
                      ביטול בחירה
                    </button>
                  </div>
                ) : existingHeaderMedia ? (
                  <div className="mt-3 rounded-lg border bg-white p-3">
                    <div className="text-sm font-semibold text-slate-800">
                      {
                        existingHeaderMedia
                          .fileName
                      }
                    </div>

                    <div className="mt-1 text-xs text-slate-500">
                      מדיה קיימת ·{" "}
                      {
                        existingHeaderMedia
                          .type
                      }{" "}
                      ·{" "}
                      {formatFileSize(
                        existingHeaderMedia
                          .size
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

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
                        event.target
                          .value
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
                        event.target
                          .value
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
                        event.target
                          .value
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
                        event.target
                          .value
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
                        event.target
                          .value
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
                        event.target
                          .value
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
                ? (
                    isEditing
                      ? "מעדכן תבנית..."
                      : mediaFile
                        ? mediaFile.type ===
                          "video/mp4"
                          ? "מעלה וידאו ויוצר תבנית..."
                          : "מעלה קובץ ויוצר תבנית..."
                        : "יוצר תבנית..."
                  )
                : (
                    isEditing
                      ? "שמירת שינויים ב־Meta"
                      : "שליחת התבנית לאישור Meta"
                  )}
            </button>
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="font-bold text-slate-900">
              תצוגה מקדימה
            </h2>

            <div className="mt-4 rounded-2xl bg-[#efeae2] p-4">
              <div className="overflow-hidden rounded-xl bg-white shadow-sm">
                {mediaFile &&
                mediaFile.type ===
                  "video/mp4" &&
                mediaPreviewUrl ? (
                  <div className="bg-black">
                    <video
                      src={
                        mediaPreviewUrl
                      }
                      controls
                      playsInline
                      preload="metadata"
                      className="max-h-[320px] w-full object-contain"
                    >
                      הדפדפן אינו תומך בתצוגת וידאו.
                    </video>
                  </div>
                ) : mediaFile &&
                  (
                    mediaFile.type ===
                      "image/jpeg" ||
                    mediaFile.type ===
                      "image/png"
                  ) &&
                  mediaPreviewUrl ? (
                  <div className="bg-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={
                        mediaPreviewUrl
                      }
                      alt="תצוגה מקדימה של המדיה"
                      className="max-h-[320px] w-full object-contain"
                    />
                  </div>
                ) : mediaFile ? (
                  <div className="border-b bg-slate-50 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {getMediaLabel(
                        mediaFile.type
                      )}
                    </div>

                    <div className="mt-1 truncate text-sm font-semibold text-slate-700">
                      {
                        mediaFile.name
                      }
                    </div>
                  </div>
                ) : existingHeaderMedia ? (
                  <div className="border-b bg-slate-50 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {
                        existingHeaderMedia
                          .type
                      }
                    </div>

                    <div className="mt-1 truncate text-sm font-semibold text-slate-700">
                      {
                        existingHeaderMedia
                          .fileName
                      }
                    </div>

                    {existingHeaderMedia.type ===
                    "VIDEO" ? (
                      <div className="mt-1 text-xs text-slate-500">
                        וידאו קיים בתבנית
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="p-4">
                  <div className="whitespace-pre-wrap text-sm text-slate-800">
                    {previewText ||
                      "תוכן התבנית יוצג כאן."}
                  </div>

                  {hasFirstVariable ? (
                    <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                      {"{{1}}"} יישלח כ־
                      <strong className="mr-1 text-slate-700">
                        {bodyVariable1Source ===
                        "full_name"
                          ? "שם מלא"
                          : "שם פרטי"}
                      </strong>
                    </div>
                  ) : null}

                  {quickReply1 ||
                  quickReply2 ||
                  urlButtonText ? (
                    <div className="mt-4 divide-y border-t">
                      {quickReply1 ? (
                        <div className="py-2 text-center text-sm font-semibold text-blue-600">
                          {
                            quickReply1
                          }
                        </div>
                      ) : null}

                      {quickReply2 ? (
                        <div className="py-2 text-center text-sm font-semibold text-blue-600">
                          {
                            quickReply2
                          }
                        </div>
                      ) : null}

                      {urlButtonText ? (
                        <div className="py-2 text-center text-sm font-semibold text-blue-600">
                          🔗{" "}
                          {
                            urlButtonText
                          }
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
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