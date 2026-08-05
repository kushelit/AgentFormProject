import type { SurenseActionKey } from "./surenseIntegrationTypes";

export const SURENSE_ACTION_REGISTRY: Record<
  SurenseActionKey,
  {
    label: string;
    description: string;
    implemented: boolean;
  }
> = {
  closeWorkflow: {
    label: "סגירת Workflow בשורנס",
    description: "סגירת התהליך כאשר הלקוח מסרב.",
    implemented: true,
  },
  createPowerOfAttorney: {
    label: "יצירת קישור ייפוי כוח",
    description: "יצירת קישור חתימה דרך שורנס.",
    implemented: true,
  },
  getCustomer: {
    label: "בדיקת לקוח וחתימה",
    description: "קריאת נתוני לקוח לצורך בדיקת חתימה.",
    implemented: true,
  },
};
