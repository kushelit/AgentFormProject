type User = {
  uid: string;
  role: string;
  subscriptionId?: string;
  permissionOverrides?: {
    allow?: string[];
    deny?: string[];
  };
};

export function hasPermission({
  user,
  permission,
  rolePermissions,
  subscriptionPermissionsMap,
}: {
  user: User;
  permission: string;
  rolePermissions: string[] | null;
  subscriptionPermissionsMap?: Record<string, string[]>;
}): boolean {
  const deny = user?.permissionOverrides?.deny || [];
  if (deny.includes(permission)) return false;

  const allow = user?.permissionOverrides?.allow || [];
  if (allow.includes(permission)) return true;

  if (!rolePermissions) return false;

  const hasFullRole = rolePermissions.includes("*");

  // נבדוק הרשאות מנוי רק אם יש למשתמש subscriptionId
  const subscriptionId = user.subscriptionId;
  const subscriptionPerms = subscriptionId
    ? subscriptionPermissionsMap?.[subscriptionId] || []
    : null;

  const hasFullSub = subscriptionPerms?.includes("*") ?? true;

  if (hasFullRole && hasFullSub) return true;

  const roleHas = rolePermissions.includes(permission);
  const subHas = subscriptionPerms ? subscriptionPerms.includes(permission) : true;

  return roleHas && subHas;
}
