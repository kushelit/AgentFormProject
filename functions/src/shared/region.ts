// functions/src/shared/region.ts

export const PROJECT_ID =
  process.env.GCLOUD_PROJECT ||
  process.env.GCP_PROJECT ||
  (() => {
    try {
      const cfg = JSON.parse(process.env.FIREBASE_CONFIG || "{}");
      return String(cfg.projectId || "");
    } catch {
      return "";
    }
  })();

// ⚠️ Firestore locationId כמו nam5 הוא לא Region של Cloud Functions.
// בוחרים region קרוב:
// prod (nam5) -> us-central1
// test (europe-west1) -> europe-west1
export const FUNCTIONS_REGION =
  PROJECT_ID === "agentsale-693e8" ?
    "us-central1" :
    "europe-west1";
