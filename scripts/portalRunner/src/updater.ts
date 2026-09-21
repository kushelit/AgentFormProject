import fs from "fs";
import path from "path";
import {
  execFileSync,
  spawnSync,
} from "child_process";

const APP_NAME = "MagicSaleRunner";
const RUNNER_EXE_NAME = "MagicSaleRunner.exe";
const WATCHDOG_TASK_NAME = "MagicSale Runner Watchdog";
const UPDATE_REQUEST_FILE = "update-request.json";
const MAX_REQUEST_AGE_MS = 30 * 60 * 1000;

function sleep(ms: number) {
  Atomics.wait(
    new Int32Array(new SharedArrayBuffer(4)),
    0,
    0,
    ms
  );
}

function getAppDataRoot(): string {
  const appData = String(process.env.APPDATA || "").trim();

  if (appData) {
    return path.join(appData, APP_NAME);
  }

  const programData = String(
    process.env.ProgramData || "C:\\ProgramData"
  ).trim();

  return path.join(programData, APP_NAME);
}

function getLogPath(): string {
  return path.join(
    getAppDataRoot(),
    "updater.log"
  );
}

function log(message: string) {
  try {
    const root = getAppDataRoot();
    fs.mkdirSync(root, { recursive: true });

    fs.appendFileSync(
      getLogPath(),
      `[${new Date().toISOString()}] ${message}\r\n`,
      "utf8"
    );
  } catch {
    // Never fail the updater because logging failed.
  }
}

function getRequestPath(): string {
  return path.join(
    getAppDataRoot(),
    UPDATE_REQUEST_FILE
  );
}

function getRunnerInstallDir(): string {
  const programFiles = String(
    process.env.ProgramFiles || "C:\\Program Files"
  ).trim();

  return path.join(
    programFiles,
    "MagicSaleRunner"
  );
}

function getPowerShellPath(): string {
  const systemRoot = String(
    process.env.SystemRoot ||
    process.env.WINDIR ||
    "C:\\Windows"
  ).trim();

  return path.join(
    systemRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe"
  );
}

function getSchtasksPath(): string {
  const systemRoot = String(
    process.env.SystemRoot ||
    process.env.WINDIR ||
    "C:\\Windows"
  ).trim();

  return path.join(
    systemRoot,
    "System32",
    "schtasks.exe"
  );
}

function getTasklistPath(): string {
  const systemRoot = String(
    process.env.SystemRoot ||
    process.env.WINDIR ||
    "C:\\Windows"
  ).trim();

  return path.join(
    systemRoot,
    "System32",
    "tasklist.exe"
  );
}

function getTaskkillPath(): string {
  const systemRoot = String(
    process.env.SystemRoot ||
    process.env.WINDIR ||
    "C:\\Windows"
  ).trim();

  return path.join(
    systemRoot,
    "System32",
    "taskkill.exe"
  );
}

function psSingleQuote(value: string): string {
  return String(value || "").replace(/'/g, "''");
}

type SignatureInfo = {
  status: string;
  subject: string;
  thumbprint: string;
};

function getAuthenticodeSignature(
  filePath: string
): SignatureInfo {
  const escaped = psSingleQuote(filePath);

  const script =
    `$sig = Get-AuthenticodeSignature -LiteralPath '${escaped}'; ` +
    `$cert = $sig.SignerCertificate; ` +
    `[pscustomobject]@{ ` +
    `status = [string]$sig.Status; ` +
    `subject = $(if ($null -ne $cert) { [string]$cert.Subject } else { '' }); ` +
    `thumbprint = $(if ($null -ne $cert) { [string]$cert.Thumbprint } else { '' }) ` +
    `} | ConvertTo-Json -Compress`;

  const output = execFileSync(
    getPowerShellPath(),
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script,
    ],
    {
      encoding: "utf8",
      windowsHide: true,
    }
  ).trim();

  const parsed = JSON.parse(output || "{}");

  return {
    status: String(parsed?.status || "").trim(),
    subject: String(parsed?.subject || "").trim(),
    thumbprint: String(parsed?.thumbprint || "").trim(),
  };
}

function normalizeSubject(value: string): string {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function readProjectId(): string {
  try {
    const configPath = path.join(
      getRunnerInstallDir(),
      "config.default.json"
    );

    const config = JSON.parse(
      fs.readFileSync(configPath, "utf8")
    );

    return String(
      config?.firebase?.projectId || ""
    ).trim();
  } catch {
    return "";
  }
}

function verifyInstaller(
  installerPath: string
) {
  const projectId = readProjectId();
  const isTest = projectId === "magicsale-test";

  const runnerPath = path.join(
    getRunnerInstallDir(),
    RUNNER_EXE_NAME
  );

  if (!fs.existsSync(runnerPath)) {
    throw new Error(
      `Installed Runner was not found: ${runnerPath}`
    );
  }

  const installerSignature =
    getAuthenticodeSignature(installerPath);

  const runnerSignature =
    getAuthenticodeSignature(runnerPath);

  log(
    `[Security] projectId=${projectId || "unknown"}; ` +
    `installerSignature=${installerSignature.status}; ` +
    `runnerSignature=${runnerSignature.status}`
  );

  // TEST בלבד: מאפשר לנו לבדוק את מנגנון העדכון גם עם build לא חתום.
  // PROD לעולם לא עובר במסלול הזה.
  if (isTest) {
    if (
      installerSignature.status === "Valid" &&
      runnerSignature.status === "Valid" &&
      normalizeSubject(installerSignature.subject) !==
        normalizeSubject(runnerSignature.subject)
    ) {
      throw new Error(
        "TEST installer is signed by a different publisher than the installed Runner"
      );
    }

    if (installerSignature.status !== "Valid") {
      log(
        "[Security] TEST only: unsigned installer allowed for local test environment."
      );
    }

    return;
  }

  // PROD: installer and installed Runner must both have a valid Authenticode
  // signature from the same publisher.
  if (installerSignature.status !== "Valid") {
    throw new Error(
      `Installer signature is not valid: ${installerSignature.status || "unknown"}`
    );
  }

  if (runnerSignature.status !== "Valid") {
    throw new Error(
      `Installed Runner signature is not valid: ${runnerSignature.status || "unknown"}`
    );
  }

  if (
    !installerSignature.subject ||
    !runnerSignature.subject ||
    normalizeSubject(installerSignature.subject) !==
      normalizeSubject(runnerSignature.subject)
  ) {
    throw new Error(
      "Installer publisher does not match the installed Runner publisher"
    );
  }
}

function isRunnerRunning(): boolean {
  try {
    const output = execFileSync(
      getTasklistPath(),
      [
        "/FI",
        `IMAGENAME eq ${RUNNER_EXE_NAME}`,
        "/NH",
      ],
      {
        encoding: "utf8",
        windowsHide: true,
      }
    );

    return /MagicSaleRunner\.exe/i.test(output);
  } catch {
    return false;
  }
}

function forceStopRunnerIfNeeded() {
  if (!isRunnerRunning()) {
    log(
      "[Install] Runner is already stopped."
    );
    return;
  }

  log(
    "[Install] Runner is running before install. Stopping it now."
  );

  try {
    execFileSync(
      getTaskkillPath(),
      [
        "/F",
        "/IM",
        RUNNER_EXE_NAME,
      ],
      {
        windowsHide: true,
        stdio: "ignore",
      }
    );

    log(
      "[Install] Runner stop command completed."
    );
  } catch (e: any) {
    log(
      `[Install] Could not stop Runner: ${e?.message || e}`
    );
  }
}

function waitForRunnerToStop(
  timeoutMs = 30_000
): boolean {
  const startedAt = Date.now();

  while (
    Date.now() - startedAt < timeoutMs
  ) {
    if (!isRunnerRunning()) {
      return true;
    }

    sleep(500);
  }

  return !isRunnerRunning();
}

function isElevated(): boolean {
  try {
    const script =
      `$p = New-Object Security.Principal.WindowsPrincipal(` +
      `[Security.Principal.WindowsIdentity]::GetCurrent()); ` +
      `$p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)`;

    const output = execFileSync(
      getPowerShellPath(),
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
      ],
      {
        encoding: "utf8",
        windowsHide: true,
      }
    ).trim();

    return /^true$/i.test(output);
  } catch {
    return false;
  }
}

function runInstallerElevated(
  installerPath: string
): number {
  const args = [
    "/VERYSILENT",
    "/SUPPRESSMSGBOXES",
    "/NORESTART",
    "/CLOSEAPPLICATIONS",
    "/AUTOUPDATE=1",
  ];

  if (isElevated()) {
    log(
      "[Install] Updater is elevated. Launching installer without UAC."
    );

    const result = spawnSync(
      installerPath,
      args,
      {
        windowsHide: true,
        stdio: "ignore",
      }
    );

    if (result.error) {
      throw result.error;
    }

    return typeof result.status === "number"
      ? result.status
      : 1;
  }

  // Fallback למחשב שבו ה-Task לא קיבל הרשאות מוגבהות.
  // במקרה כזה ההתנהגות נשארת כמו היום: UAC ידני.
  log(
    "[Install] Updater task is not elevated. Falling back to UAC approval."
  );

  const escapedInstaller =
    psSingleQuote(installerPath);

  const argumentList = args
    .map((value) => `'${psSingleQuote(value)}'`)
    .join(",");

  const script =
    `$p = Start-Process ` +
    `-FilePath '${escapedInstaller}' ` +
    `-ArgumentList @(${argumentList}) ` +
    `-Verb RunAs -Wait -PassThru; ` +
    `exit $p.ExitCode`;

  try {
    execFileSync(
      getPowerShellPath(),
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
      ],
      {
        windowsHide: true,
        stdio: "ignore",
      }
    );

    return 0;
  } catch (e: any) {
    const status = Number(e?.status);

    if (Number.isFinite(status)) {
      return status;
    }

    throw e;
  }
}

function triggerWatchdog() {
  try {
    execFileSync(
      getSchtasksPath(),
      [
        "/Run",
        "/TN",
        WATCHDOG_TASK_NAME,
      ],
      {
        windowsHide: true,
        stdio: "ignore",
      }
    );

    log(
      "[Restart] Watchdog task triggered."
    );
  } catch (e: any) {
    log(
      `[Restart] Could not trigger watchdog: ${e?.message || e}`
    );
  }
}

type UpdateRequest = {
  installerPath: string;
  requestedAtMs: number;
  runnerVersion?: string;
};

function readUpdateRequest(): UpdateRequest {
  const requestPath = getRequestPath();

  if (!fs.existsSync(requestPath)) {
    throw new Error(
      `Update request was not found: ${requestPath}`
    );
  }

  const request = JSON.parse(
    fs.readFileSync(requestPath, "utf8")
  );

  const installerPath = String(
    request?.installerPath || ""
  ).trim();

  const requestedAtMs = Number(
    request?.requestedAtMs || 0
  );

  if (!installerPath) {
    throw new Error(
      "Update request is missing installerPath"
    );
  }

  if (!Number.isFinite(requestedAtMs) || requestedAtMs <= 0) {
    throw new Error(
      "Update request is missing requestedAtMs"
    );
  }

  if (
    Date.now() - requestedAtMs >
    MAX_REQUEST_AGE_MS
  ) {
    throw new Error(
      "Update request is stale"
    );
  }

  return {
    installerPath: path.resolve(installerPath),
    requestedAtMs,
    runnerVersion: String(
      request?.runnerVersion || ""
    ).trim() || undefined,
  };
}

function cleanupRequestAndInstaller(
  installerPath: string
) {
  try {
    fs.unlinkSync(getRequestPath());
  } catch {
    // ignore
  }

  try {
    fs.unlinkSync(installerPath);
  } catch {
    // ignore
  }
}

function main() {
  let installerPath = "";

  try {
    log("[Updater] Starting MagicSale Updater.");

    const request = readUpdateRequest();
    installerPath = request.installerPath;

    log(
      `[Updater] Request accepted. ` +
      `runnerVersion=${request.runnerVersion || "unknown"}; ` +
      `installer=${installerPath}`
    );

    if (!fs.existsSync(installerPath)) {
      throw new Error(
        `Installer file was not found: ${installerPath}`
      );
    }

    if (
      path.extname(installerPath).toLowerCase() !==
      ".exe"
    ) {
      throw new Error(
        "Installer path is not an .exe file"
      );
    }

    verifyInstaller(installerPath);

    // ה-Runner המקורי כבר ביקש את העדכון ויצא, אבל ה-Watchdog
    // עלול להחזיר אותו בזמן בדיקת החתימה. אם זה קרה, עוצרים
    // את ה-instance שחזר ורק אז ממשיכים להתקנה.
    forceStopRunnerIfNeeded();

    if (!waitForRunnerToStop()) {
      throw new Error(
        "Runner did not stop before update timeout"
      );
    }

    const exitCode =
      runInstallerElevated(installerPath);

    if (exitCode !== 0) {
      throw new Error(
        `Installer exited with code ${exitCode}`
      );
    }

    log(
      "[Updater] Installation completed successfully."
    );

    cleanupRequestAndInstaller(
      installerPath
    );

    triggerWatchdog();
    process.exit(0);
  } catch (e: any) {
    log(
      `[Updater] Update failed: ${e?.message || e}`
    );

    // אם העדכון נכשל, מחזירים את ה-Runner הקיים לעבודה.
    triggerWatchdog();
    process.exit(1);
  }
}

main();
