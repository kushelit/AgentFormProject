import type {
  FlowStep,
} from "@/lib/MagicTouch/flows/types";

const FIELD_LABELS: Record<string, string> = {
  "engagement.reengagement.status": "סטטוס תהליך",
  "engagement.reengagement.interestStatus": "סטטוס עניין",
  "engagement.reengagement.interestRespondedAt": "מועד תגובת הלקוח",
  "engagement.reengagement.bookingStatus": "סטטוס פגישה",
  "engagement.reengagement.bookingLink": "קישור לפגישה",
  "engagement.reengagement.bookingLinkSentAt": "מועד שליחת קישור",
  "engagement.reengagement.bookedAt": "מועד קביעת פגישה",
  "engagement.reengagement.bookingAppointmentId": "מזהה פגישה",
  "engagement.reengagement.bookingStartAt": "מועד תחילת פגישה",
  "engagement.reengagement.bookingEndAt": "מועד סיום פגישה",
  "engagement.reengagement.bookingServiceName": "שם שירות הפגישה",
  "engagement.reengagement.bookingCancelledAt": "מועד ביטול פגישה",
  "engagement.reengagement.resolvedAt": "מועד סיום טיפול",
  "engagement.reengagement.surenseSyncStatus": "סטטוס סנכרון לשורנס",
  "engagement.reengagement.lastFlowRunId": "מזהה הרצה",
  "engagement.reengagement.updatedAt": "מועד עדכון אחרון",
};

function s(value: unknown): string {
  return String(value ?? "").trim();
}

export function getStepTypeLabel(step: FlowStep): string {
  switch (step.type) {
    case "request_documents":
      return "בקשת מסמכים";
    case "send_whatsapp":
      return "שליחת WhatsApp";
    case "update_contact":
      return "עדכון איש קשר";
    case "add_timeline_event":
      return "הוספה לציר הזמן";
    case "sync_surense_activity":
      return "עדכון פעילות בשורנס";
    case "create_surense_power_of_attorney":
      return "יצירת קישור ייפוי כוח";
    case "condition":
      return "תנאי";
    case "end":
      return "סיום";
    default:
      return s(step.type) || "שלב";
  }
}

export function getStepIcon(step: FlowStep): string {
  switch (step.type) {
    case "request_documents":
      return "🪪";
    case "send_whatsapp":
      return "💬";
    case "update_contact":
      return "👤";
    case "add_timeline_event":
      return "📝";
    case "sync_surense_activity":
      return "🔄";
    case "create_surense_power_of_attorney":
      return "✍️";
    case "condition":
      return "◆";
    case "end":
      return "✓";
    default:
      return "⚙️";
  }
}

export function getStepAccent(step: FlowStep): {
  ring: string;
  icon: string;
  badge: string;
  connector: string;
} {
  switch (step.type) {
    case "request_documents":
      return {
        ring: "border-cyan-200 hover:border-cyan-400",
        icon: "bg-cyan-100 text-cyan-800",
        badge: "bg-cyan-50 text-cyan-700",
        connector: "bg-cyan-300",
      };
    case "send_whatsapp":
      return {
        ring: "border-emerald-200 hover:border-emerald-400",
        icon: "bg-emerald-100 text-emerald-800",
        badge: "bg-emerald-50 text-emerald-700",
        connector: "bg-emerald-300",
      };
    case "update_contact":
      return {
        ring: "border-violet-200 hover:border-violet-400",
        icon: "bg-violet-100 text-violet-800",
        badge: "bg-violet-50 text-violet-700",
        connector: "bg-violet-300",
      };
    case "add_timeline_event":
      return {
        ring: "border-amber-200 hover:border-amber-400",
        icon: "bg-amber-100 text-amber-800",
        badge: "bg-amber-50 text-amber-700",
        connector: "bg-amber-300",
      };
    case "sync_surense_activity":
      return {
        ring: "border-sky-200 hover:border-sky-400",
        icon: "bg-sky-100 text-sky-800",
        badge: "bg-sky-50 text-sky-700",
        connector: "bg-sky-300",
      };
    case "create_surense_power_of_attorney":
      return {
        ring: "border-indigo-200 hover:border-indigo-400",
        icon: "bg-indigo-100 text-indigo-800",
        badge: "bg-indigo-50 text-indigo-700",
        connector: "bg-indigo-300",
      };
    case "condition":
      return {
        ring: "border-fuchsia-200 hover:border-fuchsia-400",
        icon: "bg-fuchsia-100 text-fuchsia-800",
        badge: "bg-fuchsia-50 text-fuchsia-700",
        connector: "bg-fuchsia-300",
      };
    case "end":
      return {
        ring: "border-slate-300 hover:border-slate-500",
        icon: "bg-slate-900 text-white",
        badge: "bg-slate-100 text-slate-700",
        connector: "bg-slate-300",
      };
    default:
      return {
        ring: "border-slate-200 hover:border-slate-400",
        icon: "bg-slate-100 text-slate-700",
        badge: "bg-slate-100 text-slate-700",
        connector: "bg-slate-300",
      };
  }
}

export function getStepSummary(step: FlowStep): string[] {
  switch (step.type) {
    case "request_documents":
      return [
        "צילום תעודת זהות - צד קדמי ואחורי",
        "המשך אוטומטי לאחר השלמת ההעלאה",
        "קישור פעיל עד השלמת הבקשה או ביטולה",
      ];

    case "update_contact": {
      const updates =
        step.config?.updates &&
        typeof step.config.updates === "object" &&
        !Array.isArray(step.config.updates)
          ? (step.config.updates as Record<string, unknown>)
          : {};

      const fields = Object.keys(updates);

      if (fields.length === 0) {
        return ["לא נבחרו שדות לעדכון"];
      }

      return [
        `${fields.length} שדות יתעדכנו`,
        ...fields.slice(0, 3).map((path) => FIELD_LABELS[path] || path),
        ...(fields.length > 3 ? [`ועוד ${fields.length - 3} שדות`] : []),
      ];
    }

    case "add_timeline_event":
      return [
        s(step.config?.title) || "ללא כותרת",
        s(step.config?.description) || "ללא תיאור",
      ];

    case "send_whatsapp": {
      const message = s(step.config?.message);
      return [
        s(step.config?.mode) === "template"
          ? "הודעת תבנית"
          : "הודעת טקסט",
        message
          ? message.length > 90
            ? `${message.slice(0, 90)}…`
            : message
          : "תוכן ההודעה עדיין ריק",
      ];
    }

    case "sync_surense_activity":
      return [
        s(step.config?.activityType) || "לא נבחר סוג פעילות",
        s(step.config?.note) || "לא הוגדרה הערה לשורנס",
      ];

    case "create_surense_power_of_attorney": {
      const included: string[] = [];

      if (step.config?.includeHb !== false) {
        included.push("הר הביטוח");
      }

      if (step.config?.includePolicies !== false) {
        included.push("פוליסות");
      }

      if (step.config?.includeSwiftness !== false) {
        included.push("מסלקה");
      }

      return [
        included.length > 0
          ? `יצירת קישור עבור: ${included.join(", ")}`
          : "לא נבחרו סוגי מידע",
        "הקישור יישמר באיש הקשר",
      ];
    }

    case "condition":
      return [
        `${s(step.config?.field) || "שדה"} ${s(
          step.config?.operator
        ) || ""}`.trim(),
        s(step.config?.value) || "ללא ערך להשוואה",
      ];

    case "end":
      return [s(step.config?.message) || "סיום התהליך"];

    default:
      return ["שלב אוטומציה"];
  }
}
