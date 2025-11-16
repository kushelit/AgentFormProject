import { chromium } from "playwright";

export default class MigdalInsurance {
  async run(options: any) {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();

    // console.log("🚀 פותח את אתר מגדל...");
    await page.goto("https://apmaccess.migdal.co.il/", { timeout: 60000 });

    // console.log("⌛ מחכה שתתחברי עם יוזר + סיסמה + טוקן...");

    try {
      // המתן להופעת מזהה שמופיע רק בדף הבית האמיתי
      await page.waitForSelector('#goToHome', { timeout: 300000 }); // עד 5 דקות
      // console.log("✅ התחברות הצליחה! ממשיך באוטומציה...");
    } catch (error) {
      // console.error("❌ לא זוהתה התחברות מלאה תוך הזמן שהוגדר.");
      await browser.close();
      return;
    }

    // כאן תוכלי להמשיך באוטומציה, למשל:
    // console.log("📄 ניגש לדוחות...");
    // לוחץ על תפריט כלים
await page.click('text=כלים');
// console.log("🛠️ נלחץ על כלים");

// ממתין לאלמנט "דוחות" ואז לוחץ
await page.waitForSelector('text=דוחות', { timeout: 15000 });
await page.click('text=דוחות');
// console.log("📄 נלחץ על דוחות");
  // ✍️ הקלדה לשדה החיפוש
await page.waitForSelector('input[placeholder*="הקלד שם דוח"]', { timeout: 15000 });
await page.fill('input[placeholder*="הקלד שם דוח"]', 'משולמים לסוכן');

// ⌨️ הקשה על Enter כדי לחפש
await page.keyboard.press('Enter');

// ⏳ המתן לתוצאת הדוח שתכיל את הטקסט "משולמים לסוכן"
await page.waitForSelector('text=משולמים לסוכן', { timeout: 15000 });

// 🖱️ לחץ על הכותרת של הדוח
await page.click('text=משולמים לסוכן');

    // בסיום
    // await browser.close();
  }
}
