// scripts/portalRunner/src/sessionStore.ts
import fs from "fs";
import path from "path";
import os from "os";

export type RunnerSession = {
  email: string;
  refreshToken: string;
  savedAtMs: number;
};

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

export function getSessionFilePath() {
  // Windows product-friendly location
  const appData = process.env.APPDATA;
  if (appData) {
    const dir = path.join(appData, "MagicSaleRunner");
    ensureDir(dir);
    return path.join(dir, "session.json");
  }

  // Mac/Linux fallback
  const home = os.homedir();
  const dir = path.join(home, ".magicsale-runner");
  ensureDir(dir);
  return path.join(dir, "session.json");
}

export function readSession(): RunnerSession | null {
  const file = getSessionFilePath();
  if (!fs.existsSync(file)) return null;

  try {
    const raw = fs.readFileSync(file, "utf8");
    const data = JSON.parse(raw);

    const email = String(data?.email || "").trim(); // email יכול להיות ריק
    const refreshToken = String(data?.refreshToken || "").trim();
    const savedAtMs = Number(data?.savedAtMs || 0);

    // 🔥 לא דורשים email יותר
    if (!refreshToken || !Number.isFinite(savedAtMs)) return null;

    return { email, refreshToken, savedAtMs };
  } catch {
    return null;
  }
}

export function writeSession(session: RunnerSession) {
  const file = getSessionFilePath();
  fs.writeFileSync(file, JSON.stringify(session, null, 2), "utf8");
}

export function clearSession() {
  const file = getSessionFilePath();
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
