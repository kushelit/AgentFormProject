// src/lib/permissions/hasPermission.ts

import type { UserDetail } from '@/lib/firebase/AuthContext';
import { PAID_PERMISSION_ADDONS, PaidPermission, isPaidPermission } from '@/utils/paidPermissions';

// type User = UserDetail;


interface HasPermissionParams {
  user: MinimalUser;
  permission: string;
  rolePermissions: string[] | null;
  subscriptionPermissionsMap?: Record<string, string[]>;
}

export type MinimalUser = {
  uid: string;
  role: string;
  subscriptionId?: string;
  subscriptionType?: string;
  permissionOverrides?: {
    allow?: string[];
    deny?: string[];
  };
  addOns?: {
    leadsModule?: boolean;
    extraWorkers?: number;
  };
};

export function hasPermission({
  user,
  permission,
  rolePermissions,
  subscriptionPermissionsMap,
}: HasPermissionParams): boolean {
  const deny = user.permissionOverrides?.deny || [];
  if (deny.includes(permission)) return false;

  const allow = user.permissionOverrides?.allow || [];
  if (allow.includes(permission)) return true;

  if (!rolePermissions) return false;
  if (rolePermissions.includes('*')) return true;

  const isSubscriber = !!user.subscriptionId && !!user.subscriptionType;

  const subscriptionPerms =
    isSubscriber && subscriptionPermissionsMap && user.subscriptionType
      ? subscriptionPermissionsMap[user.subscriptionType] || []
      : [];

  const hasFromRole = rolePermissions.includes(permission);
  const hasFromSubscription = subscriptionPerms.includes(permission);

  let hasAddon = false;

  // ✳️ בדיקת תוספים רגילים
  if (
    isSubscriber &&
    isPaidPermission(permission)
  ) {
    const addonKey = PAID_PERMISSION_ADDONS[permission];
    hasAddon = !!user.addOns?.[addonKey];
  }
  if (
    isSubscriber &&
    user.addOns?.leadsModule &&
    (permission === 'access_manageEnviorment' || permission === 'access_flow')
  ) {
    hasAddon = true;
  }
  // 🧾 מנוי – צריך גם במסלול וגם בתפקיד, או תוסף
  if (isSubscriber) {
    return (hasFromRole && hasFromSubscription) || hasAddon;
  }

  // 🆓 לא מנוי – רק לפי תפקיד
  return hasFromRole;
}
