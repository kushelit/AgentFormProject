import admin from 'firebase-admin';

if (!admin.apps.length) {
  let serviceAccount = {};
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_KEY_JSON || '{}');
  } catch (e) {
    console.error("❌ Failed to parse FIREBASE_ADMIN_KEY_JSON:", e);
  } 
  // 🪵 הוסיפי כאן:
console.log("🔍 Raw SERVICE_ACCOUNT_KEY env:", process.env.FIREBASE_ADMIN_KEY_JSON);
console.log("🔍 Parsed serviceAccount keys:", Object.keys(serviceAccount));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export { admin };
