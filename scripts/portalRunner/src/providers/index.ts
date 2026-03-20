// scripts/portalRunner/src/providers/index.ts
import type { RunnerHandler } from "../types";

import { runClalAll } from "./clal/clal.all";
import { runMigdalAll } from "./migdal/migdal.all";
import { runPhoenixAll } from "./fenix/fenix.all";


// import { runMigdalInsurance } from "./migdal/migdal.insurance";
// import { runFenixInsurance } from "./fenix/fenix.insurance";
// import { runMenoraNewNifraim } from "./menora/menura_new_nifraim";

export const providers: Record<string, RunnerHandler> = {
  // כלל
  clal_commissions_all: runClalAll, 
  migdal_commissions_all: runMigdalAll,
  fenix_commissions_all: runPhoenixAll,


};