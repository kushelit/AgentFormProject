import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase";

export function useRolePermissions(role: string | null) {
  const [permissions, setPermissions] = useState<string[]>([]); // ⬅️ ברירת מחדל: מערך ריק

  useEffect(() => {
    if (!role) {
      setPermissions([]); // ⬅️ הבטחת ערך ריק גם כשאין רול
      return;
    }

    const fetchPermissions = async () => {
      try {
        const roleDoc = await getDoc(doc(db, "roles", role));
        if (roleDoc.exists()) {
          const data = roleDoc.data();

          console.log(`📌 permissions raw from DB for role '${role}':`, data);

          const perms = Array.isArray(data.permissions) ? data.permissions : [];
          setPermissions(perms);
        } else {
          console.warn(`⚠️ Role '${role}' not found in DB`);
          setPermissions([]);
        }
      } catch (err) {
        console.error("❌ Failed to fetch role permissions:", err);
        setPermissions([]);
      }
    };

    fetchPermissions();
  }, [role]);

  return permissions;
}
