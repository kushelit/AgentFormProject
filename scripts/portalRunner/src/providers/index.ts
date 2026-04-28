// scripts/portalRunner/src/providers/index.ts
import type { RunnerHandler } from "../types";

import { runClalAll } from "./clal/clal.all";
import { runMigdalAll } from "./migdal/migdal.all";
import { runPhoenixAll } from "./fenix/fenix.all";
import { runMenoraAll } from "./menora/menura.all";
import { runHarelAll } from "./harel/harel.all";
import { runAyalonAll } from "./ayalon/ayalon.all";
import { runMorAll } from "./mor/mor.all";
import { runMeitavAll } from "./meitav/meitav.all";
import { runAnalystAll } from "./analyst/analyst.all";
import { runAltshulerAll } from "./altshuler/altshuler.all";
import { runHachsharaAll } from "./hachshara/hachshara.all";


// import { runMigdalInsurance } from "./migdal/migdal.insurance";
// import { runFenixInsurance } from "./fenix/fenix.insurance";
// import { runMenoraNewNifraim } from "./menora/menura_new_nifraim";

export const providers: Record<string, RunnerHandler> = {
  // כלל
  clal_commissions_all: runClalAll, 
  migdal_commissions_all: runMigdalAll,
  fenix_commissions_all: runPhoenixAll,
  menora_commissions_all: runMenoraAll,
  harel_commissions_all: runHarelAll,
  ayalon_commissions_all: runAyalonAll,
  mor_commissions_all: runMorAll,
  meitav_commissions_all: runMeitavAll,
  analyst_commissions_all: runAnalystAll,
  altshuler_commissions_all: runAltshulerAll,
  hachshara_commissions_all: runHachsharaAll,
};