// scripts/portalRunner/src/runnerPaths.ts
import fs from "fs";
import path from "path";
import os from "os";
import type { RunnerPaths } from "./types";

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function isAbs(p: string) {
  try {
    return path.isAbsolute(p);
  } catch {
    return false;
  }
}

/**
 * האם זה ריצה מתוך pkg (EXE)?
 * pkg מוסיף process.pkg
 */
export function isPkg(): boolean {
  return Boolean((process as any).pkg);
}

export function getAppDataRunnerDir(): string {
  const appData = String(process.env.APPDATA || "").trim();
  if (appData) return path.join(appData, "MagicSaleRunner");
  return path.join(os.homedir(), ".magicsale-runner");
}

/**
 * Install dir:
 * - EXE (pkg): dirname(process.execPath) -> Program Files\MagicSale Runner\
 * - DEV (node): נשארים ב-AppData כדי לא לכתוב ל-node.exe folder
 */
export function getInstallDir(appDataDir: string): string {
  if (isPkg()) {
    const execPath = String(process.execPath || "").trim();
    return execPath ? path.dirname(execPath) : appDataDir;
  }
  return appDataDir;
}

export function buildRunnerPaths(params?: { downloadDirFromConfig?: string | null }): RunnerPaths {
  const appDataDir = getAppDataRunnerDir();
  ensureDir(appDataDir);

  const installDir = getInstallDir(appDataDir);

  const rawDl = String(params?.downloadDirFromConfig || "").trim();
  const downloadsDir = rawDl
    ? isAbs(rawDl)
      ? rawDl
      : path.join(appDataDir, rawDl)
    : path.join(appDataDir, "downloads");

  const logsDir = path.join(appDataDir, "logs");

  // ✅ EXE: ליד ה-EXE (Program Files)
  // ✅ DEV: לא נוגעים בכלל ב-pw-browsers, Playwright משתמש בדיפולט שלו
  const pwBrowsersDir = isPkg() ? path.join(installDir, "pw-browsers") : "";

  ensureDir(downloadsDir);
  ensureDir(logsDir);

  // חשוב: ליצור את pw-browsers רק ב-EXE
  if (pwBrowsersDir) ensureDir(pwBrowsersDir);

  return { appDataDir, downloadsDir, logsDir, installDir, pwBrowsersDir };
}

export function setPlaywrightBrowsersPath(pwBrowsersDir: string) {
  if (!pwBrowsersDir) return;
  process.env.PLAYWRIGHT_BROWSERS_PATH = pwBrowsersDir;
}

export function resolveChromiumExePath(): string | undefined {
  if (!isPkg()) return undefined;

  const exeDir = path.dirname(process.execPath);
  const base = path.join(exeDir, "pw-browsers");

  if (!fs.existsSync(base)) {
    console.log("[resolveChromiumExePath] pw-browsers not found at:", base);
    return undefined;
  }

  // עוברים על כל תת-תיקיות (chromium-XXXX)
  const subdirs = fs.readdirSync(base);
  for (const sub of subdirs) {
    const candidates = [
      path.join(base, sub, "chrome-win64", "chrome.exe"), // ✅ Windows 64
      path.join(base, sub, "chrome-win", "chrome.exe"),   // fallback 32
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        console.log("[resolveChromiumExePath] found:", p);
        return p;
      }
    }
  }

  console.log("[resolveChromiumExePath] chrome.exe not found under:", base);
  return undefined;
}