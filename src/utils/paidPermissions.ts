// paidPermissions.ts

import type { UserDetail } from '@/lib/firebase/AuthContext';

// כל ההרשאות שנחשבות תוספים בתשלום
export type PaidPermission =
  | 'access_flow'
  // | 'access_permissions' // תוסף עתידי לדוגמה
  ;

// מיפוי בין ההרשאות לבין מפתחות התוספים ב־addOns
export const PAID_PERMISSION_ADDONS: Record<PaidPermission, keyof NonNullable<UserDetail['addOns']>> = {
  access_flow: 'leadsModule',
  // access_permissions: 'permissionsModule', // לדוגמה בעתיד
};

export function isPaidPermission(permission: string): permission is PaidPermission {
  return permission in PAID_PERMISSION_ADDONS;
}
