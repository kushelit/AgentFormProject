import * as XLSX from "xlsx";
import type { Firestore } from "firebase/firestore";
import type { MultiSheetImportProfile } from "@/types/MultiSheetImportProfile";
import { matchSheetToProfile, isIgnoredSheet } from "./matchSheetToProfile";
import { getCommissionTemplateConfig } from "@/lib/commissionTemplates/getCommissionTemplateConfig";
import { buildEffectiveMapping } from "./buildEffectiveMapping";

export type MultiSheetParsedResult = {
  rows: any[];
  matchedSheets: Array<{
    sheetName: string;
    templateId: string;
    rowsCount: number;
    status: "done" | "skipped_empty";
  }>;
  unmatchedSheets: string[];
  ignoredSheets: string[];
};

type ParseMultiSheetWorkbookParams = {
  db: Firestore;
  workbook: XLSX.WorkBook;
  profile: MultiSheetImportProfile;
  selectedAgentId: string;
  selectedCompanyId?: string;
  selectedCompanyName?: string;
  standardizeSheetRows: (params: {
    jsonData: any[];
    mapping: Record<string, string>;
    templateId: string;
    sourceFileName: string;
    selectedAgentId: string;
    selectedCompanyId?: string;
    selectedCompanyName?: string;
    fallbackProduct?: string;
    sheetName: string;
  }) => any[];
};

export async function parseMultiSheetWorkbook(
  params: ParseMultiSheetWorkbookParams
): Promise<MultiSheetParsedResult> {
  const {
    db,
    workbook,
    profile,
    selectedAgentId,
    selectedCompanyId,
    selectedCompanyName,
    standardizeSheetRows,
  } = params;

  const allRows: any[] = [];
  const matchedSheets: MultiSheetParsedResult["matchedSheets"] = [];
  const unmatchedSheets: string[] = [];
  const ignoredSheets: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    if (isIgnoredSheet(sheetName, profile.ignoreSheets)) {
      ignoredSheets.push(sheetName);
      continue;
    }

    const matchedRule = matchSheetToProfile(sheetName, profile);
    if (!matchedRule) {
      unmatchedSheets.push(sheetName);
      continue;
    }

    console.log("[parseMultiSheetWorkbook] sheetName =", sheetName);
    console.log("[parseMultiSheetWorkbook] matchedRule =", matchedRule);
    console.log("[parseMultiSheetWorkbook] matchedRule.templateId =", matchedRule?.templateId);

    if (!matchedRule?.templateId) {
      console.error("[parseMultiSheetWorkbook] missing templateId for rule", {
        sheetName,
        matchedRule,
      });
      unmatchedSheets.push(sheetName);
      continue;
    }

    const templateConfig = await getCommissionTemplateConfig(
      db,
      matchedRule.templateId
    );

    if (!templateConfig) {
      unmatchedSheets.push(sheetName);
      continue;
    }

    const effectiveMapping = buildEffectiveMapping({
      baseMapping: templateConfig.fields,
      overrideSystemFields: matchedRule.overrideSystemFields,
    });

    const ws = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(ws, {
      defval: "",
      raw: true,
    });

    if (!jsonData.length) {
      matchedSheets.push({
        sheetName,
        templateId: matchedRule.templateId,
        rowsCount: 0,
        status: "skipped_empty",
      });
      continue;
    }

    const standardizedRows = standardizeSheetRows({
      jsonData,
      mapping: effectiveMapping,
      templateId: matchedRule.templateId,
      sourceFileName: sheetName,
      selectedAgentId,
      selectedCompanyId: templateConfig.companyId || selectedCompanyId,
      selectedCompanyName: templateConfig.companyName || selectedCompanyName,
      fallbackProduct: templateConfig.fallbackProduct,
      sheetName,
    });

    if (!standardizedRows.length) {
      matchedSheets.push({
        sheetName,
        templateId: matchedRule.templateId,
        rowsCount: 0,
        status: "skipped_empty",
      });
      continue;
    }

    allRows.push(...standardizedRows);

    matchedSheets.push({
      sheetName,
      templateId: matchedRule.templateId,
      rowsCount: standardizedRows.length,
      status: "done",
    });
  }

  return {
    rows: allRows,
    matchedSheets,
    unmatchedSheets,
    ignoredSheets,
  };
}