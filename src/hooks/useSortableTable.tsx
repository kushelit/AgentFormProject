import { useState } from "react";
import { Timestamp } from "firebase/firestore";

export function useSortableTable<T extends Record<string, any>>(initialData: T[]) {
  const [sortColumn, setSortColumn] = useState<keyof T | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [sortedData, setSortedData] = useState<T[]>(initialData);

  const handleSort = (column: keyof T) => {
    const newSortOrder = sortColumn === column && sortOrder === "asc" ? "desc" : "asc";
    setSortColumn(column);
    setSortOrder(newSortOrder);

    const sorted = [...sortedData].sort((a, b) => {
      let valueA = a[column] as any; // ✅ Type Assertion
      let valueB = b[column] as any; // ✅ Type Assertion

      // ✅ אם הערכים `undefined` או `null`, נשתמש במחרוזת ריקה למניעת שגיאות
      if (valueA == null) valueA = "";
      if (valueB == null) valueB = "";

      // ✅ אם הערכים הם `boolean`, נמיר אותם למחרוזת לצורך השוואה
      if (typeof valueA === "boolean") valueA = valueA ? "1" : "0";
      if (typeof valueB === "boolean") valueB = valueB ? "1" : "0";

      // ✅ אם הערכים הם Firebase `Timestamp`, נמיר אותם ל- `Date`
      if (valueA instanceof Timestamp) valueA = valueA.toDate().toISOString();
      if (valueB instanceof Timestamp) valueB = valueB.toDate().toISOString();

      // ✅ אם הערכים הם מחרוזות של תאריכים, נמיר למספר כדי שניתן יהיה למיין לפי זמן
      if (typeof valueA === "string" && column.toString().toLowerCase().includes("date")) {
        const parsedA = Date.parse(valueA);
        if (!isNaN(parsedA)) valueA = String(parsedA);
      }
      if (typeof valueB === "string" && column.toString().toLowerCase().includes("date")) {
        const parsedB = Date.parse(valueB);
        if (!isNaN(parsedB)) valueB = String(parsedB);
      }

      // ✅ מיון טקסטים כולל עברית
      return newSortOrder === "asc"
        ? String(valueA).localeCompare(String(valueB), "he")
        : String(valueB).localeCompare(String(valueA), "he");
    });

    console.log("✅ נתונים אחרי מיון:", sorted);
    setSortedData(sorted);
  };

  return { sortedData, sortColumn, sortOrder, handleSort };
}
