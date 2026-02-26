// scripts/portalRunner/src/providers/index.ts
import type { RunnerHandler } from "../types";

import { runClalBriut } from "./clal/clal.briut";
import { runClalAll } from "./clal/clal.all";

import { runMigdalInsurance } from "./migdal/migdal.insurance";
import { runFenixInsurance } from "./fenix/fenix.insurance";
import { runMenoraNewNifraim } from "./menora/menura_new_nifraim";

export const providers: Record<string, RunnerHandler> = {
  // כלל
  clal_briut: runClalBriut,
  clal_commissions_all: runClalAll, // ✅ חדש: מוריד 4 קבצים בריצה אחת

  // אחרים
  migdal_insurance: runMigdalInsurance,
  fenix_insurance: runFenixInsurance,
  menura_new_nifraim: runMenoraNewNifraim,
};