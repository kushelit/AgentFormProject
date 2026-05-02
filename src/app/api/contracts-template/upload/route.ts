import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { admin } from "@/lib/firebase/firebase-admin";
import { normalizeCommissionForSave, cleanNumericInput } from "@/utils/contractsTablesNormalize";

export const runtime = "nodejs";

const HIDDEN_START_COL = 30;

function getCellValue(row: ExcelJS.Row, index: number): string {
  const value = row.getCell(index).value;
  if (value == null) return "";
  if (typeof value === "object" && "text" in value) return String((value as any).text || "").trim();
  return String(value).trim();
}

function getVatModeByTableKey(tableKey: string): "includes_vat" | "excludes_vat" {
  return tableKey === "risk" ? "excludes_vat" : "includes_vat";
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file    = formData.get("file") as File | null;
    const agentId = String(formData.get("agentId") || "").trim();

    if (!file || !agentId) {
      return NextResponse.json({ error: "missing file or agentId" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    const sheet = workbook.getWorksheet("הסכמים") || workbook.worksheets[0];
    if (!sheet) {
      return NextResponse.json({ error: "לא נמצאה לשונית באקסל" }, { status: 400 });
    }

    const db = admin.firestore();

    const [productSnap, existingSnap] = await Promise.all([
      db.collection("product").get(),
      db.collection("contracts").where("AgentId", "==", agentId).get(),
    ]);

    const products = productSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
    const existingContracts = existingSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

    type RowData = {
      tableKey: string;
      sectionKey: string;
      productGroupId: string;
      productSubGroupId: string;
      commissionType: string;
      minuySochen: boolean;
      valueMode: string;
      vatMode: string;
      defaultValue: string;
      companyValues: Record<string, string>;
    };

    const rowDataList: RowData[] = [];
    let currentCompanyMap = new Map<number, string>();

    sheet.eachRow((row, rowNumber) => {
      const col1 = getCellValue(row, 1);

      // שורת כותרות עמודות
      if (col1 === "סוג עמלה") {
        currentCompanyMap = new Map();
        for (let col = 3; col < HIDDEN_START_COL; col++) {
          const name = getCellValue(row, col);
          if (name) currentCompanyMap.set(col, name);
        }
        return;
      }

      // שורת עמלה — יש metadata בעמודה 30
      const tableKey = getCellValue(row, HIDDEN_START_COL);

      // console.log(`row ${rowNumber}: col1="${col1}" tableKey="${tableKey}" minuySochen="${getCellValue(row, HIDDEN_START_COL + 5)}"`);

      if (!tableKey) return;

      const sectionKey        = getCellValue(row, HIDDEN_START_COL + 1);
      const commissionType    = getCellValue(row, HIDDEN_START_COL + 2);
      const productGroupId    = getCellValue(row, HIDDEN_START_COL + 3);
      const productSubGroupId = getCellValue(row, HIDDEN_START_COL + 4);
      const minuySochenStr    = getCellValue(row, HIDDEN_START_COL + 5);
      const valueMode         = getCellValue(row, HIDDEN_START_COL + 6) || "percent";
      const vatMode           = getCellValue(row, HIDDEN_START_COL + 7) || getVatModeByTableKey(tableKey);

      if (!commissionType || !productGroupId) return;

      const defaultValue = getCellValue(row, 2);

      const companyValues: Record<string, string> = {};
      currentCompanyMap.forEach((companyName, col) => {
        const val = getCellValue(row, col);
        if (val) companyValues[companyName] = val;
      });

      rowDataList.push({
        tableKey,
        sectionKey,
        productGroupId,
        productSubGroupId,
        commissionType,
        minuySochen: minuySochenStr === "true",
        valueMode,
        vatMode,
        defaultValue,
        companyValues,
      });
    });

    const defaultPayloads = new Map<string, any>();
    const companyPayloads = new Map<string, any>();

    for (const rowData of rowDataList) {
      const {
        tableKey, productGroupId, productSubGroupId,
        commissionType, minuySochen, valueMode, vatMode,
        defaultValue, companyValues,
      } = rowData;

      const effectiveVatMode  = vatMode as "includes_vat" | "excludes_vat";
      const effectiveValueMode = valueMode as "percent" | "per_million";

      // ── ברירת מחדל ──
      if (defaultValue && cleanNumericInput(defaultValue)) {
        const normalized = normalizeCommissionForSave(defaultValue, effectiveValueMode, effectiveVatMode);
        const key = `${productGroupId}__${minuySochen}`;
        const existing = defaultPayloads.get(key) || {
          AgentId: agentId,
          company: "",
          productsGroup: productGroupId,
          product: "",
          minuySochen,
          commissionHekef: "",
          commissionNifraim: "",
          commissionNiud: "",
          commissionHekefDisplay: "",
          commissionNifraimDisplay: "",
          commissionNiudDisplay: "",
          commissionHekefDisplayVatIncluded: effectiveVatMode === "includes_vat",
          commissionNifraimDisplayVatIncluded: effectiveVatMode === "includes_vat",
          commissionNiudDisplayVatIncluded: effectiveVatMode === "includes_vat",
        };
        if (commissionType === "hekef") {
          existing.commissionHekef = normalized.normalizedPercentNet;
          existing.commissionHekefDisplay = defaultValue;
        } else if (commissionType === "nifraim") {
          existing.commissionNifraim = normalized.normalizedPercentNet;
          existing.commissionNifraimDisplay = defaultValue;
        } else if (commissionType === "niud") {
          existing.commissionNiud = normalized.normalizedPercentNet;
          existing.commissionNiudDisplay = defaultValue;
        }
        defaultPayloads.set(key, existing);
      }

      // ── חברות ──
      for (const [companyName, rawValue] of Object.entries(companyValues)) {
        if (!cleanNumericInput(rawValue)) continue;
        const normalized = normalizeCommissionForSave(rawValue, effectiveValueMode, effectiveVatMode);

        const productsForSection = products.filter((p: any) => {
          const sameGroup    = String(p.productGroup) === productGroupId;
          const sameSubGroup = productSubGroupId
            ? String(p.productSubGroupId || "") === productSubGroupId
            : true;
          return sameGroup && sameSubGroup;
        });

        for (const product of productsForSection) {
          const key = `${companyName}__${product.productName}__${minuySochen}`;
          const existing = companyPayloads.get(key) || {
            AgentId: agentId,
            company: companyName,
            productsGroup: "",
            product: product.productName,
            minuySochen,
            commissionHekef: "",
            commissionNifraim: "",
            commissionNiud: "",
            commissionHekefDisplay: "",
            commissionNifraimDisplay: "",
            commissionNiudDisplay: "",
            commissionHekefDisplayVatIncluded: effectiveVatMode === "includes_vat",
            commissionNifraimDisplayVatIncluded: effectiveVatMode === "includes_vat",
            commissionNiudDisplayVatIncluded: effectiveVatMode === "includes_vat",
          };
          if (commissionType === "hekef") {
            existing.commissionHekef = normalized.normalizedPercentNet;
            existing.commissionHekefDisplay = rawValue;
          } else if (commissionType === "nifraim") {
            existing.commissionNifraim = normalized.normalizedPercentNet;
            existing.commissionNifraimDisplay = rawValue;
          } else if (commissionType === "niud") {
            existing.commissionNiud = normalized.normalizedPercentNet;
            existing.commissionNiudDisplay = rawValue;
          }
          companyPayloads.set(key, existing);
        }
      }
    }

    const batch = db.batch();
    let writeCount = 0;

    const upsert = (matchFn: (c: any) => boolean, payload: any) => {
      const matches = existingContracts.filter(matchFn);
      if (matches.length > 0) {
        batch.update(db.collection("contracts").doc(matches[0].id), payload);
        matches.slice(1).forEach((dup: any) => {
          batch.delete(db.collection("contracts").doc(dup.id));
        });
      } else {
        batch.set(db.collection("contracts").doc(), payload);
      }
      writeCount++;
    };

    for (const payload of defaultPayloads.values()) {
      upsert(
        (c) =>
          c.AgentId === agentId &&
          c.company === "" &&
          c.product === "" &&
          c.productsGroup === payload.productsGroup &&
          Boolean(c.minuySochen) === payload.minuySochen,
        payload
      );
    }

    for (const payload of companyPayloads.values()) {
      upsert(
        (c) =>
          c.AgentId === agentId &&
          c.company === payload.company &&
          c.product === payload.product &&
          c.productsGroup === "" &&
          Boolean(c.minuySochen) === payload.minuySochen,
        payload
      );
    }

    if (writeCount > 0) await batch.commit();

    return NextResponse.json({ ok: true, writeCount });
  } catch (error) {
    // console.error("contracts-template upload error:", error);
    return NextResponse.json({ error: "Failed to upload contracts template" }, { status: 500 });
  }
}