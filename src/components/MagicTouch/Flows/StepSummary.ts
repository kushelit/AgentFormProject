import type {
  FlowDocument,
  FlowStep,
  StepType,
} from "@/lib/MagicTouch/flows/types";

export type StepVisualDefinition = {
  label: string;
  icon: string;
  badgeClassName: string;
  cardClassName: string;
};

export const STEP_VISUALS: Record<string, StepVisualDefinition> = {
  send_whatsapp: {
    label: "שליחת WhatsApp",
    icon: "💬",
    badgeClassName: "bg-emerald-100 text-emerald-800",
    cardClassName: "border-emerald-200",
  },
  update_contact: {
    label: "עדכון איש קשר",
    icon: "👤",
    badgeClassName: "bg-blue-100 text-blue-800",
    cardClassName: "border-blue-200",
  },
  add_timeline_event: {
    label: "הוספה לציר הזמן",
    icon: "📝",
    badgeClassName: "bg-violet-100 text-violet-800",
    cardClassName: "border-violet-200",
  },
  sync_surense_activity: {
    label: "עדכון פעילות בשורנס",
    icon: "🔄",
    badgeClassName: "bg-amber-100 text-amber-800",
    cardClassName: "border-amber-200",
  },
  end: {
    label: "סיום",
    icon: "🏁",
    badgeClassName: "bg-slate-100 text-slate-800",
    cardClassName: "border-slate-300",
  },
};

const FIELD_LABELS: Record<string, string> = {
  "engagement.reengagement.status": "סטטוס תהליך חידוש קשר",
  "engagement.reengagement.interestStatus": "סטטוס התעניינות",
  "engagement.reengagement.interestRespondedAt": "מועד תגובת הלקוח",
  "engagement.reengagement.bookingStatus": "סטטוס קביעת פגישה",
  "engagement.reengagement.bookingLink": "קישור לקביעת פגישה",
  "engagement.reengagement.bookingLinkSentAt": "מועד שליחת קישור הפגישה",
  "engagement.reengagement.bookedAt": "מועד קביעת הפגישה",
  "engagement.reengagement.bookingAppointmentId": "מזהה הפגישה",
  "engagement.reengagement.bookingStartAt": "מועד תחילת הפגישה",
  "engagement.reengagement.bookingEndAt": "מועד סיום הפגישה",
  "engagement.reengagement.bookingServiceName": "שם שירות הפגישה",
  "engagement.reengagement.bookingCancelledAt": "מועד ביטול הפגישה",
  "engagement.reengagement.resolvedAt": "מועד סיום הטיפול",
  "engagement.reengagement.surenseSyncStatus": "סטטוס סנכרון לשורנס",
  "engagement.reengagement.lastFlowRunId": "מזהה הרצת התהליך האחרונה",
  "engagement.reengagement.updatedAt": "מועד עדכון אחרון",
};

export function getStepVisual(type: StepType): StepVisualDefinition {
  return STEP_VISUALS[type] || {
    label: String(type),
    icon: "⚙️",
    badgeClassName: "bg-gray-100 text-gray-800",
    cardClassName: "border-gray-200",
  };
}

function shorten(value: unknown, maxLength = 90): string {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");

  if (!text) {
    return "";
  }

  return text.length > maxLength
    ? `${text.slice(0, maxLength).trim()}…`
    : text;
}

export function getStepSummaryLines(step: FlowStep): string[] {
  switch (step.type) {
    case "send_whatsapp": {
      const message = shorten(step.config?.message, 120);

      return message
        ? [message]
        : ["עדיין לא הוגדר תוכן הודעה"];
    }

    case "update_contact": {
      const updates =
        step.config?.updates &&
        typeof step.config.updates === "object" &&
        !Array.isArray(step.config.updates)
          ? (step.config.updates as Record<string, unknown>)
          : {};

      const paths = Object.keys(updates);

      if (paths.length === 0) {
        return ["עדיין לא נבחרו שדות לעדכון"];
      }

      const labels = paths.slice(0, 3).map((path) => FIELD_LABELS[path] || path);

      if (paths.length > 3) {
        labels.push(`ועוד ${paths.length - 3} שדות`);
      }

      return labels;
    }

    case "add_timeline_event": {
      const title = shorten(step.config?.title, 80);
      const description = shorten(step.config?.description, 100);

      return [
        title || "עדיין לא הוגדרה כותרת",
        ...(description ? [description] : []),
      ];
    }

    case "sync_surense_activity": {
      const activityType = shorten(step.config?.activityType, 60);
      const workflowStatus = shorten(step.config?.workflowStatus, 40);
      const note = shorten(step.config?.note, 100);

      return [
        activityType ? `סוג פעילות: ${activityType}` : "עדיין לא הוגדר סוג פעילות",
        ...(workflowStatus ? [`סטטוס תהליך: ${workflowStatus}`] : []),
        ...(note ? [note] : []),
      ];
    }

    case "end": {
      const message = shorten(step.config?.message, 100);
      return [message || "סיום המסלול"];
    }

    default:
      return ["שלב ללא תקציר"];
  }
}

export function getStepConnectionLabel(
  flow: FlowDocument,
  step: FlowStep
): string {
  if (step.type === "end") {
    return "סיום התהליך";
  }

  const nextStepId = String(step.nextStepId || "").trim();

  if (!nextStepId) {
    return "לא הוגדר שלב הבא";
  }

  const nextStep = flow.steps[nextStepId];

  if (!nextStep) {
    return `שלב לא קיים: ${nextStepId}`;
  }

  return nextStep.name || nextStepId;
}

export function getStepWarnings(
  flow: FlowDocument,
  stepId: string,
  step: FlowStep
): string[] {
  const warnings: string[] = [];

  if (!String(step.name || "").trim()) {
    warnings.push("חסר שם לשלב");
  }

  if (step.type !== "end") {
    const nextStepId = String(step.nextStepId || "").trim();

    if (!nextStepId) {
      warnings.push("השלב אינו מחובר לשלב הבא");
    } else if (!flow.steps[nextStepId]) {
      warnings.push("השלב הבא שנבחר אינו קיים");
    } else if (nextStepId === stepId) {
      warnings.push("השלב מחובר לעצמו");
    }
  }

  if (step.type === "send_whatsapp" && !String(step.config?.message || "").trim()) {
    warnings.push("חסר תוכן הודעת WhatsApp");
  }

  if (step.type === "add_timeline_event" && !String(step.config?.title || "").trim()) {
    warnings.push("חסרה כותרת לאירוע בציר הזמן");
  }

  if (step.type === "sync_surense_activity") {
    if (!String(step.config?.activityType || "").trim()) {
      warnings.push("חסר סוג פעילות בשורנס");
    }

    if (!String(step.config?.note || "").trim()) {
      warnings.push("חסרה הערה לשורנס");
    }
  }

  return warnings;
}
