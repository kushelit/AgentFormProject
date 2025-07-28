// import admin from 'firebase-admin';
import * as admin from 'firebase-admin'; // ✅ תקני לפי התקן של CommonJS ו־TypeScript


if (!admin.apps.length) {
  let serviceAccount = {};
  try {
    const rawKey = process.env.FIREBASE_ADMIN_KEY_JSON || '{}';
    const parsed = JSON.parse(rawKey);

    // 🧠 המרה ידנית ל־\n אמיתי בתוך private_key
    if (parsed.private_key) {
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    }

    serviceAccount = parsed;

  } catch (e) {
    console.error("❌ Failed to parse FIREBASE_ADMIN_KEY_JSON:", e);
  }

  console.log("🔍 Raw SERVICE_ACCOUNT_KEY env:", process.env.FIREBASE_ADMIN_KEY_JSON?.slice(0, 50));
  console.log("🔍 Parsed serviceAccount keys:", Object.keys(serviceAccount));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
// ✅ ייבוא של מודול admin מ־firebase-admin
export { admin };
