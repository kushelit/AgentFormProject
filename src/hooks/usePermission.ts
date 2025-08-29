import { useAuth } from "@/lib/firebase/AuthContext";
import { hasPermission } from "@/lib/permissions/hasPermission";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase";

/**
 * Hook שמחזיר האם למשתמש יש הרשאה, וגם האם עדיין בטעינה
 */
type FullUser = {
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
  [key: string]: any;
};

export function usePermission(permission: string | null): {
  canAccess: boolean | null;
  isChecking: boolean;
} {
  const { user, detail, isLoading, rolesPermissions } = useAuth();
  const role = detail?.role;

  // AGENT / MANAGER → לפי מסלול (plan-based)
  const isPlanBased = role === "agent" || role === "manager";
  const needsRolePerms = !isPlanBased;

  const [subscriptionPermissionsMap, setSubscriptionPermissionsMap] =
    useState<Record<string, string[]>>({});

  // טוען את מפת ההרשאות של כל המסלולים (כולל OLD)
  useEffect(() => {
    if (!user || !permission) {
      setSubscriptionPermissionsMap({});
      return;
    }
    (async () => {
      try {
        const snapshot = await getDocs(collection(db, "subscriptions_permissions"));
        const result: Record<string, string[]> = {};
        snapshot.forEach((doc) => {
          const data = doc.data();
          result[doc.id] = data.permissions || [];
        });
        setSubscriptionPermissionsMap(result);
      } catch {
        setSubscriptionPermissionsMap({});
      }
    })();
  }, [user, permission]);

  // אם זה plan-based לא צריך rolePermissions בכלל
  const rolePermissions = useMemo(() => {
    if (!needsRolePerms || !role) return [];
    return rolesPermissions[role] || [];
  }, [rolesPermissions, role, needsRolePerms]);

  const fullUser: FullUser = useMemo(
    () => ({
      uid: user?.uid || "",
      role: detail?.role || "",
      subscriptionId: detail?.subscriptionId || "",
      subscriptionType: detail?.subscriptionType || "", // לכל AGENT/MANAGER יש ערך (כולל 'OLD')
      permissionOverrides: detail?.permissionOverrides || {},
      addOns: detail?.addOns || {},
      ...user,
    }),
    [user, detail]
  );

  // נטענו מפות מסלולים?
  const subsLoaded = Object.keys(subscriptionPermissionsMap).length > 0;

  // מצב טעינה:
  // - ל-plan-based (agent/manager): מחכים רק למפות המסלולים
  // - לאחרים: מחכים ל-rolePermissions
  const isChecking =
    isLoading ||
    !user ||
    !detail ||
    !permission ||
    (needsRolePerms && rolePermissions.length === 0) ||
    (isPlanBased && !subsLoaded);

  const canAccess = useMemo(() => {
    if (!user || !permission) return false;
    if (isChecking) return null; // עדיין בטעינה
    return hasPermission({
      user: fullUser,
      permission,
      rolePermissions,
      subscriptionPermissionsMap,
    });
  }, [isChecking, fullUser, permission, rolePermissions, subscriptionPermissionsMap]);

  return { canAccess, isChecking };
}
