import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { admin } from "@/lib/firebase/firebase-admin";

export const runtime = "nodejs";

const PENSION_FINANCE_GROUPS = ["1", "4", "6"]; // כל השאר = סיכונים
const EXAMPLE_ID = '123456789';

const COL = {
  ID: 'תעודת זהות לקוח',
  FIRST: 'שם פרטי',
  LAST: 'שם משפחה',
  COMPANY: 'חברה',
  PRODUCT: 'מוצר',
  MOUNTH: 'חודש תפוקה (YYYY-MM-DD)',
  STATUS: 'סטטוס עסקה',
  POLICY_NUMBER: 'מספר פוליסה (לא חובה)',
  MINUY: 'מינוי סוכן (כן/לא)',
  WORKER: 'עובד',
  SOURCE_LEAD: 'מקור ליד',
  CANCELLATION_DATE: 'תאריך ביטול (YYYY-MM-DD)',
  INS_PREMIA: 'פרמיית ביטוח',
  NOTES: 'הערות',
  HEKEF_PAID: 'שולם היקף',
  NIUD_PAID: 'שולם ניוד',
  DEPOSIT_STATUS: 'סטטוס הפקדה',
  REFERRER: 'נציג מפנה',
  DISCOUNT_PERCENT: 'אחוז הנחה',
  CANCELLATION_COMPANY: 'חברה לביטול',
  NEEDS_CORRECTION: 'נדרש תיקון (כן/לא — רק לפוליסה פעילה)',
};

function getCellText(row: ExcelJS.Row, colIndex: number): string {
  const value = row.getCell(colIndex).value;
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().split("T")[0];
  if (typeof value === "object" && "text" in (value as any)) return String((value as any).text || "").trim();
  if (typeof value === "object" && "result" in (value as any)) return String((value as any).result ?? "").trim();
  return String(value).trim();
}

function parseDateCell(row: ExcelJS.Row, colIndex: number): { value: string; error?: string } {
  const raw = getCellText(row, colIndex);
  if (!raw) return { value: "" };
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { value: raw };
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return { value: `${m[3]}-${m[2]}-${m[1]}` };
  return { value: "", error: `תאריך לא תקין: "${raw}" (ציפינו YYYY-MM-DD)` };
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const agentId = String(formData.get("agentId") || "").trim();

    if (!file || !agentId) {
      return NextResponse.json({ error: "missing file or agentId" }, { status: 400 });
    }

    const db = admin.firestore();

    const userDoc = await db.collection("users").doc(agentId).get();
    const agencyId = String(userDoc.data()?.agencies ?? "");
    const isAgency4 = agencyId === "4";
    const agentName = String(userDoc.data()?.name || "");

    const arrayBuffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    const sheet = workbook.getWorksheet("עסקאות - סיכונים") || workbook.worksheets[0];
    if (!sheet) {
      return NextResponse.json({ error: "לא נמצאה לשונית באקסל" }, { status: 400 });
    }

    const headerRow = sheet.getRow(1);
    const colIndex: Record<string, number> = {};
    headerRow.eachCell((cell, idx) => {
      const text = String(cell.value || "").trim();
      if (text) colIndex[text] = idx;
    });

    const missingRequiredCols = [COL.ID, COL.FIRST, COL.LAST, COL.COMPANY, COL.PRODUCT, COL.MOUNTH, COL.STATUS]
      .filter((c) => !colIndex[c]);
    if (missingRequiredCols.length > 0) {
      return NextResponse.json(
        { error: `חסרות עמודות חובה בקובץ: ${missingRequiredCols.join(', ')}` },
        { status: 400 }
      );
    }

    // ── נתוני עזר ──
    const [
      companySnap, productSnap, statusSnap, workerSnap, sourceLeadSnap, customersSnap,
      referrersSnap, paymentSnap, depositSnap,
    ] = await Promise.all([
      db.collection("company").get(),
      db.collection("product").get(),
      db.collection("statusPolicy").where("isActive", "==", "1").get(),
      db.collection("users").where("agentId", "==", agentId).where("role", "in", ["worker", "agent", "manager"]).get(),
      db.collection("sourceLead").where("AgentId", "==", agentId).where("statusLead", "==", true).get(),
      db.collection("customer").where("AgentId", "==", agentId).get(),
      isAgency4 ? db.collection("agentReferrers").where("agentId", "==", agentId).get() : Promise.resolve(null),
      !isAgency4 ? db.collection("mdPaymentStatus").get() : Promise.resolve(null),
      !isAgency4 ? db.collection("mdDepositStatus").get() : Promise.resolve(null),
    ]);

    const companyNames = companySnap.docs.map((d) => String(d.data().companyName || "")).filter(Boolean);

    const products = productSnap.docs
      .map((d) => ({ id: d.id, name: String(d.data().productName || ""), productGroup: String(d.data().productGroup ?? "") }))
      .filter((p) => !PENSION_FINANCE_GROUPS.includes(p.productGroup));

    const validStatusNames = statusSnap.docs.map((d) => String(d.data().statusName || "")).filter(Boolean);
    const workers = workerSnap.docs.map((d) => ({ id: d.id, name: String(d.data().name || "") }));
    const sourceLeads = sourceLeadSnap.docs.map((d) => ({ id: d.id, name: String(d.data().sourceLead || "") }));
    const existingCustomersByIdNum = new Map(
      customersSnap.docs.map((d) => [String(d.data().IDCustomer || "").trim(), { id: d.id, ...(d.data() as any) }])
    );
    const referrerNames = referrersSnap ? referrersSnap.docs.map((d) => String(d.data().name || "")) : [];
    const paymentNames = paymentSnap ? paymentSnap.docs.map((d) => String(d.data().name || "")) : [];
    const depositNames = depositSnap ? depositSnap.docs.map((d) => String(d.data().name || "")) : [];

    type RowResult = { rowNumber: number; ok: boolean; error?: string; payload?: any; newCustomer?: any };
    const results: RowResult[] = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const idCustomer = getCellText(row, colIndex[COL.ID]);
      if (!idCustomer) return;
      if (idCustomer === EXAMPLE_ID) return;

      const firstName = getCellText(row, colIndex[COL.FIRST]);
      const lastName = getCellText(row, colIndex[COL.LAST]);
      const companyName = getCellText(row, colIndex[COL.COMPANY]);
      const productName = getCellText(row, colIndex[COL.PRODUCT]);
      const statusPolicy = getCellText(row, colIndex[COL.STATUS]);
      const policyNumber = colIndex[COL.POLICY_NUMBER] ? getCellText(row, colIndex[COL.POLICY_NUMBER]) : "";
      const minuyRaw = colIndex[COL.MINUY] ? getCellText(row, colIndex[COL.MINUY]) : "";
      const workerNameRaw = colIndex[COL.WORKER] ? getCellText(row, colIndex[COL.WORKER]) : "";
      const sourceLeadRaw = colIndex[COL.SOURCE_LEAD] ? getCellText(row, colIndex[COL.SOURCE_LEAD]) : "";
      const notes = colIndex[COL.NOTES] ? getCellText(row, colIndex[COL.NOTES]) : "";

      const errors: string[] = [];

      if (!/^\d{5,9}$/.test(idCustomer)) errors.push(`ת"ז לא תקינה: "${idCustomer}"`);
      if (!firstName) errors.push('חסר שם פרטי');
      if (!lastName) errors.push('חסר שם משפחה');

      if (!companyNames.includes(companyName)) errors.push(`חברה לא מזוהה: "${companyName}"`);

      const matchedProduct = products.find((p) => p.name === productName);
      if (!matchedProduct) errors.push(`מוצר לא מזוהה, או שהוא מוצר פנסיה/פיננסים (שייך ללשונית אחרת): "${productName}"`);

      const mounthResult = parseDateCell(row, colIndex[COL.MOUNTH]);
      if (!mounthResult.value) errors.push(mounthResult.error || 'חסר חודש תפוקה');

      if (!validStatusNames.includes(statusPolicy)) errors.push(`סטטוס עסקה לא תקין: "${statusPolicy}"`);

      let minuySochen = false;
      if (minuyRaw && minuyRaw !== 'כן' && minuyRaw !== 'לא') {
        errors.push(`מינוי סוכן לא תקין: "${minuyRaw}" (כן/לא)`);
      } else {
        minuySochen = minuyRaw === 'כן';
      }

      let workerId = "";
      let workerName = "";
      if (workerNameRaw) {
        const matchedWorker = workers.find((w) => w.name === workerNameRaw);
        if (!matchedWorker) {
          errors.push(`עובד לא מזוהה: "${workerNameRaw}"`);
        } else {
          workerId = matchedWorker.id;
          workerName = matchedWorker.name;
        }
      }

      let sourceValue = "";
      if (sourceLeadRaw) {
        const matchedSourceLead = sourceLeads.find((s) => s.name === sourceLeadRaw);
        if (!matchedSourceLead) {
          errors.push(`מקור ליד לא מזוהה: "${sourceLeadRaw}"`);
        } else {
          sourceValue = matchedSourceLead.id;
        }
      }

      const cancellationResult = colIndex[COL.CANCELLATION_DATE]
        ? parseDateCell(row, colIndex[COL.CANCELLATION_DATE])
        : { value: '' };
      if (cancellationResult.error) errors.push(cancellationResult.error);

      let insPremia = 0;
      if (colIndex[COL.INS_PREMIA]) {
        const raw = getCellText(row, colIndex[COL.INS_PREMIA]);
        if (raw) {
          const n = Number(raw);
          if (isNaN(n)) errors.push(`ערך לא מספרי בעמודת "פרמיית ביטוח": "${raw}"`);
          else insPremia = n;
        }
      }

      // ── שדות agency3 ──
      let hekefPaid = "";
      let niudPaid = "";
      let depositStatus = "";
      if (!isAgency4) {
        hekefPaid = colIndex[COL.HEKEF_PAID] ? getCellText(row, colIndex[COL.HEKEF_PAID]) : "";
        niudPaid = colIndex[COL.NIUD_PAID] ? getCellText(row, colIndex[COL.NIUD_PAID]) : "";
        depositStatus = colIndex[COL.DEPOSIT_STATUS] ? getCellText(row, colIndex[COL.DEPOSIT_STATUS]) : "";
        if (hekefPaid && !paymentNames.includes(hekefPaid)) errors.push(`"שולם היקף" לא תקין: "${hekefPaid}"`);
        if (niudPaid && !paymentNames.includes(niudPaid)) errors.push(`"שולם ניוד" לא תקין: "${niudPaid}"`);
        if (depositStatus && !depositNames.includes(depositStatus)) errors.push(`"סטטוס הפקדה" לא תקין: "${depositStatus}"`);
      }

      // ── שדות agency4 (סיכונים) ──
      let referrerName = "";
      let discountPercent = "";
      let cancellationCompany = "";
      let needsCorrection = false;
      if (isAgency4) {
        referrerName = colIndex[COL.REFERRER] ? getCellText(row, colIndex[COL.REFERRER]) : "";
        if (referrerName && !referrerNames.includes(referrerName)) errors.push(`נציג מפנה לא מזוהה: "${referrerName}"`);

        discountPercent = colIndex[COL.DISCOUNT_PERCENT] ? getCellText(row, colIndex[COL.DISCOUNT_PERCENT]) : "";
        if (discountPercent && isNaN(Number(discountPercent))) errors.push(`אחוז הנחה לא מספרי: "${discountPercent}"`);

        cancellationCompany = colIndex[COL.CANCELLATION_COMPANY] ? getCellText(row, colIndex[COL.CANCELLATION_COMPANY]) : "";
        if (cancellationCompany && !companyNames.includes(cancellationCompany)) errors.push(`חברה לביטול לא מזוהה: "${cancellationCompany}"`);

        const needsCorrectionRaw = colIndex[COL.NEEDS_CORRECTION] ? getCellText(row, colIndex[COL.NEEDS_CORRECTION]) : "";
        if (needsCorrectionRaw && needsCorrectionRaw !== 'כן' && needsCorrectionRaw !== 'לא') {
          errors.push(`"נדרש תיקון" לא תקין: "${needsCorrectionRaw}" (כן/לא)`);
        } else {
          // ⚠️ רלוונטי רק לפוליסה פעילה — בדיוק כמו שהצ'קבוקס מוצג רק אז ב-DealFormModal.tsx
          needsCorrection = statusPolicy === 'פעילה' && needsCorrectionRaw === 'כן';
        }
      }

      if (errors.length > 0) {
        results.push({ rowNumber, ok: false, error: errors.join('; ') });
        return;
      }

      const existingCustomer = existingCustomersByIdNum.get(idCustomer);

      const payload: any = {
        agent: agentName,
        AgentId: agentId,
        workerId,
        workerName,
        firstNameCustomer: firstName,
        lastNameCustomer: lastName,
        IDCustomer: idCustomer,
        company: companyName,
        product: matchedProduct!.name,
        insPremia,
        pensiaPremia: 0,
        pensiaZvira: 0,
        finansimPremia: 0,
        finansimZvira: 0,
        mounth: mounthResult.value,
        cancellationDate: cancellationResult.value,
        minuySochen,
        statusPolicy,
        notes,
        policyNumber,
        sourceValue,
        hekefPaid: isAgency4 ? "" : hekefPaid,
        niudPaid: isAgency4 ? "" : niudPaid,
        depositStatus: isAgency4 ? "" : depositStatus,
        referrerName: isAgency4 ? referrerName : "",
        discountPercent: isAgency4 ? discountPercent : "",
        cancellationCompany: isAgency4 ? cancellationCompany : "",
        needsCorrection: isAgency4 ? needsCorrection : false,
        sourceApp: "riskImport",
      };

      results.push({
        rowNumber,
        ok: true,
        payload,
        newCustomer: existingCustomer
          ? undefined
          : { AgentId: agentId, IDCustomer: idCustomer, firstNameCustomer: firstName, lastNameCustomer: lastName, sourceValue, parentID: '' },
      });
    });

    const validRows = results.filter((r) => r.ok);
    const invalidRows = results.filter((r) => !r.ok);

    if (validRows.length === 0) {
      return NextResponse.json(
        { error: "לא נמצאו שורות תקינות לטעינה", invalidRows: invalidRows.map((r) => ({ row: r.rowNumber, error: r.error })) },
        { status: 400 }
      );
    }

    const CHUNK = 400;
    let writeCount = 0;
    let newCustomerCount = 0;
    const createdCustomerIds = new Map<string, string>();
    const runId = db.collection("importRuns").doc().id;

    for (let i = 0; i < validRows.length; i += CHUNK) {
      const chunk = validRows.slice(i, i + CHUNK);
      const batch = db.batch();

      for (const row of chunk) {
        if (row.newCustomer && !createdCustomerIds.has(row.payload.IDCustomer)) {
          const customerRef = db.collection("customer").doc();
          batch.set(customerRef, { ...row.newCustomer, runId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
          batch.update(customerRef, { parentID: customerRef.id });
          createdCustomerIds.set(row.payload.IDCustomer, customerRef.id);
          newCustomerCount++;
        }

        const saleRef = db.collection("sales").doc();
        batch.set(saleRef, {
          ...row.payload,
          runId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          lastUpdateDate: admin.firestore.FieldValue.serverTimestamp(),
        });
        writeCount++;
      }

      await batch.commit();
    }

    await db.collection("importRuns").doc(runId).set({
      runId,
      agentId,
      agentName,
      type: "risk",
      targetCollection: "sales",
      recordsCount: writeCount,
      newCustomerCount,
      failedCount: invalidRows.length,
      failedRows: invalidRows.map((r) => ({ row: r.rowNumber, error: r.error })),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      deletedAt: null,
    });

    return NextResponse.json({
      ok: true,
      runId,
      writeCount,
      newCustomerCount,
      invalidCount: invalidRows.length,
      invalidRows: invalidRows.map((r) => ({ row: r.rowNumber, error: r.error })),
    });
  } catch (error) {
    console.error("risk-template upload error:", error);
    return NextResponse.json({ error: "Failed to upload risk template" }, { status: 500 });
  }
}