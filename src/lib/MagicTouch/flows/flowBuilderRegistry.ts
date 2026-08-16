import type { StepType } from "./types";

export type FlowSystemId =
  | "whatsapp"
  | "microsoft_bookings"
  | "surense"
  | "magicsale"
  | "magic_touch";

export type FlowTriggerDefinition = {
  type: string;
  label: string;
  description?: string;
};

export type FlowActionDefinition = {
  type: StepType;
  label: string;
  description: string;
  icon: string;
};

export type FlowSystemDefinition = {
  id: FlowSystemId;
  label: string;
  icon: string;
  triggers: FlowTriggerDefinition[];
  actions: FlowActionDefinition[];
};

export const FLOW_SYSTEMS: FlowSystemDefinition[] = [
  {
    id: "whatsapp",
    label: "WhatsApp",
    icon: "💬",

    triggers: [
      {
        type: "whatsapp_message_received",
        label: "התקבלה הודעה",
        description: "הלקוח שלח הודעת WhatsApp",
      },
      {
        type: "whatsapp_quick_reply_received",
        label: "התקבלה תשובה לתבנית",
        description:
          "הלקוח בחר תשובה מתוך תבנית WhatsApp שנשלחה אליו",
      },
    ],

    actions: [
      {
        type: "send_whatsapp",
        label: "שליחת הודעה",
        description: "שליחת הודעת WhatsApp ללקוח",
        icon: "💬",
      },
    ],
  },

  {
    id: "microsoft_bookings",
    label: "Microsoft Bookings",
    icon: "📅",

    triggers: [
      {
        type: "microsoft_booking_created",
        label: "נקבעה פגישה",
        description: "נוצרה פגישה חדשה ב־Microsoft Bookings",
      },
      {
        type: "microsoft_booking_cancelled",
        label: "בוטלה פגישה",
        description: "פגישה קיימת בוטלה ב־Microsoft Bookings",
      },
    ],

    actions: [],
  },

  {
    id: "surense",
    label: "Surense",
    icon: "🔄",

    triggers: [],

    actions: [
      {
        type: "sync_surense_activity",
        label: "עדכון תהליך",
        description:
          "עדכון פעילות או סטטוס בתהליך קיים ב־Surense",
        icon: "🔄",
      },
      {
        type: "create_surense_power_of_attorney",
        label: "יצירת ייפוי כוח",
        description:
          "יצירת קישור ייפוי כוח דרך Surense ושמירתו באיש הקשר",
        icon: "✍️",
      },
    ],
  },

  {
    id: "magic_touch",
    label: "MagicTouch",
    icon: "⚙️",

    triggers: [],

    actions: [
      {
        type: "request_documents",
        label: "בקשת מסמכים",
        description:
          "שליחת קישור מאובטח ללקוח להעלאת מסמכים",
        icon: "🪪",
      },
      {
        type: "update_contact",
        label: "עדכון איש קשר",
        description:
          "עדכון סטטוסים, מועדים ונתוני תהליך באיש הקשר",
        icon: "👤",
      },
      {
        type: "add_timeline_event",
        label: "הוספת תיעוד מותאם אישית",
        description:
          "הוספת הערה או אירוע עסקי לציר הזמן",
        icon: "📝",
      },
      {
        type: "end",
        label: "סיום",
        description: "סיום מסלול האוטומציה",
        icon: "🏁",
      },
    ],
  },

  {
    id: "magicsale",
    label: "MagicSale",
    icon: "✨",

    triggers: [],
    actions: [],
  },
];

export function getFlowSystem(
  systemId: string | undefined
): FlowSystemDefinition | undefined {
  return FLOW_SYSTEMS.find(
    (system) => system.id === systemId
  );
}

export function getSystemForTrigger(
  triggerType: string
): FlowSystemDefinition | undefined {
  return FLOW_SYSTEMS.find((system) =>
    system.triggers.some(
      (trigger) => trigger.type === triggerType
    )
  );
}

export function getSystemForStepType(
  stepType: StepType
): FlowSystemDefinition | undefined {
  return FLOW_SYSTEMS.find((system) =>
    system.actions.some(
      (action) => action.type === stepType
    )
  );
}