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
  active: boolean;
};

export type FlowActionDefinition = {
  id: string;

  /*
   * stepType קיים רק כאשר ה-Flow Engine
   * כבר יודע להריץ את הפעולה.
   *
   * פעולה עתידית יכולה להיות מוגדרת ב-Registry
   * עם active:false בלי להוסיף StepType שעדיין
   * לא קיים ב-Engine.
   */
  stepType?: StepType;

  label: string;
  description: string;
  icon: string;

  /*
   * האם ניתן כרגע לבחור את הפעולה
   * בבונה התהליכים.
   */
  active: boolean;
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
        description:
          "הלקוח שלח הודעת WhatsApp",
        active: true,
      },
      {
        type: "whatsapp_quick_reply_received",
        label: "התקבלה תשובה לתבנית",
        description:
          "הלקוח בחר תשובה מתוך תבנית WhatsApp שנשלחה אליו",
        active: true,
      },
    ],

    actions: [
      {
        id: "send_whatsapp",
        stepType: "send_whatsapp",
        label: "שליחת הודעה",
        description:
          "שליחת הודעת WhatsApp ללקוח",
        icon: "💬",
        active: true,
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
        description:
          "נוצרה פגישה חדשה ב־Microsoft Bookings",
        active: true,
      },
      {
        type: "microsoft_booking_cancelled",
        label: "בוטלה פגישה",
        description:
          "פגישה קיימת בוטלה ב־Microsoft Bookings",
        active: true,
      },
    ],

    /*
     * כרגע MagicTouch מקבל אירועים מ-Bookings,
     * אבל אין לנו Step שמבצע פעולה ישירות
     * בתוך Microsoft Bookings.
     */
   actions: [
  {
    id: "send_booking_link",
    stepType: "send_booking_link",
    label: "שליחת קישור לפגישה",
    description:
      "שליחת קישור לפגישת ברירת המחדל של Microsoft Bookings ללקוח",
    icon: "📅",
    active: true,
  },
],
  },

  {
    id: "surense",
    label: "Surense",
    icon: "🔄",

    /*
     * בדיקות חתימה / getCustomer הן Jobs פנימיים
     * ולא Trigger שהמיישם צריך לבנות כרגע.
     */
    triggers: [],

    actions: [
      {
        id: "create_surense_workflow",
        label: "יצירת תהליך",
        description:
          "יצירת Workflow חדש ב־Surense",
        icon: "➕",
        active: false,
      },

      {
        id: "update_surense_workflow",
        label: "עדכון תהליך",
        description:
          "עדכון Workflow קיים ב־Surense",
        icon: "✏️",
        active: false,
      },

      {
        id: "close_surense_workflow",
        stepType: "sync_surense_activity",
        label: "סגירת תהליך",
        description:
          "סגירת Workflow קיים ב־Surense",
        icon: "✅",
        active: true,
      },

      {
        id: "create_surense_power_of_attorney",
        stepType:
          "create_surense_power_of_attorney",
        label: "יצירת ייפוי כוח",
        description:
          "יצירת קישור ייפוי כוח דרך Surense ושמירתו באיש הקשר",
        icon: "✍️",
        active: true,
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
        id: "condition",
        stepType: "condition",
        label: "תנאי",
        description:
          "פיצול המסלול לפי ערך או מצב בתהליך",
        icon: "🔀",
        active: false,
      },

     {
  id: "request_documents",
  stepType: "request_documents",
  label: "בקשת צילום תעודת זהות",
  description:
    "שליחת קישור מאובטח ללקוח להעלאת צילום הצד הקדמי והצד האחורי של תעודת הזהות",
  icon: "🪪",
  active: true,
},

      {
        id: "update_contact",
        stepType: "update_contact",
        label: "עדכון איש קשר",
        description:
          "עדכון סטטוסים, מועדים ונתוני תהליך באיש הקשר",
        icon: "👤",
        active: true,
      },

      {
        id: "add_timeline_event",
        stepType: "add_timeline_event",
        label: "הוספת תיעוד מותאם אישית",
        description:
          "הוספת הערה או אירוע עסקי לציר הזמן",
        icon: "📝",
        active: true,
      },

   {
  id: "end",
  stepType: "end",
  label: "סיום המסלול",
  description:
    "סיום הריצה וסימון התהליך כהושלם",
  icon: "🏁",
  active: true,
},
    ],
  },

  {
    id: "magicsale",
    label: "MagicSale",
    icon: "✨",

    /*
     * המערכת כבר מוכרת ל-Builder,
     * אבל עדיין לא חשפנו Events או Actions.
     */
    triggers: [],
    actions: [],
  },
];

export function getFlowSystem(
  systemId: string | undefined
): FlowSystemDefinition | undefined {
  return FLOW_SYSTEMS.find(
    (system) =>
      system.id === systemId
  );
}

export function getSystemForTrigger(
  triggerType: string
): FlowSystemDefinition | undefined {
  return FLOW_SYSTEMS.find(
    (system) =>
      system.triggers.some(
        (trigger) =>
          trigger.type === triggerType
      )
  );
}

export function getSystemForStepType(
  stepType: StepType
): FlowSystemDefinition | undefined {
  return FLOW_SYSTEMS.find(
    (system) =>
      system.actions.some(
        (action) =>
          action.stepType === stepType
      )
  );
}