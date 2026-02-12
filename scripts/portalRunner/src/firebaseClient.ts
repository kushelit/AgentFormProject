// scripts/portalRunner/src/firebaseClient.ts
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

function reqEnv(name: string) {
  const v = String(process.env[name] || "").trim();
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function optEnv(name: string) {
  const v = String(process.env[name] || "").trim();
  return v || undefined;
}
export function initFirebaseClient() {
  if (!getApps().length) {
    initializeApp({
      apiKey:
        process.env.FIREBASE_API_KEY_RUNNER ||
        reqEnv("FIREBASE_API_KEY"),

      authDomain: reqEnv("FIREBASE_AUTH_DOMAIN"),
      projectId: reqEnv("FIREBASE_PROJECT_ID"),
      storageBucket: reqEnv("FIREBASE_STORAGE_BUCKET"),
      appId: optEnv("FIREBASE_APP_ID"),
    });
  }


  const auth = getAuth();
  const db = getFirestore();
  const storage = getStorage();

  // ✅ Functions (Callable) — חשוב ל-mintCustomTokenFromRefreshToken
  const region = optEnv("FIREBASE_FUNCTIONS_REGION") || "us-central1";
  const functions = getFunctions(undefined as any, region);

  // ✅ אם את רוצה לעבוד מול emulator מקומי:
  // FIREBASE_FUNCTIONS_EMULATOR=1
  // FIREBASE_FUNCTIONS_EMULATOR_HOST=localhost
  // FIREBASE_FUNCTIONS_EMULATOR_PORT=5001
  const useEmu = String(process.env.FIREBASE_FUNCTIONS_EMULATOR || "").trim() === "1";
  if (useEmu) {
    const host = optEnv("FIREBASE_FUNCTIONS_EMULATOR_HOST") || "localhost";
    const port = Number(process.env.FIREBASE_FUNCTIONS_EMULATOR_PORT || 5001);
    connectFunctionsEmulator(functions, host, port);
    console.log("[FirebaseClient] functions emulator:", `${host}:${port}`);
  } else {
    console.log("[FirebaseClient] functions region:", region);
  }

  return { auth, db, storage, functions };
}
