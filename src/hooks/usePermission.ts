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
  const rolePermissions = useRolePermissions(role); // ⬅️ כאן השתמשנו בגרסה החדשה

  const fullUser = useMemo(() => ({
    ...user,
    permissionOverrides: detail?.permissionOverrides || {}
  }), [user, detail]);

  const isChecking = isLoading || !user || !detail || rolePermissions.length === 0;

  const canAccess = useMemo(() => {
    if (isChecking) return null; // עדיין בטעינה
    return hasPermission({
      user: fullUser,
      permission,
      rolePermissions,
    });
  }, [isChecking, fullUser, permission, rolePermissions]);

  return { canAccess, isChecking };
}
