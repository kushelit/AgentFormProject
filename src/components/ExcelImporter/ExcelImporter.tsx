import React, { useState } from "react";
import * as XLSX from "xlsx";
import { addDoc, collection, getDocs, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase";

const systemFields = [
  "firstNameCustomer",
  "lastNameCustomer",
  "IDCustomer",
  "company",
  "product",
  "insPremia",
  "pensiaPremia",
  "pensiaZvira",
  "finansimPremia",
  "finansimZvira",
  "mounth",
  "statusPolicy",
  "minuySochen",
  "notes"
];

const ExcelImporter: React.FC = () => {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<number[]>([]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: "binary" });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const jsonData: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      if (jsonData.length > 0) {
        setHeaders(Object.keys(jsonData[0]));
        setRows(jsonData);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleMappingChange = (excelHeader: string, mappedField: string) => {
    setMapping((prev) => ({ ...prev, [excelHeader]: mappedField }));
  };

  const validateRow = (row: any) => {
    const required = ["firstNameCustomer", "lastNameCustomer", "IDCustomer", "company", "product", "mounth", "statusPolicy"];
    return required.every((key) => row[key] !== undefined && row[key] !== "");
  };

  const checkAllRows = (data: any[]) => {
    const invalids = data.reduce<number[]>((acc, row, idx) => {
      if (!validateRow(row)) acc.push(idx);
      return acc;
    }, []);
    setErrors(invalids);
  };

  const handleFieldChange = (rowIdx: number, field: string, value: string) => {
    const updatedRows = [...rows];
    updatedRows[rowIdx][field] = value;
    setRows(updatedRows);
    checkAllRows(updatedRows);
  };

  const handleDeleteRow = (rowIdx: number) => {
    const updatedRows = rows.filter((_, idx) => idx !== rowIdx);
    setRows(updatedRows);
    checkAllRows(updatedRows);
  };

  const handleImport = async () => {
    if (errors.length > 0) return alert("יש שורות עם שגיאות. תקן או מחק אותן לפני טעינה.");

    for (let i = 0; i < rows.length; i++) {
      const originalRow = rows[i];
      const mappedRow: any = {};

      for (const [excelCol, systemField] of Object.entries(mapping)) {
        mappedRow[systemField] = originalRow[excelCol];
      }

      try {
        const customerQuery = query(
          collection(db, 'customer'),
          where('IDCustomer', '==', mappedRow.IDCustomer),
          where('AgentId', '==', mappedRow.AgentId || "")
        );
        const customerSnapshot = await getDocs(customerQuery);
        let customerDocRef;

        if (customerSnapshot.empty) {
          customerDocRef = await addDoc(collection(db, "customer"), {
            AgentId: mappedRow.AgentId || "",
            firstNameCustomer: mappedRow.firstNameCustomer || "",
            lastNameCustomer: mappedRow.lastNameCustomer || "",
            IDCustomer: mappedRow.IDCustomer || "",
            parentID: "",
          });
          await updateDoc(customerDocRef, { parentID: customerDocRef.id });
        }

        await addDoc(collection(db, 'sales'), {
          agent: mappedRow.agent || "",
          AgentId: mappedRow.AgentId || "",
          workerId: mappedRow.workerId || "",
          workerName: mappedRow.workerName || "",
          firstNameCustomer: mappedRow.firstNameCustomer || "",
          lastNameCustomer: mappedRow.lastNameCustomer || "",
          IDCustomer: mappedRow.IDCustomer || "",
          company: mappedRow.company || "",
          product: mappedRow.product || "",
          insPremia: mappedRow.insPremia || 0,
          pensiaPremia: mappedRow.pensiaPremia || 0,
          pensiaZvira: mappedRow.pensiaZvira || 0,
          finansimPremia: mappedRow.finansimPremia || 0,
          finansimZvira: mappedRow.finansimZvira || 0,
          mounth: mappedRow.mounth || "",
          minuySochen: mappedRow.minuySochen === "כן",
          statusPolicy: mappedRow.statusPolicy || "",
          notes: mappedRow.notes || "",
          createdAt: serverTimestamp(),
          lastUpdateDate: serverTimestamp(),
        });
      } catch (error) {
        console.error(`שגיאה בשורה ${i + 1}:`, error);
      }
    }

    alert("הטעינה בוצעה בהצלחה!");
  };

  return (
    <div>
      <h2>ייבוא קובץ Excel</h2>
      <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} />

      {headers.length > 0 && (
        <div style={{ marginTop: "1rem" }}>
          <h3>מיפוי שדות</h3>
          <table>
            <thead>
              <tr>
                <th>עמודה בקובץ</th>
                <th>שדה במערכת</th>
              </tr>
            </thead>
            <tbody>
              {headers.map((header) => (
                <tr key={header}>
                  <td>{header}</td>
                  <td>
                    <select
                      value={mapping[header] || ""}
                      onChange={(e) => handleMappingChange(header, e.target.value)}
                    >
                      <option value="">בחר שדה</option>
                      {systemFields.map((field) => (
                        <option key={field} value={field}>{field}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ marginTop: "2rem" }}>
          <h3>כל הנתונים שהועלו ({rows.length} שורות)</h3>
          <table border={1}>
            <thead>
              <tr>
                {headers.map((h) => (
                  <th key={h}>{h}</th>
                ))}
                <th>מחיקה</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx} style={{ backgroundColor: errors.includes(idx) ? '#ffd6d6' : 'inherit' }}>
                  {headers.map((h) => (
                    <td key={h}>
                      <input
                        type="text"
                        value={row[h]}
                        onChange={(e) => handleFieldChange(idx, h, e.target.value)}
                      />
                    </td>
                  ))}
                  <td>
                    <button onClick={() => handleDeleteRow(idx)}>X</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={handleImport} disabled={errors.length > 0} style={{ marginTop: '1rem' }}>
            אשר טעינה
          </button>
          {errors.length > 0 && <p style={{ color: 'red' }}>יש שורות עם שגיאות – תקן או מחק אותן לפני טעינה.</p>}
        </div>
      )}
    </div>
  );
};

export default ExcelImporter;
