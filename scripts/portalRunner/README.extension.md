# MagicSale Portal Runner extension

Manifest V3 Chrome extension for the existing Firebase portal-report workflow. The native runner in `src/` and its executables remain available; the extension runs independently, without a native helper or a bundled browser.

## Install

1. Use Chrome 120 or newer. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select this project's `dist-extension` directory. Alternatively, extract `portal-runner-extension.zip` into a directory and load that directory.
2. Open **Settings** from the extension toolbar popup. Paste the public Firebase configuration from the existing runner's `config.json`, using the shape below, and save it. Never paste a service-account private key.
3. Generate a pairing code in the existing website and enter it in the extension popup. Firebase authentication persists in IndexedDB, including after Chrome restarts.
4. Queue jobs from the website. Use the extension's runner ID for `reservedRunnerId`; reservations for an old native runner do not match this extension.

```json
{
  "firebase": {
    "apiKey": "YOUR_PUBLIC_FIREBASE_API_KEY",
    "authDomain": "YOUR_PROJECT.firebaseapp.com",
    "projectId": "YOUR_PROJECT",
    "storageBucket": "YOUR_EXISTING_BUCKET",
    "appId": "YOUR_APP_ID",
    "functionsRegion": "europe-west1"
  }
}
```

`appId` and `functionsRegion` are optional. The existing region defaults are retained: `us-central1` for `agentsale-693e8`, otherwise `europe-west1`. Configuration changes disconnect the current agent. The pairing form also switches agents once outstanding recovery has completed.

## Operation

While Chrome is running, the extension checks for jobs and publishes presence every 30 seconds. It processes one job at a time, preserving transactional claims, runner reservations, batch order, template/month duplicate locks and import completion statuses. Active locks renew every 30 seconds. **Pause** finishes the current job and stops claiming new jobs; **Resume** checks the queue immediately. Closing Chrome stops automation.

Each run creates an unfocused, minimized normal Chrome window. It remains accessible in the taskbar; **Show worker window** restores it for manual intervention. Chrome may show its debugger notice. The window uses your current profile's cookies and portal logins. Automation activates tabs inside that window for keyboard/mouse input but does not explicitly focus or restore the window. Only owned tabs are closed after the run, including portal-created report/login tabs.

OTP remains in the existing website/Firestore workflow. The extension consumes and clears it without storing it in local checkpoints. Portal credentials are fetched with the existing `getPortalCredentialsDecrypted` callable and kept transient. Pairing uses `consumeRunnerPairingCode` and Firebase custom-token authentication. Existing Firebase security rules and callable policies still apply; if the backend restricts allowed origins, its configuration must allow this extension.

All thirteen integrations also check for successful portal authentication while waiting for OTP. If an agent approves access on their phone and the portal transitions to an authenticated page, the extension clears the OTP request and continues without typing a code. It never approves phone notifications itself. Detection requires provider-specific authenticated controls/routes on permitted domains, not just disappearance of the OTP field. Future portal UI changes may require updating these rules. Chrome-saved passwords remain managed by Chrome; this feature does not read its password database.

Reports are captured as bytes using the debugger's response interception or a portal-page Blob/data download bridge. XHR responses reach the application so it can generate the final download. ZIP files remain intact with their existing template mappings. Uploads retain `portalRuns/{agentId}/{runId}/{subdir}/{filename}`, `downloads[]`, and the original report/template metadata. Browser report keys are internal and are omitted from Firestore output; no local filesystem path is required.

Captured bytes and upload intents persist in IndexedDB. Recovery reconciles uploads to deterministic destinations and marks interrupted automation as an error without repeating portal actions. Recovered upload paths are also recorded in `result.recoveredUploads`. Pending bytes are retained if reconciliation fails, and deleted once recovery succeeds. Pair the original agent again if authentication expired during recovery. Recovery never closes saved tab IDs from a previous browser session. Create a new job to retry interrupted portal automation.

The current capture limit is 128 MiB per report. Legacy `self_update` jobs are marked `skipped` with `chrome_managed_updates`; extension updates come through Chrome distribution or by loading an updated unpacked package. No native installer is executed.

## Build and checks

With Node.js installed:

```powershell
npm ci
npm run check:extension
npm run build:extension
npm run test:extension
npm run test:extension:browser
```

The build produces `dist-extension/` and `portal-runner-extension.zip` with an explicit six-file allowlist. It excludes native executables, Chromium, service accounts, session files and Node/Playwright runtime code. All JavaScript dependencies are bundled locally. Only enumerated portal and Firebase hosts are granted host permissions.

Browser fixtures use the existing test Chromium at `pw-browsers/chromium-1208/chrome-win64/chrome.exe`. If it is unavailable, set `CHROME_TEST_EXECUTABLE` to a Chrome for Testing/Chromium executable that supports unpacked extensions. The fixture's localhost permissions exist only in `.test-artifacts/browser-extension`; they are not added to the production extension. Tests create temporary profiles under `.test-artifacts` and use no real accounts.

The original `npm run build` still builds the native runner. Extension providers live in `extension/providers`, alongside the shared browser adapter and queue coordinator. `scripts/port-providers.cjs` records the initial migration; do not rerun it over later provider fixes.

## Validation status

Automated tests cover claims, reservations, batch ordering (including more than twenty predecessors), duplicate locks, OTP success/abort/timeout, pause/resume, import completion, interrupted-upload recovery, safe tab cleanup, host boundaries and distribution contents. Real Chromium fixtures cover the packaged popup/settings, configuration persistence, nested cross-origin frames, locators, keyboard input, popup adoption, user closure, and exact bytes/names for GET, POST, CSV, ZIP, Blob, data URL and AJAX-to-Blob exports. The adapter is tested in its minified form.

Desktop window appearance/focus is not visually verified: headless Chromium tests validate the requested `minimized`/`focused: false` flags, but headless Chrome reports normal window state. Tests run on the bundled Chromium 145; Chrome 120 compatibility uses nested CDP messaging instead of newer flat-session APIs and has not been exercised on a Chrome 120 binary.

All thirteen provider flows are ported. During manual testing the user reported successful runs for Mor, Yalin Lapidot, Altshuler and Analyst, including sequential batches. These reports do not establish live validation of every report or authentication mode. Mobile-approval detection is covered by local tests for all thirteen rules, including a Meitav handler test, and still needs live acceptance testing per portal. Remaining integrations and backend rules/CORS, OTP retries, report selection and upload/import completion require testing with authorized accounts. A portal redirect to an additional domain will fail explicitly until its required host is added to `extension/policy.ts` and the extension is rebuilt.
