import type { SurenseActionKey } from "./surenseIntegrationTypes";

export type SurenseActionDefinition = { key: SurenseActionKey; label: string; description: string; implemented: boolean };

export const SURENSE_ACTION_REGISTRY: Record<SurenseActionKey, SurenseActionDefinition> = {
  closeWorkflow: { key: "closeWorkflow", label: "סגירת Workflow בשורנס", description: "סגירת התהליך שנפתח בשורנס כאשר הלקוח מסרב.", implemented: true },
  createPowerOfAttorney: { key: "createPowerOfAttorney", label: "יצירת קישור ייפוי כוח", description: "יצירת קישור חתימה לייפויי כוח דרך שורנס.", implemented: true },
  getCustomer: { key: "getCustomer", label: "בדיקת לקוח וחתימה", description: "קריאת נתוני הלקוח משורנס לצורך בדיקת סטטוס החתימה.", implemented: false },
};
