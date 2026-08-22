import type {
  StepType,
} from "@/lib/MagicTouch/flows/types";

export type StepTypeOption = {
  value: StepType;
  label: string;
  description: string;
  icon: string;
};

export const STEP_TYPES: StepTypeOption[] = [
  {
    value: "send_whatsapp",
    label: "שליחת WhatsApp",
    description:
      "שליחת הודעה רגילה או הודעה שממתינה לתשובת הלקוח",
    icon: "💬",
  },
  {
    value: "wait_for_customer_response",
    label: "המתנה לתשובת לקוח",
    description:
      "פעולה מתקדמת: המתנה עצמאית למענה והמרתו לפעולה עסקית",
    icon: "⏳",
  },
  {
    value: "condition",
    label: "ניתוב לפי תשובה / ערך",
    description:
      "פיצול התהליך למספר ענפים דינמיים",
    icon: "🔀",
  },
  {
    value: "request_documents",
    label: "בקשת מסמכים",
    description:
      "שליחת קישור מאובטח לצילום שני צדי תעודת זהות",
    icon: "🪪",
  },
  {
    value: "send_booking_link",
    label: "שליחת קישור Bookings",
    description:
      "שליחת קישור לפגישת Microsoft Bookings",
    icon: "📅",
  },
  {
    value: "send_google_booking_link",
    label: "שליחת קישור Google",
    description:
      "שליחת קישור לקביעת פגישה ב־Google Calendar",
    icon: "🗓️",
  },
  {
    value: "update_contact",
    label: "עדכון איש קשר",
    description:
      "עדכון סטטוסים, מועדים ונתוני תהליך",
    icon: "👤",
  },
  {
    value: "add_timeline_event",
    label: "הוספה לציר הזמן",
    description:
      "תיעוד פעולה בהיסטוריית איש הקשר",
    icon: "📝",
  },
  {
    value: "sync_surense_activity",
    label: "עדכון פעילות בשורנס",
    description:
      "שליחת פעילות או סגירת תהליך בשורנס",
    icon: "🔄",
  },
  {
    value: "create_surense_power_of_attorney",
    label: "יצירת קישור ייפוי כוח",
    description:
      "יצירת קישור חתימה דרך שורנס ושמירתו באיש הקשר",
    icon: "✍️",
  },
  {
    value: "end",
    label: "סיום",
    description:
      "סיום מסלול האוטומציה",
    icon: "🏁",
  },
];
