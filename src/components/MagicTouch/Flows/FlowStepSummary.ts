import type {
  FlowBranch,
  FlowStep,
} from "@/lib/MagicTouch/flows/types";

const FIELD_LABELS:
  Record<string, string> = {
    "engagement.reengagement.interestStatus":
      "סטטוס התעניינות",
    "engagement.reengagement.status":
      "סטטוס חידוש קשר",
    "engagement.reengagement.bookingStatus":
      "סטטוס פגישה",
    "engagement.reengagement.bookingLink":
      "קישור לפגישה",
    "engagement.reengagement.bookingLinkSentAt":
      "מועד שליחת קישור",
    "engagement.reengagement.surenseSyncStatus":
      "סטטוס סנכרון לשורנס",
    "engagement.reengagement.lastFlowRunId":
      "מזהה הרצה",
    "engagement.reengagement.updatedAt":
      "מועד עדכון אחרון",
  };

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

function getBranches(
  step: FlowStep
): FlowBranch[] {
  const raw =
    step.config
      ?.branches;

  if (
    !Array.isArray(
      raw
    )
  ) {
    return [];
  }

  return raw.map(
    (
      branch: any,
      index
    ) => ({
      id:
        s(
          branch?.id
        ) ||
        `branch_${index + 1}`,

      value:
        s(
          branch?.value
        ),

      label:
        s(
          branch?.label
        ) ||
        s(
          branch?.value
        ),

      nextStepId:
        s(
          branch
            ?.nextStepId
        ) ||
        null,
    })
  );
}

export function getStepTypeLabel(
  step: FlowStep
): string {
  switch (
    step.type
  ) {
    case "request_documents":
      return "בקשת צילום תעודת זהות";

    case "send_whatsapp":
      return "שליחת WhatsApp";

    case "wait_for_customer_response":
      return "המתנה לתשובת לקוח";

    case "send_booking_link":
      return "שליחת קישור לפגישת Bookings";

    case "send_google_booking_link":
      return "שליחת קישור לפגישה ב־Google Calendar";

    case "update_contact":
      return "עדכון איש קשר";

    case "add_timeline_event":
      return "הוספה לציר הזמן";

    case "sync_surense_activity":
      return "עדכון פעילות בשורנס";

    case "create_surense_power_of_attorney":
      return "יצירת קישור ייפוי כוח";

    case "condition":
      return "ניתוב לפי תשובה / ערך";

    case "end":
      return "סיום";

    default:
      return s(
        step.type
      ) ||
      "שלב";
  }
}

export function getStepIcon(
  step: FlowStep
): string {
  switch (
    step.type
  ) {
    case "request_documents":
      return "🪪";

    case "send_whatsapp":
      return "💬";

    case "wait_for_customer_response":
      return "⏳";

    case "send_booking_link":
      return "📅";

    case "send_google_booking_link":
      return "🗓️";

    case "update_contact":
      return "👤";

    case "add_timeline_event":
      return "📝";

    case "sync_surense_activity":
      return "🔄";

    case "create_surense_power_of_attorney":
      return "✍️";

    case "condition":
      return "🔀";

    case "end":
      return "✓";

    default:
      return "⚙️";
  }
}

export function getStepAccent(
  step: FlowStep
): {
  ring: string;
  icon: string;
  badge: string;
  connector: string;
} {
  switch (
    step.type
  ) {
    case "request_documents":
      return {
        ring:
          "border-cyan-200 hover:border-cyan-400",
        icon:
          "bg-cyan-100 text-cyan-800",
        badge:
          "bg-cyan-50 text-cyan-700",
        connector:
          "bg-cyan-300",
      };

    case "send_whatsapp":
      return {
        ring:
          "border-emerald-200 hover:border-emerald-400",
        icon:
          "bg-emerald-100 text-emerald-800",
        badge:
          "bg-emerald-50 text-emerald-700",
        connector:
          "bg-emerald-300",
      };

    case "wait_for_customer_response":
      return {
        ring:
          "border-orange-200 hover:border-orange-400",
        icon:
          "bg-orange-100 text-orange-800",
        badge:
          "bg-orange-50 text-orange-700",
        connector:
          "bg-orange-300",
      };

    case "send_booking_link":
      return {
        ring:
          "border-blue-200 hover:border-blue-400",
        icon:
          "bg-blue-100 text-blue-800",
        badge:
          "bg-blue-50 text-blue-700",
        connector:
          "bg-blue-300",
      };

    case "send_google_booking_link":
      return {
        ring:
          "border-emerald-200 hover:border-emerald-400",
        icon:
          "bg-emerald-100 text-emerald-800",
        badge:
          "bg-emerald-50 text-emerald-700",
        connector:
          "bg-emerald-300",
      };

    case "update_contact":
      return {
        ring:
          "border-violet-200 hover:border-violet-400",
        icon:
          "bg-violet-100 text-violet-800",
        badge:
          "bg-violet-50 text-violet-700",
        connector:
          "bg-violet-300",
      };

    case "add_timeline_event":
      return {
        ring:
          "border-amber-200 hover:border-amber-400",
        icon:
          "bg-amber-100 text-amber-800",
        badge:
          "bg-amber-50 text-amber-700",
        connector:
          "bg-amber-300",
      };

    case "sync_surense_activity":
      return {
        ring:
          "border-sky-200 hover:border-sky-400",
        icon:
          "bg-sky-100 text-sky-800",
        badge:
          "bg-sky-50 text-sky-700",
        connector:
          "bg-sky-300",
      };

    case "create_surense_power_of_attorney":
      return {
        ring:
          "border-indigo-200 hover:border-indigo-400",
        icon:
          "bg-indigo-100 text-indigo-800",
        badge:
          "bg-indigo-50 text-indigo-700",
        connector:
          "bg-indigo-300",
      };

    case "condition":
      return {
        ring:
          "border-fuchsia-200 hover:border-fuchsia-400",
        icon:
          "bg-fuchsia-100 text-fuchsia-800",
        badge:
          "bg-fuchsia-50 text-fuchsia-700",
        connector:
          "bg-fuchsia-300",
      };

    case "end":
      return {
        ring:
          "border-slate-300 hover:border-slate-500",
        icon:
          "bg-slate-900 text-white",
        badge:
          "bg-slate-100 text-slate-700",
        connector:
          "bg-slate-300",
      };

    default:
      return {
        ring:
          "border-slate-200 hover:border-slate-400",
        icon:
          "bg-slate-100 text-slate-700",
        badge:
          "bg-slate-100 text-slate-700",
        connector:
          "bg-slate-300",
      };
  }
}

export function getStepSummary(
  step: FlowStep
): string[] {
  switch (
    step.type
  ) {
    case "request_documents":
      return [
        "צילום תעודת זהות - צד קדמי ואחורי",
        "המשך אוטומטי לאחר השלמת ההעלאה",
      ];

    case "wait_for_customer_response": {
      const options =
        Array.isArray(
          step.config
            ?.responseOptions
        )
          ? step.config
              .responseOptions as any[]
          : [];

      const question =
        s(
          (
            step.config
              ?.promptContext as
              Record<string, unknown> |
              undefined
          )?.question
        );

      return [
        question ||
          "ממתין לתשובת הלקוח",
        options.length >
        0
          ? `${options.length} תשובות עסקיות אפשריות`
          : "לא הוגדרו תשובות עסקיות",
      ];
    }

    case "update_contact": {
      const updates =
        step.config?.updates &&
        typeof step.config.updates ===
          "object" &&
        !Array.isArray(
          step.config.updates
        )
          ? (
            step.config
              .updates as
              Record<
                string,
                unknown
              >
          )
          : {};

      const fields =
        Object.keys(
          updates
        );

      if (
        fields.length ===
        0
      ) {
        return [
          "לא נבחרו שדות לעדכון",
        ];
      }

      return [
        `${fields.length} שדות יתעדכנו`,
        ...fields
          .slice(
            0,
            3
          )
          .map(
            (
              path
            ) =>
              FIELD_LABELS[
                path
              ] ||
              path
          ),
      ];
    }

    case "add_timeline_event":
      return [
        s(
          step.config
            ?.title
        ) ||
        "ללא כותרת",
        s(
          step.config
            ?.description
        ) ||
        "ללא תיאור",
      ];

    case "send_whatsapp": {
      const message =
        s(
          step.config
            ?.message
        );

      const mode =
        s(
          step.config
            ?.mode
        );

      const buttons =
        Array.isArray(
          step.config
            ?.buttons
        )
          ? step.config
              ?.buttons as any[]
          : [];

      return [
        mode ===
        "interactive_buttons"
          ? `הודעה עם ${buttons.length} כפתורי תשובה`
          : "הודעת טקסט",
        message
          ? message.length >
            90
            ? `${message.slice(
              0,
              90
            )}…`
            : message
          : "תוכן ההודעה עדיין ריק",
        ...(
          mode ===
          "interactive_buttons"
            ? buttons
                .slice(
                  0,
                  3
                )
                .map(
                  (
                    button: any
                  ) =>
                    `${s(button?.title) || "כפתור"} → ${s(button?.id) || "ללא Action"}`
                )
            : []
        ),
      ];
    }

    case "send_booking_link":
      return [
        "פגישת ברירת המחדל של Microsoft Bookings",
        s(
          step.config
            ?.messageBefore
        ) ||
        "ללא מלל לפני הקישור",
      ];

    case "send_google_booking_link":
      return [
        "קישור ברירת המחדל של Google Calendar",
        s(
          step.config
            ?.messageBefore
        ) ||
        "ללא מלל לפני הקישור",
      ];

    case "sync_surense_activity":
      return [
        s(
          step.config
            ?.activityType
        ) ||
        "לא נבחר סוג פעילות",
        s(
          step.config
            ?.note
        ) ||
        "לא הוגדרה הערה לשורנס",
      ];

    case "create_surense_power_of_attorney":
      return [
        "יצירת קישור ייפוי כוח",
        "הקישור יישמר באיש הקשר",
      ];

    case "condition": {
      const branches =
        getBranches(
          step
        );

      return [
        `ניתוב לפי: ${
          s(
            step.config
              ?.field
          ) ||
          "לא הוגדר שדה"
        }`,
        branches.length >
        0
          ? `${branches.length} ענפים`
          : "לא הוגדרו ענפים",
        ...branches
          .slice(
            0,
            2
          )
          .map(
            (
              branch
            ) =>
              `${branch.label || branch.value} → ${
                branch.nextStepId ||
                "לא מחובר"
              }`
          ),
      ];
    }

    case "end":
      return [
        s(
          step.config
            ?.message
        ) ||
        "סיום התהליך",
      ];

    default:
      return [
        "שלב אוטומציה",
      ];
  }
}
