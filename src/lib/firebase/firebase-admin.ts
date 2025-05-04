import admin from 'firebase-admin';

if (!admin.apps.length) {
  let serviceAccount = {};
  try {
    serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT_KEY || '{}');
  } catch (e) {
    console.error("❌ Failed to parse SERVICE_ACCOUNT_KEY:", e);
  } 
  // 🪵 הוסיפי כאן:
console.log("🔍 Raw SERVICE_ACCOUNT_KEY env:", process.env.SERVICE_ACCOUNT_KEY);
console.log("🔍 Parsed serviceAccount keys:", Object.keys(serviceAccount));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export { admin };
