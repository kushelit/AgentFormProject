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
} from "./sessionStore";

/**
 * פונקציית עזר להצגת שאלה (נשארת רק עבור ה-Fallback של הסיסמה)
 */
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

// function pickRefreshToken(cred: UserCredential): string {
//   const u: any = cred?.user as any;
//   const a = s(u?.stsTokenManager?.refreshToken);
//   if (a) return a;
//   const b = s(u?.refreshToken);
//   if (b) return b;
//   return "";
// }

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
 * פונקציית הלוגין המרכזית:
 */
export async function loginIfNeeded(params: { 
  auth: any; 
  functions: any; 
  pairingCode?: string 
}) {
  const { auth, functions, pairingCode } = params;

  if (auth.currentUser?.uid) return auth.currentUser.uid;

  // --- שלב 1: ניסיון התחברות שקטה ---
  const sess = readSession();
  
  if (sess?.refreshToken) {
    try {
      const fn = httpsCallable(functions, "mintCustomTokenFromRefreshToken");
      const res: any = await fn({ refreshToken: sess.refreshToken });
      const customToken = s(res?.data?.customToken);
      
      if (customToken) {
        await signInWithCustomToken(auth, customToken);
        const uid = auth.currentUser?.uid;
        if (uid) return uid;
      }
    } catch (e) {
      // אם נכשל, נמשיך הלאה
    }
  }

  // --- שלב 2: תהליך צימוד (Pairing Code) ---
  
  // התיקון הקריטי: אם לא קיבלנו קוד מה-Runner, אנחנו לא שואלים ב-CMD.
  // אנחנו זורקים שגיאה כדי שה-Runner יתפוס אותה ויקפיץ את חלון ה-UI.
  if (!pairingCode) {
    throw new Error("NO_SESSION_FOUND"); 
  }

  const code = normalizePairingCode(pairingCode);

  try {
    const consumeFn = httpsCallable(functions, "consumeRunnerPairingCode");
    const res: any = await consumeFn({ code });

    const customToken = s(res?.data?.customToken);
    if (!customToken) throw new Error("קוד הצימוד שגוי או פג תוקף.");

    const cred = await signInWithCustomToken(auth, customToken);
    const uid = cred.user?.uid || auth.currentUser?.uid;

    if (!uid) throw new Error("הצימוד הצליח אך לא התקבל מזהה משתמש.");

    const refreshToken = pickRefreshToken(cred);
    if (refreshToken) {
      writeSession({ email: "", refreshToken, savedAtMs: Date.now() });
    }

    return uid;

  } catch (e: any) {
    // אם הצימוד נכשל (קוד שגוי למשל)
    console.log("\n❌ הצימוד נכשל:", e?.message || e);
    
    // Fallback רק אם הוגדר במפורש (למפתחים)
    const allowPw = String(process.env.RUNNER_ALLOW_PASSWORD_LOGIN || "").trim() === "1";
    if (allowPw) {
      const email = await ask("Email: ");
      const password = await ask("Password: ");
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const refreshToken = pickRefreshToken(cred);
      if (refreshToken) writeSession({ email, refreshToken, savedAtMs: Date.now() });
      return cred.user?.uid;
    }

    throw e;
  }
}