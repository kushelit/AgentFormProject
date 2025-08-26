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
  const subscriptionId = detail?.subscriptionId || '';

  const [subscriptionPermissionsMap, setSubscriptionPermissionsMap] = useState<Record<string, string[]>>({});

  
  useEffect(() => {
    // בדיקת user לפני קריאת Firebase
    if (!user || !user.uid || !permission) {
      console.log("No user or permission - clearing subscription permissions");
      setSubscriptionPermissionsMap({});
      return;
    }
  
    const fetchSubscriptionPermissions = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'subscriptions_permissions'));
        const result: Record<string, string[]> = {};
        snapshot.forEach((doc) => {
          const data = doc.data();
          result[doc.id] = data.permissions || [];
        });
        setSubscriptionPermissionsMap(result);
      } catch (error) {
        console.error('Failed to fetch subscription permissions:', error);
        setSubscriptionPermissionsMap({});
      }
    };
  
    fetchSubscriptionPermissions();
  }, [user, permission]);

  const rolePermissions = useMemo(() => {
    if (!role) return [];
    return rolesPermissions[role] || [];
  }, [rolesPermissions, role]);

  const fullUser: FullUser = useMemo(() => ({
    uid: user?.uid || '',
    role: detail?.role || '',
    subscriptionId,
    subscriptionType: detail?.subscriptionType || '',
    permissionOverrides: detail?.permissionOverrides || {},
    addOns: detail?.addOns || {},
    ...user,
  }), [user, detail, subscriptionId]);

  const isChecking = isLoading || !user || !detail  || !permission|| rolePermissions.length === 0;

  const canAccess = useMemo(() => {

    if (!user || !permission) return false;

    if (isChecking) return null; // עדיין בטעינה
    return hasPermission({
      user: fullUser,
      permission: permission,
      rolePermissions,
      subscriptionPermissionsMap,
    });
  }, [isChecking, fullUser, permission, rolePermissions, subscriptionPermissionsMap]);

  return { canAccess, isChecking };
}
