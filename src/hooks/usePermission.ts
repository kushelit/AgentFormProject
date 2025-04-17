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
  const rolePermissions = useRolePermissions(role);

  const canAccess = useMemo(() => {
    if (!user || !rolePermissions) return null;
    return hasPermission({
      user,
      permission,
      rolePermissions,
    });
  }, [user, permission, rolePermissions]);

  const isChecking = isLoading || !user || !rolePermissions;

  return { canAccess, isChecking };
}
