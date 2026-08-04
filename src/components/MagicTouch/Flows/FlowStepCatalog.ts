import type { StepType } from "@/lib/MagicTouch/flows/types";

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
    description: "שליחת הודעת טקסט ללקוח",
    icon: "💬",
  },
  {
    value: "update_contact",
    label: "עדכון איש קשר",
    description: "עדכון סטטוסים, מועדים ונתוני תהליך",
    icon: "👤",
  },
  {
    value: "add_timeline_event",
    label: "הוספה לציר הזמן",
    description: "תיעוד פעולה בהיסטוריית איש הקשר",
    icon: "📝",
  },
  {
    value: "sync_surense_activity",
    label: "עדכון פעילות בשורנס",
    description: "שליחת פעילות או סגירת תהליך בשורנס",
    icon: "🔄",
  },
  {
    value: "create_surense_power_of_attorney",
    label: "יצירת קישור ייפוי כוח",
    description: "יצירת קישור חתימה דרך שורנס ושמירתו באיש הקשר",
    icon: "✍️",
  },
  {
    value: "end",
    label: "סיום",
    description: "סיום מסלול האוטומציה",
    icon: "🏁",
  },
];
