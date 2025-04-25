import { useAuth } from "@/lib/firebase/AuthContext";
import { useRolePermissions } from "./useRolePermissions";
import { hasPermission } from "@/lib/permissions/hasPermission";
import { useMemo } from "react";

/**
 * Hook שמחזיר האם למשתמש יש הרשאה, וגם האם עדיין בטעינה
 */
export function usePermission(permission: string): {
  canAccess: boolean | null;
  isChecking: boolean;
} {
  const { user, detail, isLoading } = useAuth();

  const role = detail?.role ?? null;
  const rolePermissions = useRolePermissions(role && detail ? role : null);

  const fullUser = useMemo(() => ({
    ...user,
    permissionOverrides: detail?.permissionOverrides || {}
  }), [user, detail]);

  const isChecking = isLoading || !user || !detail || !rolePermissions;

  const canAccess = useMemo(() => {
    if (isChecking || rolePermissions === null || rolePermissions.length === 0) return null; // 🔁 חכי לטעינה מלאה
    return hasPermission({
      user: fullUser,
      permission,
      rolePermissions,
    });
  }, [isChecking, fullUser, permission, rolePermissions]);

  return { canAccess, isChecking };
}
