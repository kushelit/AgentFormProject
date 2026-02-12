import readline from "readline";
import { signInWithEmailAndPassword } from "firebase/auth";

function ask(q: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(q, (ans) => { rl.close(); resolve(String(ans || "").trim()); }));
}

export async function loginCli(auth: any) {
  if (auth.currentUser?.uid) return auth.currentUser.uid;

  console.log("🔐 התחברות ל-MagicSale (Firebase Auth)");
  const email = await ask("Email: ");
  const password = await ask("Password: ");

  const cred = await signInWithEmailAndPassword(auth, email, password);
  if (!cred.user?.uid) throw new Error("Login succeeded but missing uid");
  console.log("✅ Logged in as uid:", cred.user.uid);
  return cred.user.uid;
}
