// scripts/portalRunner/src/loginCli.ts
import readline from "readline";
import {
  signInWithEmailAndPassword,
  signInWithCustomToken,
  type UserCredential,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import {
  readSession,
  writeSession,
  clearSession,
  getSessionFilePath,
} from "./sessionStore";

function ask(q: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(q, (ans) => {
      rl.close();
      resolve(String(ans || "").trim());
    })
  );
}

function s(v: any) {
  return String(v ?? "").trim();
}

function pickRefreshToken(cred: UserCredential): string {
  const u: any = cred?.user as any;

  const a = s(u?.stsTokenManager?.refreshToken);
  if (a) return a;

  const b = s(u?.refreshToken);
  if (b) return b;

  return "";
}

function normalizePairingCode(code: string) {
  return String(code || "").trim().replace(/\s+/g, "").toUpperCase();
}

/**
 * ✅ מוצרי:
 * - ניסיון "התחברות שקטה" ע"י Session שמור (refreshToken -> customToken)
 * - אם אין session או נכשל -> התחברות פעם ראשונה באמצעות Pairing Code (מתוך MagicSale)
 * - (אופציונלי) fallback ל-email/password רק לפיתוח אם RUNNER_ALLOW_PASSWORD_LOGIN=1
 */
export async function loginIfNeeded(params: { auth: any; functions: any }) {
  const { auth, functions } = params;

  if (auth.currentUser?.uid) return auth.currentUser.uid;

  // 1) Try silent login using saved session
  const sess = readSession();
  if (sess?.refreshToken) {
    try {
      const fn = httpsCallable(functions, "mintCustomTokenFromRefreshToken");
      const res: any = await fn({ refreshToken: sess.refreshToken });
      const customToken = s(res?.data?.customToken);
      if (!customToken) throw new Error("Missing customToken");

      await signInWithCustomToken(auth, customToken);

      const uid = auth.currentUser?.uid;
      if (uid) {
        console.log("✅ Logged in from saved session. uid=", uid);
        return uid;
      }

      throw new Error("Silent login succeeded but uid missing");
    } catch (e: any) {
      console.log("⚠️ Silent login failed, will ask for pairing. reason=", e?.message || e);
      clearSession();
    }
  }

  // 2) Pairing code login (once)
  console.log("🔐 התחברות ל-MagicSale (פעם ראשונה במחשב הזה) באמצעות קוד חיבור");
  console.log("   פתחי את MagicSale > חיבור לפורטלים > 'צור קוד חיבור' והדביקי כאן.");

  const rawCode = await ask("🔑 Pairing code: ");
  const code = normalizePairingCode(rawCode);
  if (!code) throw new Error("Missing pairing code");

  try {
    const consumeFn = httpsCallable(functions, "consumeRunnerPairingCode");
    const res: any = await consumeFn({ code });

    const customToken = s(res?.data?.customToken);
    if (!customToken) throw new Error("consumeRunnerPairingCode returned no customToken");

    const cred = await signInWithCustomToken(auth, customToken);

    const uid = cred.user?.uid || auth.currentUser?.uid;
    if (!uid) throw new Error("Pairing login succeeded but missing uid");

    const refreshToken = pickRefreshToken(cred);
    const sessionPath = getSessionFilePath();

    if (!refreshToken) {
      console.log("⚠️ Logged in, אבל לא נמצא refreshToken ולכן לא נוצר session.json");
      console.log("   sessionPath would be:", sessionPath);
    } else {
      // ✅ כדי להתאים ל-RunnerSession שמחייב email, שומרים email ריק.
      writeSession({ email: "", refreshToken, savedAtMs: Date.now() });
      console.log("✅ Session saved:", sessionPath);
    }

    console.log("✅ Logged in via pairing. uid=", uid);
    return uid;
  } catch (e: any) {
    console.log("❌ Pairing login failed:", e?.message || e);

    // Optional dev-only fallback to email/password
    const allowPw = String(process.env.RUNNER_ALLOW_PASSWORD_LOGIN || "").trim() === "1";
    if (!allowPw) throw e;

    console.log("⚠️ RUNNER_ALLOW_PASSWORD_LOGIN=1 → fallback to email/password (DEV only)");
    const email = await ask("Email: ");
    const password = await ask("Password: ");

    const cred = await signInWithEmailAndPassword(auth, email, password);
    const uid = cred.user?.uid;
    if (!uid) throw new Error("Login succeeded but missing uid");

    const refreshToken = pickRefreshToken(cred);
    const sessionPath = getSessionFilePath();

    if (!refreshToken) {
      console.log("⚠️ Logged in, אבל לא נמצא refreshToken ולכן לא נוצר session.json");
      console.log("   sessionPath would be:", sessionPath);
    } else {
      writeSession({ email, refreshToken, savedAtMs: Date.now() });
      console.log("✅ Session saved:", sessionPath);
    }

    console.log("✅ Logged in (password). uid=", uid);
    return uid;
  }
}