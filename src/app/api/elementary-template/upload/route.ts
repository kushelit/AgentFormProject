import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { admin } from "@/lib/firebase/firebase-admin";
import { calcElementaryCommission } from "@/config/elementaryContractsConfig";

export const runtime = "nodejs";

// ─── עמודות התבנית (חייב להתאים בדיוק ל-generateElementaryTemplateExcel.ts) ──
const COL = {
  ID: 'תעודת זהות לקוח',
  FIRST: 'שם פרטי',
  LAST: 'שם משפחה',
  PHONE: 'טלפון',
  COMPANY: 'חברה',
  PRODUCT: 'מוצר',
  TRACK: 'מסלול (מוזל/רגיל — רק אם רלוונטי למוצר)',
  POLICY_NUMBER: 'מספר פוליסה (לא חובה)',
  LICENSE_OR_ADDRESS: 'רישוי / כתובת',
  START_DATE: 'תאריך תחילה (YYYY-MM-DD)',
  END_DATE: 'תאריך סיום (YYYY-MM-DD)',
  PREMIUM: 'פרמיה',
  COMMISSION_RATE: 'אחוז עמלה (רק לחברות ידניות)',
  STATUS: 'סטטוס',
  NOTES: 'הערות',
  REFERRER: 'נציג מפנה',
};

const EXAMPLE_ID = '123456789'; // ת"ז לדוגמה בתבנית — שורות עם הערך הזה מדולגות אוטומטית

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
  // ניסיון גיבוי: DD/MM/YYYY
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

    // ⚠️ agentId שווה תמיד ל-uid של הסוכן עצמו (גם כשהמעלה הוא עובד שלו),
    // ולכן users/{agentId} הוא תמיד מסמך הסוכן, עם agencies נכון ברמת הסוכנות.
    const userDoc = await db.collection("users").doc(agentId).get();
    const agencyId = String(userDoc.data()?.agencies ?? "");
    const isAgency4 = agencyId === "4";

    const arrayBuffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    const sheet = workbook.getWorksheet("פוליסות") || workbook.worksheets[0];
    if (!sheet) {
      return NextResponse.json({ error: "לא נמצאה לשונית באקסל" }, { status: 400 });
    }

    // ── מיפוי כותרת → אינדקס עמודה (עמיד בפני שינוי סדר עמודות) ──
    const headerRow = sheet.getRow(1);
    const colIndex: Record<string, number> = {};
    headerRow.eachCell((cell, idx) => {
      const text = String(cell.value || "").trim();
      if (text) colIndex[text] = idx;
    });

    const missingRequiredCols = [COL.ID, COL.FIRST, COL.LAST, COL.COMPANY, COL.PRODUCT, COL.PREMIUM]
      .filter((c) => !colIndex[c]);
    if (missingRequiredCols.length > 0) {
      return NextResponse.json(
        { error: `חסרות עמודות חובה בקובץ: ${missingRequiredCols.join(', ')}` },
        { status: 400 }
      );
    }

    // ── נתוני עזר ──
    const [companySnap, groupSnap, productSnap, contractsSnap, referrersSnap, customersSnap, statusSnap] = await Promise.all([
      db.collection("company").where("supportsElementary", "==", true).get(),
      db.collection("elementaryProductGroups").get(),
      db.collection("elementaryProducts").get(),
      db.collection("elementaryContracts").where("agentId", "==", agentId).get(),
      isAgency4
        ? db.collection("agentReferrers").where("agentId", "==", agentId).get()
        : Promise.resolve(null),
      db.collection("customer").where("AgentId", "==", agentId).get(),
      isAgency4
        ? db.collection("statusPolicy").where("isActive", "==", "1").get()
        : Promise.resolve(null),
    ]);

    const companies = companySnap.docs.map((d) => ({
      id: d.id,
      companyName: String(d.data().companyName || ""),
      elementaryManual: d.data().elementaryManual ?? false,
    }));
    const groupsById = new Map(groupSnap.docs.map((d) => [d.id, { id: d.id, label: String(d.data().label || "") }]));
    const products = productSnap.docs.map((d) => ({
      id: d.id,
      label: String(d.data().label || ""),
      productGroupId: String(d.data().productGroupId || ""),
      hasMozalTrack: d.data().hasMozalTrack ?? false,
    }));
    const contracts = contractsSnap.docs.map((d) => d.data() as any);
    const referrerNames = referrersSnap ? referrersSnap.docs.map((d) => String(d.data().name || "")) : [];
    const validStatusNames = statusSnap
      ? statusSnap.docs.map((d) => String(d.data().statusName || "")).filter(Boolean)
      : [];
    const existingCustomersByIdNum = new Map(
      customersSnap.docs.map((d) => [String(d.data().IDCustomer || "").trim(), { id: d.id, ...(d.data() as any) }])
    );

    type RowResult = { rowNumber: number; ok: boolean; error?: string; payload?: any; newCustomer?: any };
    const results: RowResult[] = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // כותרות

      const idCustomer = getCellText(row, colIndex[COL.ID]);
      if (!idCustomer) return; // שורה ריקה — מדלגים בשקט
      if (idCustomer === EXAMPLE_ID) return; // שורת הדוגמה מהתבנית

      const firstName = getCellText(row, colIndex[COL.FIRST]);
      const lastName = getCellText(row, colIndex[COL.LAST]);
      const phone = colIndex[COL.PHONE] ? getCellText(row, colIndex[COL.PHONE]) : "";
      const companyName = getCellText(row, colIndex[COL.COMPANY]);
      const productLabelRaw = getCellText(row, colIndex[COL.PRODUCT]);
      const trackRaw = colIndex[COL.TRACK] ? getCellText(row, colIndex[COL.TRACK]) : "";
      const policyNumber = getCellText(row, colIndex[COL.POLICY_NUMBER]);
      const licenseOrAddress = colIndex[COL.LICENSE_OR_ADDRESS] ? getCellText(row, colIndex[COL.LICENSE_OR_ADDRESS]) : "";
      const premiumRaw = getCellText(row, colIndex[COL.PREMIUM]);

      const errors: string[] = [];

      if (!/^\d{5,9}$/.test(idCustomer)) errors.push(`ת"ז לא תקינה: "${idCustomer}"`);
      if (!firstName) errors.push('חסר שם פרטי');
      if (!lastName) errors.push('חסר שם משפחה');
      const premium = Number(premiumRaw);
      if (!premiumRaw || isNaN(premium)) errors.push(`פרמיה לא תקינה: "${premiumRaw}"`);

      const matchedCompany = companies.find((c) => c.companyName === companyName);
      if (!matchedCompany) errors.push(`חברה לא מזוהה: "${companyName}" (או שאינה תומכת אלמנטרי)`);

      // ── מוצר: תומך גם ב"תווית בלבד" וגם ב"קבוצה — תווית" (כפי שמופיע בלשונית הרשימות) ──
      let matchedProduct = products.find((p) => p.label === productLabelRaw);
      if (!matchedProduct && productLabelRaw.includes(' — ')) {
        const labelOnly = productLabelRaw.split(' — ').slice(1).join(' — ').replace(/\s*\(.*\)$/, '').trim();
        matchedProduct = products.find((p) => p.label === labelOnly);
      }
      if (!matchedProduct) errors.push(`מוצר לא מזוהה: "${productLabelRaw}"`);

      let track: 'מוזל' | 'רגיל' | '' = '';
      if (matchedProduct?.hasMozalTrack) {
        if (trackRaw && trackRaw !== 'מוזל' && trackRaw !== 'רגיל') {
          errors.push(`מסלול לא תקין: "${trackRaw}" (מוזל/רגיל)`);
        } else {
          track = (trackRaw as any) || '';
        }
      }

      const startDateResult = colIndex[COL.START_DATE] ? parseDateCell(row, colIndex[COL.START_DATE]) : { value: '' };
      const endDateResult = colIndex[COL.END_DATE] ? parseDateCell(row, colIndex[COL.END_DATE]) : { value: '' };
      if (startDateResult.error) errors.push(startDateResult.error);
      if (endDateResult.error) errors.push(endDateResult.error);

      // ── שדות ספציפיים לסוכנות ──
      let commissionRateRaw = '';
      let statusPolicy = '';
      let notes = '';
      let referrerName = '';

      if (!isAgency4) {
        commissionRateRaw = colIndex[COL.COMMISSION_RATE] ? getCellText(row, colIndex[COL.COMMISSION_RATE]) : '';
      } else {
        statusPolicy = colIndex[COL.STATUS] ? getCellText(row, colIndex[COL.STATUS]) : '';
        notes = colIndex[COL.NOTES] ? getCellText(row, colIndex[COL.NOTES]) : '';
        referrerName = colIndex[COL.REFERRER] ? getCellText(row, colIndex[COL.REFERRER]) : '';

        if (statusPolicy && !validStatusNames.includes(statusPolicy)) {
          errors.push(`סטטוס לא תקין: "${statusPolicy}" (רשימת סטטוסים תקפים בלשונית "רשימות תקפות")`);
        }
        if (referrerName && !referrerNames.includes(referrerName)) {
          errors.push(`נציג מפנה לא מזוהה: "${referrerName}"`);
        }
      }

      if (errors.length > 0) {
        results.push({ rowNumber, ok: false, error: errors.join('; ') });
        return;
      }

      // ── רישוי/כתובת — תלוי בקבוצת המוצר (בדיוק כמו ElementaryTab.tsx) ──
      const groupId = matchedProduct!.productGroupId;
      const isCarGroup = groupId === 'car';
      const isHomeOrBusiness = groupId === 'home' || groupId === 'business';
      const licenseNumber = isCarGroup ? licenseOrAddress : '';
      const address = isHomeOrBusiness ? licenseOrAddress : '';

      // ── עמלה (agency3 בלבד) — זהה ל-calcCommission ב-ElementaryTab.tsx ──
      let commissionRate = '';
      let commission = '';
      let isManual = false;

      if (!isAgency4) {
        isManual = (matchedCompany!.elementaryManual ?? false) || matchedProduct!.id === 'ktav_sherut';
        if (isManual) {
          commissionRate = commissionRateRaw || '';
          commission = commissionRate ? String(Math.round(premium * (parseFloat(commissionRate) / 100))) : '';
        } else {
          const contract = contracts.find(
            (c) => c.productId === matchedProduct!.id && c.companyName === matchedCompany!.companyName && (c.track || '') === track
          );
          commissionRate = contract?.commissionRate || '';
          commission = commissionRate ? String(calcElementaryCommission(premium, parseFloat(commissionRate))) : '';
        }
      }

      const existingCustomer = existingCustomersByIdNum.get(idCustomer);
      const customerName = `${firstName} ${lastName}`.trim();

      const payload: any = {
        agentId,
        customerId: idCustomer,
        customerName,
        company: matchedCompany!.companyName,
        productId: matchedProduct!.id,
        productLabel: matchedProduct!.label,
        productGroupId: groupId,
        track,
        policyNumber,
        licenseNumber,
        address,
        startDate: startDateResult.value,
        endDate: endDateResult.value,
        premium: String(premium),
        commissionRate: isAgency4 ? '' : commissionRate,
        commission: isAgency4 ? '' : commission,
        isManual: isAgency4 ? false : isManual,
        statusPolicy: isAgency4 ? statusPolicy : '',
        notes: isAgency4 ? notes : '',
        referrerName: isAgency4 ? referrerName : '',
      };

      results.push({
        rowNumber,
        ok: true,
        payload,
        newCustomer: existingCustomer
          ? undefined
          : { AgentId: agentId, IDCustomer: idCustomer, firstNameCustomer: firstName, lastNameCustomer: lastName, phone, parentID: '' },
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

    // ── כתיבה בצ'אנקים של עד 400 (מרווח ביטחון מתחת למגבלת ה-500 של batch) ──
    const CHUNK = 400;
    let writeCount = 0;
    let newCustomerCount = 0;
    const createdCustomerIds = new Map<string, string>(); // idCustomer -> firestore doc id, למקרה שאותו לקוח חדש מופיע בכמה שורות בקובץ
    const runId = db.collection("importRuns").doc().id;

    for (let i = 0; i < validRows.length; i += CHUNK) {
      const chunk = validRows.slice(i, i + CHUNK);
      const batch = db.batch();

      for (const row of chunk) {
        if (row.newCustomer && !createdCustomerIds.has(row.payload.customerId)) {
          const customerRef = db.collection("customer").doc();
          batch.set(customerRef, { ...row.newCustomer, runId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
          batch.update(customerRef, { parentID: customerRef.id });
          createdCustomerIds.set(row.payload.customerId, customerRef.id);
          newCustomerCount++;
        }

        const policyRef = db.collection("elementaryPolicies").doc();
        batch.set(policyRef, { ...row.payload, runId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        writeCount++;
      }

      await batch.commit();
    }

    // ── רשומת סיכום לטעינה — מאפשרת לזהות ולמחוק את כל הטעינה הזו בעתיד ──
    await db.collection("importRuns").doc(runId).set({
      runId,
      agentId,
      agentName: userDoc.exists ? String(userDoc.data()?.name || "") : "",
      type: "elementary",
      targetCollection: "elementaryPolicies",
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
    console.error("elementary-template upload error:", error);
    return NextResponse.json({ error: "Failed to upload elementary template" }, { status: 500 });
  }
}