import { useState } from "react";
import { Timestamp } from "firebase/firestore";

function useSort<T>(data: T[], defaultColumn: keyof T | null = null, defaultOrder: "asc" | "desc" = "asc") {
  const [sortColumn, setSortColumn] = useState<keyof T | null>(defaultColumn);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(defaultOrder);

  const sortedData = sortColumn
    ? [...data].sort((a, b) => {
        let valueA = a[sortColumn] as any;
        let valueB = b[sortColumn] as any;

        if (valueA == null) valueA = "";
        if (valueB == null) valueB = "";

        if (typeof valueA === "boolean") valueA = valueA ? "1" : "0";
        if (typeof valueB === "boolean") valueB = valueB ? "1" : "0";

        if (valueA instanceof Timestamp) valueA = valueA.toDate().toISOString();
        if (valueB instanceof Timestamp) valueB = valueB.toDate().toISOString();

        if (typeof valueA === "string" && sortColumn.toString().toLowerCase().includes("date")) {
          const parsedA = Date.parse(valueA);
          if (!isNaN(parsedA)) valueA = parsedA;
        }
        if (typeof valueB === "string" && sortColumn.toString().toLowerCase().includes("date")) {
          const parsedB = Date.parse(valueB);
          if (!isNaN(parsedB)) valueB = parsedB;
        }

        return sortOrder === "asc"
          ? String(valueA).localeCompare(String(valueB), "he")
          : String(valueB).localeCompare(String(valueA), "he");
      })
    : data;

  const handleSort = (column: keyof T) => {
    const newSortOrder = sortColumn === column && sortOrder === "asc" ? "desc" : "asc";
    setSortColumn(column);
    setSortOrder(newSortOrder);
  };

  return { sortedData, sortColumn, sortOrder, handleSort };
}

export default useSort; // ✅ חייב להיות export default
