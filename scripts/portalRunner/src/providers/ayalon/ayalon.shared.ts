import type { Page } from "playwright";
import type { RunnerCtx } from "../../types";

function escJsString(v: string) {
  return String(v ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
}

export async function ayalonLogin(page: Page, u: string, p: string) {
  const user = escJsString(u);
  const pass = escJsString(p);

  const injection = `
    (function(user, pass) {
      return new Promise((resolve) => {
        let attempts = 0;
        const isVisible = (el) => !!el && el.offsetWidth > 0 && el.offsetHeight > 0;

        const interval = setInterval(() => {
          attempts++;

          const userInputs = Array.from(document.querySelectorAll('#input_1'));
          const passInputs = Array.from(document.querySelectorAll('#input_2'));
          const submitCandidates = Array.from(
            document.querySelectorAll('input[type="submit"], .credentials_input_submit')
          );

          const uInput = userInputs.find(isVisible);

          const pInput = passInputs.find((el) => {
            if (!isVisible(el)) return false;
            const placeholder = String(el.getAttribute('placeholder') || '').trim();
            const alt = String(el.getAttribute('alt') || '').trim();

            return (
              placeholder.includes("סיסמא") ||
              placeholder.includes("סיסמה") ||
              alt.includes("סיסמא") ||
              alt.includes("סיסמה")
            );
          });

          const btn = submitCandidates.find(isVisible);

          if (uInput && pInput && btn) {
            clearInterval(interval);

            uInput.value = user;
            pInput.value = pass;

            ['input', 'change', 'blur'].forEach((ev) => {
              uInput.dispatchEvent(new Event(ev, { bubbles: true }));
              pInput.dispatchEvent(new Event(ev, { bubbles: true }));
            });

            setTimeout(() => {
              btn.click();
              resolve("SUBMITTED");
            }, 500);

            return;
          }

          if (attempts > 60) {
            clearInterval(interval);
            resolve("TIMEOUT_FIELDS_NOT_FOUND");
          }
        }, 500);
      });
    })('${user}', '${pass}')
  `;

  const result = await page.evaluate(injection);
  console.log(`[Ayalon] Login submit result: ${result}`);

  if (result !== "SUBMITTED") {
    throw new Error(`לוגין לאיילון נכשל: ${String(result)}`);
  }
}

export async function ayalonHandleOtp(page: Page, ctx: RunnerCtx) {
  const { runId, pollOtp, clearOtp, setStatus, run } = ctx;
  const monthLabel = run?.monthLabel || "חודש נוכחי";

  const otpCode = await pollOtp(runId);
  if (!otpCode) throw new Error("קוד ה-OTP לא התקבל.");

  await setStatus(runId, {
    status: "running",
    step: "מזריק קוד אימות...",
    monthLabel,
  });

  const code = escJsString(otpCode);

  const debugBefore: any = await page.evaluate(`
    (function() {
      const isVisible = (el) => !!el && el.offsetWidth > 0 && el.offsetHeight > 0;
      const normalize = (val) => (val || "").replace(/\\s+/g, " ").trim();

      return {
        url: window.location.href,
        title: document.title,
        text: normalize(document.body.innerText).substring(0, 500),
        inputs: Array.from(document.querySelectorAll('input')).map(i => ({
          id: i.id || "",
          type: i.type || "",
          name: i.name || "",
          className: i.className || "",
          placeholder: i.getAttribute("placeholder") || "",
          alt: i.getAttribute("alt") || "",
          visible: isVisible(i),
          valueLen: (i.value || "").length
        }))
      };
    })()
  `);

  console.log("[Ayalon] Before OTP injection:", JSON.stringify(debugBefore, null, 2));

  const injection = `
    (function(code) {
      const isVisible = (el) => !!el && el.offsetWidth > 0 && el.offsetHeight > 0;

      const input2Candidates = Array.from(document.querySelectorAll('input#input_2'));
      const input = input2Candidates.find(isVisible);

      const submitCandidates = Array.from(
        document.querySelectorAll('input[type="submit"], .credentials_input_submit')
      );
      const btn = submitCandidates.find(isVisible);

      if (!input) return "NO_VISIBLE_INPUT_2";
      if (!btn) return "NO_VISIBLE_SUBMIT";

      input.value = code;

      ['input', 'change', 'blur'].forEach((ev) => {
        input.dispatchEvent(new Event(ev, { bubbles: true }));
      });

      setTimeout(() => {
        btn.click();
      }, 300);

      return "OTP_SUBMITTED";
    })('${code}')
  `;

  const result = await page.evaluate(injection);
  console.log(`[Ayalon] OTP submit result: ${result}`);

  await clearOtp(runId).catch(() => {});

  if (result !== "OTP_SUBMITTED") {
    throw new Error(`הזרקת ה-OTP נכשלה: ${String(result)}`);
  }
}