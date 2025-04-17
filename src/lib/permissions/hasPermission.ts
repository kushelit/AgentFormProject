type User = {
    uid: string;
    role: string;
    permissionOverrides?: {
      allow?: string[];
      deny?: string[];
    };
  };
  
 
  export function hasPermission({
    user,
    permission,
    rolePermissions
  }: {
    user: any;
    permission: string;
    rolePermissions: string[] | null;
  }): boolean {
    // שלב 1: deny ביוזר גובר על הכל
    const deny = user?.permissionOverrides?.deny || [];
    if (deny.includes(permission)) return false;
  
    // שלב 2: allow ביוזר מתיר
    const allow = user?.permissionOverrides?.allow || [];
    if (allow.includes(permission)) return true;
  
    // שלב 3: אם אין rolePermissions – חסום
    if (!rolePermissions) return false;
  
    // שלב 4: אם יש * – גישה מלאה
    if (rolePermissions.includes("*")) return true;
  
    // שלב 5: הרשאה רגילה לפי תפקיד
    return rolePermissions.includes(permission);
  }
  