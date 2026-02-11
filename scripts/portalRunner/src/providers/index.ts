// scripts/portalRunner/src/providers/index.ts
import type { RunnerHandler } from "../types";
import { runClalBriut } from "./clal/clal.briut";
import { runMigdalInsurance } from "./migdal/migdal.insurance"; // ✅ חדש

export const providers: Record<string, RunnerHandler> = {
  // לפי מה שצילמת ב-Firestore:
  clal_briut: runClalBriut,

  // לפי commissionTemplates.migdal_insurance.automationClass:
  migdal_insurance: runMigdalInsurance, // ✅ חדש
};
