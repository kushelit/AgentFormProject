type User = {
  uid: string;
  role: string;
  subscriptionId?: string;
  subscriptionType?: string;
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
  user: User & { addOns?: { leadsModule?: boolean; extraWorkers?: number } };
  permission: string;
  rolePermissions: string[] | null;
  subscriptionPermissionsMap?: Record<string, string[]>;
}): boolean {
  const deny = user?.permissionOverrides?.deny || [];
  if (deny.includes(permission)) return false;

  const allow = user?.permissionOverrides?.allow || [];
  if (allow.includes(permission)) return true;

  if (!rolePermissions) return false;
  if (rolePermissions.includes("*")) return true;

  const hasSub = !!user.subscriptionId && !!user.subscriptionType;
  const subscriptionPerms =
    user.subscriptionType && subscriptionPermissionsMap
      ? subscriptionPermissionsMap[user.subscriptionType] || []
      : [];

  const roleHas = rolePermissions.includes(permission);
  const subHas = hasSub ? subscriptionPerms.includes(permission) : true;

  // 👇 בדיקה לפי תוספים שנרכשו
  const hasAddonPermission =
    permission === "access_flow" && user.addOns?.leadsModule === true;


    console.log("🔍 hasPermission check", {
      user: user.uid,
      permission,
      roleHas,
      subHas,
      hasAddonPermission,
      subscriptionType: user.subscriptionType,
      subscriptionPerms,
      rolePermissions,
      addOns: user.addOns,
    });


  // 👇 ההרשאה תינתן אם יש אותה לפי תפקיד + מנוי, או לפי תוסף שנרכש
  return (roleHas && subHas) || hasAddonPermission;
}
