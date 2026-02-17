// scripts/portalRunner/src/providers/index.ts
import type { RunnerHandler } from "../types";
import { runClalBriut } from "./clal/clal.briut";
import { runMigdalInsurance } from "./migdal/migdal.insurance"; // ✅ חדש
import { runFenixInsurance } from "./fenix/fenix.insurance";
import { runMenoraNewNifraim } from "./menora/menura_new_nifraim";


export const providers: Record<string, RunnerHandler> = {
  // לפי מה שצילמת ב-Firestore:
  clal_briut: runClalBriut,
  migdal_insurance: runMigdalInsurance, 
  fenix_insurance: runFenixInsurance,
  menura_new_nifraim: runMenoraNewNifraim,


};
