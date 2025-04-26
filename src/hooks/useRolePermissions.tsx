import { useAuth } from "@/lib/firebase/AuthContext";

/**
 * Hook שמחזיר את ההרשאות של התפקיד מה־context של Auth
 */
export function useRolePermissions(role: string | null): string[] {
  const { rolesPermissions } = useAuth();

  if (!role) {
    return [];
  }

  return rolesPermissions[role] || [];
}
