// scripts/portalRunner/src/logger.ts
import fs from "fs";
import path from "path";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type Logger = {
  debug: (...args: any[]) => void;
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
  flush?: () => Promise<void>;
};

function ts() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${ms}`;
}

function stringifyArg(a: any) {
  if (a == null) return String(a);
  if (typeof a === "string") return a;
  if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack || ""}`;
  try {
    return JSON.stringify(a);
  } catch {
    return String(a);
  }
}

export function createFileLogger(params: {
  logsDir: string;
  filename?: string; // default runner.log
  alsoConsole?: boolean; // default true
}): Logger {
  const logsDir = params.logsDir;
  const filename = params.filename || "runner.log";
  const alsoConsole = params.alsoConsole !== false;

  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  const filePath = path.join(logsDir, filename);

  // תור קטן כדי שלא נפתח/נסגור קובץ כל שורה
  let queue: string[] = [];
  let flushing = false;

  async function flush() {
    if (flushing) return;
    if (!queue.length) return;
    flushing = true;
    const chunk = queue.join("");
    queue = [];
    try {
      await fs.promises.appendFile(filePath, chunk, "utf8");
    } catch (e: any) {
      // אם כתיבה לקובץ נכשלה, לפחות לקונסול
      try {
        console.error("[Logger] failed to write file:", e?.message || e);
      } catch {}
    } finally {
      flushing = false;
    }
  }

  function write(level: LogLevel, args: any[]) {
    const line =
      `[${ts()}] [${level.toUpperCase()}] ` +
      args.map(stringifyArg).join(" ") +
      "\n";
    queue.push(line);

    // flush “בקרוב” בלי לחסום
    void flush();
  }

  function mk(level: LogLevel, consoleFn: (...a: any[]) => void) {
    return (...args: any[]) => {
      if (alsoConsole) {
        try {
          consoleFn(...args);
        } catch {}
      }
      write(level, args);
    };
  }

  return {
    debug: mk("debug", console.log),
    info: mk("info", console.log),
    warn: mk("warn", console.warn),
    error: mk("error", console.error),
    flush,
  };
}