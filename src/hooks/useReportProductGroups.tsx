// hooks/useReportProductGroups.ts
import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';

export const useReportProductGroups = () => {
  const [groupsByReportType, setGroupsByReportType] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const fetchData = async () => {
      const snapshot = await getDocs(collection(db, 'reportProductGroups'));
      const map: Record<string, string[]> = {};

      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.isActive && data.reportType && data.allowedProductGroups) {
            map[data.reportType] = Array.isArray(data.allowedProductGroups)
            ? data.allowedProductGroups
            : [data.allowedProductGroups];
          }          
      });

      setGroupsByReportType(map);
    };

    fetchData();
  }, []);

  return { groupsByReportType };
};
