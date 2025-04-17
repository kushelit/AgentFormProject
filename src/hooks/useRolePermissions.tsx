import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase";

export function useRolePermissions(role: string | null) {
  const [permissions, setPermissions] = useState<string[] | null>(null);

  useEffect(() => {
    if (!role) return;

    const fetchPermissions = async () => {
      const roleDoc = await getDoc(doc(db, "roles", role));
      if (roleDoc.exists()) {
        setPermissions(roleDoc.data().permissions || []);
      } else {
        setPermissions([]);
      }
    };

    fetchPermissions();
  }, [role]);

  return permissions;
}
