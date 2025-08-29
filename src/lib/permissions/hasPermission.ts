// src/lib/permissions/hasPermission.ts
import { PAID_PERMISSION_ADDONS, isPaidPermission } from '@/utils/paidPermissions';

interface HasPermissionParams {
  user: MinimalUser;
  permission: string;
  rolePermissions: string[] | null;
  subscriptionPermissionsMap?: Record<string, string[]>;
}

export type MinimalUser = {
  uid: string;
  role: 'agent' | 'manager' | 'admin' | 'worker' | string;
  subscriptionId?: string;
  subscriptionType?: string; // ← לכל agent יש ערך (כולל 'OLD')
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
  // 1) overrides תמיד קודמים
  const deny = user.permissionOverrides?.deny || [];
  if (deny.includes(permission)) return false;

  const allow = user.permissionOverrides?.allow || [];
  if (allow.includes(permission)) return true;

  // 2) אדמין תמיד מותר (גם אם rolePermissions לא נטען עדיין)
  if (user.role === 'admin' || rolePermissions?.includes('*')) return true;

  // 3) סוכן – תמיד לפי מסלול (הנחת עבודה: תמיד יש subscriptionType, כולל 'OLD')
  if (user.role === 'agent' || user.role === 'manager') {
    const plan = user.subscriptionType!; // אין fallback, את מבטיחה שזה מוגדר
    const planPerms = (subscriptionPermissionsMap?.[plan]) || [];

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

    return planPerms.includes(permission) || hasAddon;
  }

  // 4) שאר הרולים – לפי roles בלבד
  if (!rolePermissions) return false;
  return rolePermissions.includes(permission);
}
