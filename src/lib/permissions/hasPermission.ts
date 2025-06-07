// src/lib/permissions/hasPermission.ts

import type { UserDetail } from '@/lib/firebase/AuthContext';
import { PAID_PERMISSION_ADDONS, PaidPermission } from '@/utils/paidPermissions';

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

  const isPaidPermission = permission in PAID_PERMISSION_ADDONS;
  const addonKey = isPaidPermission ? PAID_PERMISSION_ADDONS[permission as PaidPermission] : undefined;
  const hasAddon: boolean = !!(addonKey && user.addOns?.[addonKey]);

  const isSubscriber = !!user.subscriptionId && !!user.subscriptionType;
  const subscriptionPerms =
    isSubscriber && subscriptionPermissionsMap && user.subscriptionType
      ? subscriptionPermissionsMap[user.subscriptionType] || []
      : [];

  const hasFromRole = rolePermissions.includes(permission);
  const hasFromSubscription = subscriptionPerms.includes(permission);

  // 🧾 למנויים – רק אם במסלול או בתוסף
  if (isSubscriber) {
    return (hasFromRole && hasFromSubscription) || hasAddon;
  }

  // 🆓 למשתמש רגיל – רק לפי role
  return hasFromRole;
}
