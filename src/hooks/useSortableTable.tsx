import { useEffect, useState } from "react";
import { Timestamp } from "firebase/firestore";

export function useSortableTable<T extends Record<string, any>>(initialData: T[]) {
  const [sortColumn, setSortColumn] = useState<keyof T | "">(""); // 🔧 אין null, רק string ריק
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [sortedData, setSortedData] = useState<T[]>(initialData);


  // ✅ עדכון `sortedData` בכל פעם שהנתונים מתעדכנים
  useEffect(() => {
    console.log("📌 Updating sortedData with new initialData:", initialData);
    setSortedData(initialData);
  }, [initialData]); // עכשיו `useEffect` ידע שהנתונים השתנו


  const handleSort = (column: keyof T) => {
    const newSortOrder = sortColumn === column && sortOrder === "asc" ? "desc" : "asc";
    setSortColumn(column);
    setSortOrder(newSortOrder);
  
    const sorted = [...sortedData].sort((a, b) => {
      let valueA: string | boolean | Timestamp | undefined = a[column];
      let valueB: string | boolean | Timestamp | undefined = b[column];
  
      if (valueA == null) valueA = "";
      if (valueB == null) valueB = "";
  
      if (typeof valueA === "boolean") valueA = valueA ? "1" : "0";
      if (typeof valueB === "boolean") valueB = valueB ? "1" : "0";
  
      if (valueA instanceof Timestamp) valueA = valueA.toDate().toISOString();
      if (valueB instanceof Timestamp) valueB = valueB.toDate().toISOString();
  
      // ✅ אם הערכים הם מספרים, נמיין בצורה מספרית
      if (typeof valueA === "number" && typeof valueB === "number") {
        return newSortOrder === "asc" ? valueA - valueB : valueB - valueA;
      }
  
      // ✅ אם הערכים הם מחרוזות שמייצגות מספרים (כגון "900" או "8800"), נמיר למספרים
      if (!isNaN(Number(valueA)) && !isNaN(Number(valueB))) {
        return newSortOrder === "asc" ? Number(valueA) - Number(valueB) : Number(valueB) - Number(valueA);
      }
  
      // ✅ אם הערכים הם תאריכים בפורמט DD.MM.YYYY
      const dateRegex = /^\d{2}\.\d{2}\.\d{4}$/;
      if (typeof valueA === "string" && typeof valueB === "string" && dateRegex.test(valueA) && dateRegex.test(valueB)) {
        const parsedA = new Date(valueA.split(".").reverse().join("-")).getTime();
        const parsedB = new Date(valueB.split(".").reverse().join("-")).getTime();
        return newSortOrder === "asc" ? parsedA - parsedB : parsedB - parsedA;
      }
  
      // ✅ אם הערכים הם תאריכים בפורמט אחר (YYYY-MM-DD או DD/MM/YYYY)
      if (typeof valueA === "string" && typeof valueB === "string") {
        const parsedA = Date.parse(valueA);
        const parsedB = Date.parse(valueB);
        if (!isNaN(parsedA) && !isNaN(parsedB)) {
          return newSortOrder === "asc" ? parsedA - parsedB : parsedB - parsedA;
        }
      }
  
      return newSortOrder === "asc"
        ? String(valueA).localeCompare(String(valueB), "he")
        : String(valueB).localeCompare(String(valueA), "he");
    });
  
    console.log("✅ Sorted Data:", sorted);
    setSortedData(sorted);
  };
  
  return { sortedData, sortColumn, sortOrder, handleSort, setSortedData };
}
