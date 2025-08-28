// src/lib/permissions/hasPermission.ts

import { PAID_PERMISSION_ADDONS, isPaidPermission } from '@/utils/paidPermissions';

interface HasPermissionParams {
  user: MinimalUser;
  permission: string;
  rolePermissions: string[] | null; // ה־role של המשתמש שערוכים עליו/שבודקים עבורו
  subscriptionPermissionsMap?: Record<string, string[]>;
}

export type MinimalUser = {
  uid: string;
  role: 'agent' | 'manager' | 'admin' | 'worker' | string;
  subscriptionId?: string;
  subscriptionType?: string;
  permissionOverrides?: {
    allow?: string[];
    deny?: string[];
  };
  addOns?: {
    leadsModule?: boolean;
    extraWorkers?: number;
    // ... נוספים
  };
};

export function hasPermission({
  user,
  permission,
  rolePermissions,
  subscriptionPermissionsMap,
}: HasPermissionParams): boolean {
  // 1) overrides
  const deny = user.permissionOverrides?.deny || [];
  if (deny.includes(permission)) return false;

  const allow = user.permissionOverrides?.allow || [];
  if (allow.includes(permission)) return true;

  // 2) admin role "*" תמיד
  if (rolePermissions?.includes('*')) return true;

  // 3) זיהוי סטטוס "סוכן עם/בלי מנוי"
  const isAgent = user.role === 'agent';
  const isSubscriberAgent =
    isAgent && !!user.subscriptionId && !!user.subscriptionType;

  // 4) בניית מקורות הרשאה לפי הכלל החדש
  let hasFromSource = false;

  if (isSubscriberAgent) {
    // משתמש מסוג סוכן עם מנוי → אך ורק הרשאות ממנוי (לא roles)
    const subscriptionPerms =
      subscriptionPermissionsMap?.[user.subscriptionType!] || [];
    hasFromSource = subscriptionPerms.includes(permission);

    // תוספים מאפשרים להרחיב מעל המסלול
    let hasAddon = false;
    if (isPaidPermission(permission)) {
      const addonKey = PAID_PERMISSION_ADDONS[permission];
      hasAddon = !!user.addOns?.[addonKey];
    }
    if (
      user.addOns?.leadsModule &&
      (permission === 'access_manageEnviorment' || permission === 'access_flow')
    ) {
      hasAddon = true;
    }

    return hasFromSource || hasAddon;
  }

  // 5) שאר המצבים:
  //    - agent בלי מנוי → לפי roles בלבד
  //    - manager/admin/worker → תמיד לפי roles בלבד
  if (!rolePermissions) return false;
  return rolePermissions.includes(permission);
}
