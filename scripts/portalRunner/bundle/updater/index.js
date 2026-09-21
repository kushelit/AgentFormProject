/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ 317:
/***/ ((module) => {

module.exports = require("child_process");

/***/ }),

/***/ 896:
/***/ ((module) => {

module.exports = require("fs");

/***/ }),

/***/ 928:
/***/ ((module) => {

module.exports = require("path");

/***/ }),

/***/ 35:
/***/ (function(__unused_webpack_module, exports, __nccwpck_require__) {


var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
const fs_1 = __importDefault(__nccwpck_require__(896));
const path_1 = __importDefault(__nccwpck_require__(928));
const child_process_1 = __nccwpck_require__(317);
const APP_NAME = "MagicSaleRunner";
const RUNNER_EXE_NAME = "MagicSaleRunner.exe";
const WATCHDOG_TASK_NAME = "MagicSale Runner Watchdog";
const UPDATE_REQUEST_FILE = "update-request.json";
const MAX_REQUEST_AGE_MS = 30 * 60 * 1000;
function sleep(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function getAppDataRoot() {
    const appData = String(process.env.APPDATA || "").trim();
    if (appData) {
        return path_1.default.join(appData, APP_NAME);
    }
    const programData = String(process.env.ProgramData || "C:\\ProgramData").trim();
    return path_1.default.join(programData, APP_NAME);
}
function getLogPath() {
    return path_1.default.join(getAppDataRoot(), "updater.log");
}
function log(message) {
    try {
        const root = getAppDataRoot();
        fs_1.default.mkdirSync(root, { recursive: true });
        fs_1.default.appendFileSync(getLogPath(), `[${new Date().toISOString()}] ${message}\r\n`, "utf8");
    }
    catch {
        // Never fail the updater because logging failed.
    }
}
function getRequestPath() {
    return path_1.default.join(getAppDataRoot(), UPDATE_REQUEST_FILE);
}
function getRunnerInstallDir() {
    const programFiles = String(process.env.ProgramFiles || "C:\\Program Files").trim();
    return path_1.default.join(programFiles, "MagicSaleRunner");
}
function getPowerShellPath() {
    const systemRoot = String(process.env.SystemRoot ||
        process.env.WINDIR ||
        "C:\\Windows").trim();
    return path_1.default.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}
function getSchtasksPath() {
    const systemRoot = String(process.env.SystemRoot ||
        process.env.WINDIR ||
        "C:\\Windows").trim();
    return path_1.default.join(systemRoot, "System32", "schtasks.exe");
}
function getTasklistPath() {
    const systemRoot = String(process.env.SystemRoot ||
        process.env.WINDIR ||
        "C:\\Windows").trim();
    return path_1.default.join(systemRoot, "System32", "tasklist.exe");
}
function getTaskkillPath() {
    const systemRoot = String(process.env.SystemRoot ||
        process.env.WINDIR ||
        "C:\\Windows").trim();
    return path_1.default.join(systemRoot, "System32", "taskkill.exe");
}
function psSingleQuote(value) {
    return String(value || "").replace(/'/g, "''");
}
function getAuthenticodeSignature(filePath) {
    const escaped = psSingleQuote(filePath);
    const script = `$sig = Get-AuthenticodeSignature -LiteralPath '${escaped}'; ` +
        `$cert = $sig.SignerCertificate; ` +
        `[pscustomobject]@{ ` +
        `status = [string]$sig.Status; ` +
        `subject = $(if ($null -ne $cert) { [string]$cert.Subject } else { '' }); ` +
        `thumbprint = $(if ($null -ne $cert) { [string]$cert.Thumbprint } else { '' }) ` +
        `} | ConvertTo-Json -Compress`;
    const output = (0, child_process_1.execFileSync)(getPowerShellPath(), [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
    ], {
        encoding: "utf8",
        windowsHide: true,
    }).trim();
    const parsed = JSON.parse(output || "{}");
    return {
        status: String(parsed?.status || "").trim(),
        subject: String(parsed?.subject || "").trim(),
        thumbprint: String(parsed?.thumbprint || "").trim(),
    };
}
function normalizeSubject(value) {
    return String(value || "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
}
function readProjectId() {
    try {
        const configPath = path_1.default.join(getRunnerInstallDir(), "config.default.json");
        const config = JSON.parse(fs_1.default.readFileSync(configPath, "utf8"));
        return String(config?.firebase?.projectId || "").trim();
    }
    catch {
        return "";
    }
}
function verifyInstaller(installerPath) {
    const projectId = readProjectId();
    const isTest = projectId === "magicsale-test";
    const runnerPath = path_1.default.join(getRunnerInstallDir(), RUNNER_EXE_NAME);
    if (!fs_1.default.existsSync(runnerPath)) {
        throw new Error(`Installed Runner was not found: ${runnerPath}`);
    }
    const installerSignature = getAuthenticodeSignature(installerPath);
    const runnerSignature = getAuthenticodeSignature(runnerPath);
    log(`[Security] projectId=${projectId || "unknown"}; ` +
        `installerSignature=${installerSignature.status}; ` +
        `runnerSignature=${runnerSignature.status}`);
    // TEST בלבד: מאפשר לנו לבדוק את מנגנון העדכון גם עם build לא חתום.
    // PROD לעולם לא עובר במסלול הזה.
    if (isTest) {
        if (installerSignature.status === "Valid" &&
            runnerSignature.status === "Valid" &&
            normalizeSubject(installerSignature.subject) !==
                normalizeSubject(runnerSignature.subject)) {
            throw new Error("TEST installer is signed by a different publisher than the installed Runner");
        }
        if (installerSignature.status !== "Valid") {
            log("[Security] TEST only: unsigned installer allowed for local test environment.");
        }
        return;
    }
    // PROD: installer and installed Runner must both have a valid Authenticode
    // signature from the same publisher.
    if (installerSignature.status !== "Valid") {
        throw new Error(`Installer signature is not valid: ${installerSignature.status || "unknown"}`);
    }
    if (runnerSignature.status !== "Valid") {
        throw new Error(`Installed Runner signature is not valid: ${runnerSignature.status || "unknown"}`);
    }
    if (!installerSignature.subject ||
        !runnerSignature.subject ||
        normalizeSubject(installerSignature.subject) !==
            normalizeSubject(runnerSignature.subject)) {
        throw new Error("Installer publisher does not match the installed Runner publisher");
    }
}
function isRunnerRunning() {
    try {
        const output = (0, child_process_1.execFileSync)(getTasklistPath(), [
            "/FI",
            `IMAGENAME eq ${RUNNER_EXE_NAME}`,
            "/NH",
        ], {
            encoding: "utf8",
            windowsHide: true,
        });
        return /MagicSaleRunner\.exe/i.test(output);
    }
    catch {
        return false;
    }
}
function forceStopRunnerIfNeeded() {
    if (!isRunnerRunning()) {
        log("[Install] Runner is already stopped.");
        return;
    }
    log("[Install] Runner is running before install. Stopping it now.");
    try {
        (0, child_process_1.execFileSync)(getTaskkillPath(), [
            "/F",
            "/IM",
            RUNNER_EXE_NAME,
        ], {
            windowsHide: true,
            stdio: "ignore",
        });
        log("[Install] Runner stop command completed.");
    }
    catch (e) {
        log(`[Install] Could not stop Runner: ${e?.message || e}`);
    }
}
function waitForRunnerToStop(timeoutMs = 30000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        if (!isRunnerRunning()) {
            return true;
        }
        sleep(500);
    }
    return !isRunnerRunning();
}
function isElevated() {
    try {
        const script = `$p = New-Object Security.Principal.WindowsPrincipal(` +
            `[Security.Principal.WindowsIdentity]::GetCurrent()); ` +
            `$p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)`;
        const output = (0, child_process_1.execFileSync)(getPowerShellPath(), [
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ], {
            encoding: "utf8",
            windowsHide: true,
        }).trim();
        return /^true$/i.test(output);
    }
    catch {
        return false;
    }
}
function runInstallerElevated(installerPath) {
    const args = [
        "/VERYSILENT",
        "/SUPPRESSMSGBOXES",
        "/NORESTART",
        "/CLOSEAPPLICATIONS",
        "/AUTOUPDATE=1",
    ];
    if (isElevated()) {
        log("[Install] Updater is elevated. Launching installer without UAC.");
        const result = (0, child_process_1.spawnSync)(installerPath, args, {
            windowsHide: true,
            stdio: "ignore",
        });
        if (result.error) {
            throw result.error;
        }
        return typeof result.status === "number"
            ? result.status
            : 1;
    }
    // Fallback למחשב שבו ה-Task לא קיבל הרשאות מוגבהות.
    // במקרה כזה ההתנהגות נשארת כמו היום: UAC ידני.
    log("[Install] Updater task is not elevated. Falling back to UAC approval.");
    const escapedInstaller = psSingleQuote(installerPath);
    const argumentList = args
        .map((value) => `'${psSingleQuote(value)}'`)
        .join(",");
    const script = `$p = Start-Process ` +
        `-FilePath '${escapedInstaller}' ` +
        `-ArgumentList @(${argumentList}) ` +
        `-Verb RunAs -Wait -PassThru; ` +
        `exit $p.ExitCode`;
    try {
        (0, child_process_1.execFileSync)(getPowerShellPath(), [
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ], {
            windowsHide: true,
            stdio: "ignore",
        });
        return 0;
    }
    catch (e) {
        const status = Number(e?.status);
        if (Number.isFinite(status)) {
            return status;
        }
        throw e;
    }
}
function triggerWatchdog() {
    try {
        (0, child_process_1.execFileSync)(getSchtasksPath(), [
            "/Run",
            "/TN",
            WATCHDOG_TASK_NAME,
        ], {
            windowsHide: true,
            stdio: "ignore",
        });
        log("[Restart] Watchdog task triggered.");
    }
    catch (e) {
        log(`[Restart] Could not trigger watchdog: ${e?.message || e}`);
    }
}
function readUpdateRequest() {
    const requestPath = getRequestPath();
    if (!fs_1.default.existsSync(requestPath)) {
        throw new Error(`Update request was not found: ${requestPath}`);
    }
    const request = JSON.parse(fs_1.default.readFileSync(requestPath, "utf8"));
    const installerPath = String(request?.installerPath || "").trim();
    const requestedAtMs = Number(request?.requestedAtMs || 0);
    if (!installerPath) {
        throw new Error("Update request is missing installerPath");
    }
    if (!Number.isFinite(requestedAtMs) || requestedAtMs <= 0) {
        throw new Error("Update request is missing requestedAtMs");
    }
    if (Date.now() - requestedAtMs >
        MAX_REQUEST_AGE_MS) {
        throw new Error("Update request is stale");
    }
    return {
        installerPath: path_1.default.resolve(installerPath),
        requestedAtMs,
        runnerVersion: String(request?.runnerVersion || "").trim() || undefined,
    };
}
function cleanupRequestAndInstaller(installerPath) {
    try {
        fs_1.default.unlinkSync(getRequestPath());
    }
    catch {
        // ignore
    }
    try {
        fs_1.default.unlinkSync(installerPath);
    }
    catch {
        // ignore
    }
}
function main() {
    let installerPath = "";
    try {
        log("[Updater] Starting MagicSale Updater.");
        const request = readUpdateRequest();
        installerPath = request.installerPath;
        log(`[Updater] Request accepted. ` +
            `runnerVersion=${request.runnerVersion || "unknown"}; ` +
            `installer=${installerPath}`);
        if (!fs_1.default.existsSync(installerPath)) {
            throw new Error(`Installer file was not found: ${installerPath}`);
        }
        if (path_1.default.extname(installerPath).toLowerCase() !==
            ".exe") {
            throw new Error("Installer path is not an .exe file");
        }
        verifyInstaller(installerPath);
        // ה-Runner המקורי כבר ביקש את העדכון ויצא, אבל ה-Watchdog
        // עלול להחזיר אותו בזמן בדיקת החתימה. אם זה קרה, עוצרים
        // את ה-instance שחזר ורק אז ממשיכים להתקנה.
        forceStopRunnerIfNeeded();
        if (!waitForRunnerToStop()) {
            throw new Error("Runner did not stop before update timeout");
        }
        const exitCode = runInstallerElevated(installerPath);
        if (exitCode !== 0) {
            throw new Error(`Installer exited with code ${exitCode}`);
        }
        log("[Updater] Installation completed successfully.");
        cleanupRequestAndInstaller(installerPath);
        triggerWatchdog();
        process.exit(0);
    }
    catch (e) {
        log(`[Updater] Update failed: ${e?.message || e}`);
        // אם העדכון נכשל, מחזירים את ה-Runner הקיים לעבודה.
        triggerWatchdog();
        process.exit(1);
    }
}
main();


/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId].call(module.exports, module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __nccwpck_require__(35);
/******/ 	module.exports = __webpack_exports__;
/******/ 	
/******/ })()
;