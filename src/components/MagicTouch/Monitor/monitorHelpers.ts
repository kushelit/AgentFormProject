import type {
  FlowRunStepHistoryItem,
  MagicTouchFlowRun,
} from "@/lib/MagicTouch/runs/types";

export function statusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "ממתין";
    case "processing":
      return "בתהליך";
    case "continue":
      return "המשיך";
    case "completed":
      return "הושלם";
    case "failed":
      return "נכשל";
    case "cancelled":
      return "בוטל";
    case "dispatched":
      return "הועבר לעיבוד";
    default:
      return status || "לא ידוע";
  }
}

export function statusClass(status: string): string {
  switch (status) {
    case "completed":
    case "continue":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "processing":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "failed":
      return "border-red-200 bg-red-50 text-red-700";
    case "cancelled":
      return "border-slate-200 bg-slate-100 text-slate-600";
    case "pending":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

export function triggerLabel(triggerType: string): string {
  switch (triggerType) {
    case "whatsapp_quick_reply_received":
      return "תשובת WhatsApp";
    case "whatsapp_message_received":
      return "הודעת WhatsApp";
    case "microsoft_booking_created":
      return "נקבעה פגישה";
    case "microsoft_booking_cancelled":
      return "בוטלה פגישה";
    case "reengagement_message_sent":
      return "נשלחה הודעת חידוש קשר";
    case "manual":
      return "הפעלה ידנית";
    default:
      return triggerType || "—";
  }
}

export function triggerIcon(triggerType: string): string {
  switch (triggerType) {
    case "whatsapp_quick_reply_received":
    case "whatsapp_message_received":
    case "reengagement_message_sent":
      return "💬";
    case "microsoft_booking_created":
    case "microsoft_booking_cancelled":
      return "📅";
    case "manual":
      return "🖱️";
    default:
      return "⚡";
  }
}

export function stepIcon(stepType: string): string {
  switch (stepType) {
    case "send_whatsapp":
      return "💬";
    case "update_contact":
      return "👤";
    case "add_timeline_event":
      return "📝";
    case "sync_surense_activity":
      return "🔄";
    case "end":
      return "🏁";
    default:
      return "⚙️";
  }
}

export function formatDateTime(
  value: number | null | undefined
): string {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "he-IL",
    {
      dateStyle: "short",
      timeStyle: "medium",
    }
  ).format(date);
}

export function durationMs(run: MagicTouchFlowRun): number | null {
  const start =
    run.processingStartedAt ||
    run.createdAt;

  const end =
    run.completedAt ||
    run.updatedAt;

  if (!start || !end) return null;

  return Math.max(0, end - start);
}

export function durationLabelFromMs(
  milliseconds: number | null
): string {
  if (milliseconds === null) return "—";

  if (milliseconds < 1000) {
    return `${milliseconds} ms`;
  }

  const seconds =
    Math.round(milliseconds / 1000);

  if (seconds < 60) {
    return `${seconds} שנ׳`;
  }

  return `${Math.round(seconds / 60)} דק׳`;
}

export function durationLabel(run: MagicTouchFlowRun): string {
  return durationLabelFromMs(durationMs(run));
}

export function stepDurationLabel(
  step: FlowRunStepHistoryItem
): string {
  if (!step.startedAt || !step.completedAt) {
    return "—";
  }

  return durationLabelFromMs(
    Math.max(0, step.completedAt - step.startedAt)
  );
}

export function averageDurationLabel(
  runs: MagicTouchFlowRun[]
): string {
  const values =
    runs
      .map(durationMs)
      .filter(
        (value): value is number =>
          value !== null
      );

  if (values.length === 0) return "—";

  return durationLabelFromMs(
    Math.round(
      values.reduce(
        (sum, value) => sum + value,
        0
      ) / values.length
    )
  );
}

export function userFriendlyError(
  error: unknown
): string {
  const value =
    error as
      | Record<string, any>
      | null
      | undefined;

  const message =
    String(
      value?.message ||
      value?.error?.message ||
      value?.details?.message ||
      ""
    ).trim();

  const code =
    String(
      value?.code ||
      value?.error?.code ||
      ""
    ).trim();

  if (!message && !code) {
    return "שגיאה לא ידועה";
  }

  if (
    code.includes("NotFound") ||
    message.toLowerCase().includes("not found")
  ) {
    return "המשאב המבוקש לא נמצא במערכת המקור.";
  }

  if (
    code.includes("permission") ||
    message.toLowerCase().includes("permission")
  ) {
    return "אין הרשאה לבצע את הפעולה.";
  }

  if (
    message.toLowerCase().includes("phone")
  ) {
    return "מספר הטלפון של איש הקשר חסר או אינו תקין.";
  }

  return message || code;
}
