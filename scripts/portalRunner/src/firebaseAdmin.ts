import "dotenv/config";
import fs from "fs";
import path from "path";
import admin from "firebase-admin";

export function initAdmin() {
  if (admin.apps.length) return;

  console.log("[Runner] cwd:", process.cwd());
  console.log("[Runner] env bucket raw:", process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
  


  const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucket) throw new Error("Missing NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET");

  // Local mode (service account json)
  const keyPath = process.env.FIREBASE_ADMIN_KEY_PATH;
  if (keyPath) {
    const fullPath = path.resolve(process.cwd(), keyPath);
    const rawFile = fs.readFileSync(fullPath, "utf8");
    const parsed: any = JSON.parse(rawFile);

    console.log("[Runner] serviceAccount project_id:", parsed.project_id);
    console.log("[Runner] serviceAccount client_email:", parsed.client_email);

    admin.initializeApp({
      credential: admin.credential.cert(parsed),
      storageBucket: bucket,
    });
    return;
  }

  // Cloud Run mode (ADC)
  console.log("[Runner] initAdmin via ADC (Cloud Run)");
  admin.initializeApp({
    // אפשר גם בלי השורה הזו, אבל זה תקין
    credential: admin.credential.applicationDefault(),
    storageBucket: bucket,
  });
}
