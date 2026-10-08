# HANDOFF: חיזוק אבטחת המידע ב-MagicSale (לקראת עוזר AI)

> **עודכן:** 2026-10-05 (כולל השלמות מהשוואה מלאה לשיחה 992f702d).
> **מצב:** כל העבודה **בטסט בלבד** (`magicsale-test`). **שום דבר לא עלה לייצור** (`agentsale-693e8`).
> **השיחה:** התחילה בהיכרות עם מודול הטעינות ובשיחה על עוזר AI. מהר מאוד התברר שקודם צריך לאבטח את המערכת.

---

## 0. כללי עבודה. חובה לקרוא לפני הכול

1. **לכתוב לבעלת הפרויקט בעברית בלבד,** גם בהודעות הקצרות שבין פעולות. שמות קבצים, שדות וקוד נשארים כמו שהם.
2. **לא משנים קוד בלי להסביר ולקבל אישור מפורש:** קודם ממצא והצעה (קבצים ושורות), ורק אחרי אישור עורכים.
3. **🔴 אסור לגעת בייצור (`agentsale-693e8`) בשום צורה:** לא קריאה, לא שאילתה, לא פריסה ולא סקריפט.
4. **בטסט (`magicsale-test`) מותר רק לקרוא,** ורק באישור. **אין כתיבה מכל סוג,** גם לא בטסט: לא נתונים, לא השלמות (backfill) ולא פריסת חוקים או Functions. **היא פורסת בעצמה.** מותר להריץ `--dry-run` לבדיקת קומפילציה של חוקים. לפני כל קריאה מהנתונים, לכתוב לה במפורש מול איזה פרויקט היא רצה.
5. **commit עושה רק היא.** אנחנו לא מציעים ולא מבצעים commit.
6. **תמיד טסט לפני ייצור,** ותקופת מעקב בטסט לפני כל שינוי תשתיתי בייצור. היא לא רוצה למהר.
7. **אבטחת מידע של סוכנים ולקוחות קודמת לכל פיצ'ר.** כלל יסוד: **לעולם לא לסמוך על `agentId` שנשלח מהלקוח או מהמודל.**
8. **יש שיחות מקבילות** (למשל MagicTouch) שעורכות את אותם קבצים. לפני עריכה, לבדוק `git status` ולהבין מה שייך למה. למשל, ב-`ExcelCommissionImporter.tsx` יש עכשיו שינוי של ילין לפידות (`yalin_insurance`) שלא שייך לעבודה הזו.
9. **מחשב Windows.** הרבה קבצים עם שורות CRLF. עריכה עם regex דרך node או sed נכשלת לפעמים, ולכן עדיף כלי Edit. **`'use client'` חייב להיות השורה הראשונה:** בעבר הכנסת import לפניו שברה את ה-build ב-Vercel, ו-tsc לא תופס את זה.
10. **ה-TypeScript checker (`npx tsc --noEmit`) לא מספיק.** שגיאות כמו `Dynamic server usage` או `maxDuration` מתגלות רק ב-`next build` או בפריסה ל-Vercel. כדי להריץ `next build` מקומי, צריך שהיא תעצור קודם את `npm run dev`, כי שניהם משתמשים ב-`.next`.

---

## 1. סביבות

| | טסט | ייצור |
|---|---|---|
| Firebase project | `magicsale-test` | `agentsale-693e8` (אסור לגעת) |
| Firestore location | europe-west1 | nam5 |
| Functions region | europe-west1 | us-central1 (`functions/src/shared/region.ts`) |
| אתר | https://test.magicsale.co.il (Vercel, נפרס מ-commits על `master`) | ייצור ב-Vercel |
| `.firebaserc` aliases | `test` | `prod` |
| `API_AUTH_MODE` ב-Vercel | `enforce` | **לא מוגדר** |
| חוקי Firestore ו-Storage החדשים | ✅ פרוסים | ❌ עדיין החוקים הישנים |
| CORS על ה-bucket | ✅ `test.magicsale.co.il`, `localhost:3000`, GET ו-HEAD | ✅ לדבריה הוגדר |

**הגדרות התבניות שונות בין טסט לייצור.** למשל `defaultPremiumField` קובע צבירה.

---

## 2. המטרה הגדולה

**טווח קצר (מה שעשינו):** לסגור את חשיפת המידע:
- **ממשקי השרת:** 58 מתוך 64 ממשקי Next.js היו בלי שום אימות.
- **החוקים:** חוקי Firestore היו פתוחים לכל משתמש רשום, כולל אפשרות לשנות לעצמו `role` או `isSystem`. ב-Storage, מסמכי לקוחות היו פתוחים גם למשתמשים אנונימיים.

**טווח ארוך:** **עוזר AI** בתוך MagicSale שעובד על נתוני הטעינות. הוא יחקור פערים בעמלות (פוליסות בלי עמלה, ירידות, עליות בפרמיה), יכין אקסל וטיוטת מייל, ויפתח "נושאי עבודה" ששמורים ב-Firestore. **הרעיון של בעלת המוצר:** שהסוכנים יעבדו על הנתונים בתוך המערכת, במקום להוריד אקסל ולנתח בצ'אט חיצוני. **התרחיש הראשון:** "למה ירדו העמלות בחברה X". כל כלי של העוזר חייב לעבור דרך `getAuthUser` + `canAccessAgent` (ראו סעיף 4).

---

## 3. מודל הגישה לסוכנים (מאושר על ידה)

מי רשאי לגשת לנתונים של סוכן X:
- **`isSystem: true`** (רק היא; בטסט גם "הראל", לצורך בדיקות): כל הסוכנים.
- **`role: admin`:** סוכנים ומנהלים עם אותו `agencies`. היום יש רק אדמין אחד כזה, הבעלים של agency 1.
- **כל השאר:** **סוכן הבסיס.** לעובד זה ה-`agentId` שלו, ולכל אחד אחר זה הוא עצמו.
  - **בנוסף, עם ההרשאה `access_all_agents_in_group`** (לפי overrides, מסלול ותפקיד מ-`roles/{role}`): כל הסוכנים והמנהלים עם אותו `agentGroupId` כמו סוכן הבסיס. זה חל גם על עובדים.
- **מנהלים** מקושרים ב-`ManageManager` דרך `managerId` ו-`agentGroupId` ברשומות ב-`users` של הסוכנים. **מנהל עובד על הסוכנים שלו כאילו הם שלו.**
- **עובדים לא ניגשים לקבצי עמלות**, כי אין להם הרשאה למסכים האלה.
- **לסוכן, `users.agentId` שווה ל-uid שלו.** לכן שאילתה `where('agentId','==',X)` מחזירה את הסוכן ואת העובדים שלו.

**המימוש:**
- **בשרת:** `src/lib/server/auth.ts` ← `canAccessAgent`.
- **בחוקים:** המסמך המחושב `agentAccess/{uid}`, ראו שלב ב1.

---

## 4. מה נבנה. לפי שלבים, עם קבצים

### שלב א': חוקי Firestore ו-Storage הבסיסיים ✅ (טסט)
**הקבצים:** `firestore.rules`, `storage.rules`, ו-`firebase.json` (הוספנו הפניה לשני הקבצים). הגיבוי של החוקים הישנים בטסט היה בתיקיית scratchpad של השיחה, ולא נשמר בריפו.
- **`isRegistered()`:** משתמש לא אנונימי, עם רשומה ב-`users` ותפקיד מוכר. משתמש שיצר לעצמו רשומה בלי `role` לא מקבל גישה. זה סוגר את הפרצה של הרשמה ציבורית, **בלי** לכבות הרשמה ב-Auth, כי צימוד ה-Runner משתמש בהתחברות אנונימית.
- **`users`:** שדות ההרשאה (`privilegedUserFields()`) נעולים: רק `isSystem` או אדמין יכולים לשנות אותם. את `isSystem` רק `isSystem` יכול לשנות.
- **`portalCredentials`, `reengagement_leads`:** אין גישה מהדפדפן.
- **`roles`, `permissions`, `subscriptions_permissions`, `commissionTemplates`, `agentsGroup`:** כל משתמש רשום קורא, ורק אדמין כותב.
- **ה-catch-all:** משתמש רשום, חוץ מרשימת collections מוחרגים שיש להם חוקים מפורשים.

### שלב 3.0 ו-3.1: אימות בממשקי השרת ✅ (טסט, במצב enforce)
- **`src/lib/server/auth.ts`:**
  - `getAuthUser`, `canAccessAgent`, `isAdminUser`.
  - פונקציות guard: `guardUser`, `guardAdmin`, `guardAgentAccess`, `guardAgentsAccess`, `guardDocOwner`, `guardSelfOrAdmin`.
  - **מצב רישום מול חסימה:** `API_AUTH_MODE=enforce` חוסם. כל ערך אחר רק רושם.
  - **יומן:** כל בקשה שנחסמה, או הייתה נחסמת, נכתבת ל-`apiAuthLogs`: מסמך לכל צירוף של יום, ממשק, משתמש, סוכן וסיבה, עם מונה.
- **`src/lib/apiFetch.ts`:** `apiFetch`, `apiAxios` ו-`apiDownload`. כולם מוסיפים את ה-Bearer token של המשתמש המחובר.
- **מעבר הדפדפן ל-apiFetch:** כ-25 קבצים בדפדפן עברו ל-`apiFetch` או `apiAxios`. גם `src/lib/fetchCache.ts` (`postJsonCached`) עובר דרך `apiFetch`, ומתנקה כשהמשתמש מתחלף.
- **48 ממשקים עם guard.** הקבוצות:
  - **סוכן:** עמלות, היקף, תובנות, תבניות ו-insurance.
  - **אדמין:** `subscriptions`, `updateUserStatus`, `sendEmail`, `sendFailureEmail`, `sendCancelEmail`, `gemelnet/update`, `admin/template-product-values`.
  - **בעלים של משאב:** מסמכי לקוח וליד, מחיקת טעינה, `portal-run`.
  - **המשתמש עצמו או אדמין:** `cancelSubscription`, `upgrade-plan`.
  - **רק התחברות:** `export-report`.
  - **`sendReport`:** סוכן.
- **routes מסוג GET שמשתמשים ב-guard מסומנים `export const dynamic = 'force-dynamic'`.** בלי זה Next בונה אותם סטטית, וה-build נכשל עם `Dynamic server usage`.
- **`maxDuration` חייב להיות 60** לכל היותר. ערך 300 הכשיל פריסה ב-Vercel.
- **דף אדמין `/admin/api-auth-logs`:** טבלה, כפתור "העתק הכל", כפתור "בנייה מחדש לכל המשתמשים" (agentAccess), וכפתור "השלמה למסמכים קיימים". שני הכפתורים מוצגים רק למשתמש `isSystem`.
- **הורדת תבניות** (חוזים, אלמנטרי, פנסיה וסיכונים) עוברת דרך `apiDownload`, ולא `window.open`.

### מיילים מהשרת ✅
- **`src/lib/server/sendAppEmail.ts`:** הפונקציות `sendAppEmail` ו-`sendCancelSubscriptionEmail`. **לעולם לא זורקות שגיאה,** כדי לא לשבור את ה-webhook של Grow באמצע.
- **קריאה ישירה במקום HTTP ל-`/api/sendEmail`:** ב-`webhook`, `reviveWorker`, `leadsApi`, `cancelSubscription` ו-`src/lib/MagicTouch/magicTouchAccountEmails.ts`.
- **`/api/sendEmail` ו-`/api/sendCancelEmail`:** לאדמין בלבד.
- **`src/components/subscriptionActions/subscriptionActions.ts`:** נמחק. זה היה קוד מת.
- **קוד השחזור של SendGrid** שהיה בהערה ב-git: היא החליפה את הקודים. ✅

### הרשמה דרך Grow והטלפון כזהות ✅
- **הטלפון מזהה את הסוכן מול בוט הוואטסאפ** (`functions/src/shared/commissionAssistant/commissionAssistantUserLookup.ts` מחפש לפי `users.phone`). לכן **אסור לשנות טלפון דרך הרשמה ציבורית.**
- **`src/app/api/create-subscription/route.ts`:**
  - החייאה של מייל מושבת מותרת רק עם הטלפון של אותו חשבון. אחרת מופיעה הודעה עם הפניה לתמיכה.
  - בדיקת "טלפון של משתמש אחר" נעשית גם מול `users.phone` (`findPhoneOwnerUid`).
  - בשדרוג (`existingUserUid`), המייל והטלפון נלקחים מהרשומה ולא מהבקשה.
- **`src/app/api/webhook/route.ts`:**
  - בחידוש, קודם מבטלים השבתה.
  - כשל בעדכון הטלפון לא עוצר את החידוש: נשמר הטלפון הקיים, והבעיה נרשמת ב-`logRegistrationIssue`.
  - ה-`catch` כבר לא ריק.
- **`src/app/api/admin/update-user-phone/route.ts`** (אדמין, תמיד חוסם), וכפתור "עדכון טלפון" ב-`SubscriptionsTable.tsx`:
  - מוודא שהמספר לא שייך למשתמש אחר.
  - מעדכן Auth, MFA ו-`users.phone`, שומר `phoneHistory`, ומבצע revoke tokens.
- **`src/lib/phoneE164.ts`:** נרמול טלפון.

### MFA: "שלח קוד שוב" ✅
`src/app/auth/log-in/page.tsx` ו-`src/app/MagicTouchLogin/MagicTouchLoginClient.tsx`.
- **הבעיה:** SMS ראשון למספר חדש לפעמים לא מגיע. זו השערה: חסימה אצל המפעיל או ספאם. מבחינתנו המסך עבר לשלב "הזן קוד", כלומר Firebase שלח.
- **התיקון:** כפתור שליחה חוזרת עם המתנה של 30 שניות, והערה על תיקיית הספאם.

### שלב ב1: `agentAccess` ✅ (טסט: Functions פרוסות, הבנייה רצה, העדכון האוטומטי אומת)
- **`functions/src/shared/agentAccess.ts`:** `computeAgentAccess`, `syncAgentAccess`, `affectedByUserChange` ו-`hasGroupPermission`. האחרונה היא מראה של `src/lib/permissions/hasPermission.ts`, וצריך לשמור אותן מסונכרנות.
- **`functions/src/syncAgentAccess.ts`:**
  - `syncAgentAccessOnUserWrite`, `syncAgentAccessOnPlanWrite`, `syncAgentAccessOnRoleWrite`.
  - `rebuildAgentAccess`: callable, למשתמש `isSystem` בלבד.
  - כולן מיוצאות ב-`functions/src/index.ts`.
- **המסמך:** `agentAccess/{uid} = { all, agentIds[], groupId, updatedAt }`. המשתמש קורא רק את המסמך שלו, ורק השרת כותב.
- **`src/lib/agentScope.ts` (בדפדפן):**
  - `getMyAgentScope`.
  - `getDocsForMyAgents`: שאילתות `in`, בחלקים של 10.
  - `getAgentDocs`: הסוכן הנבחר, או "כל הסוכנים שלי".
  - **אם אין מסמך `agentAccess` בסביבה, למשל בייצור היום,** הכלי חוזר להתנהגות הקודמת, בלי סינון. זה מכוון, כדי שהקוד יוכל להגיע לייצור לפני שה-Functions פרוסות שם.

### שלב ב2: קריאת `users` מוגבלת ✅ (טסט, נבדק כולל בדיקת REST: משתמש אחר ← 403)
- **`allow get`:** המשתמש עצמו, `isSystem`, סוכן ברשימה, עובד של סוכן ברשימה, קבוצה (`groupId`), או אדמין באותה סוכנות.
- **`allow list`:** אותו דבר, אבל השאילתות חייבות לסנן לפי `agentId`, `agentGroupId` או `agencies`.
- **`TeamPermissionsTable`:** ה-fallback שטען את כל המשתמשים במערכת תוקן.

### עדכון הרשאות דרך השרת ✅
- **`src/app/api/team-permissions/update/route.ts`** (תמיד חוסם). הוא אוכף בשרת:
  - למבקש יש `edit_permissions`;
  - ההרשאה היא לא `*` ולא `planLocked`, ו-`restricted` מותר רק לאדמין;
  - היעד בעץ של המבקש: המבקש עצמו, סוכן ברשימה שלו, או עובד של סוכן כזה.
  - **לוגיקת ההוספה וההסרה זהה לזו שהייתה במסך.**
- **`TeamPermissionsTable.tsx`** שולח לשרת. בחוקים, `permissionOverrides` פתוח לכתיבה מהדפדפן רק לאדמין.

### שלב ב3: לקוחות, עסקאות, הסכמים, משימות, הערות ומסמכים ✅ (טסט)
**ב3א, קוד:**
- **הסכמים** (4 מקומות טענו את ה-contracts של **כל** הסוכנים): עברו ל-`getDocsForMyAgents('contracts','AgentId')`. הקבצים: `customers/[id]/page.tsx`, `NewCustomer.tsx`, `useProfitByLeadSourceData.ts`, `useSalesCalculateData.tsx`.
- **`useSalesData`, `useCommissionCalc`, `useFetchGraphData`:** עברו ל-`getAgentDocs` ("כל הסוכנות" = הסוכנים של המשתמש).
- **`AgentForm.tsx` נמחק.** זה היה קוד מת, ועדכן לקוח לפי ת"ז בלי סינון לפי סוכן.
- **`NewLeads.tsx` ו-`LeadPage.tsx`:** משימות והערות מסוננות לפי `agentId`. בהמרת ליד, `AgentId` עובר למסמך הלקוח.
- **`TasksHub.tsx`:** מסונן לפי `AgentId`.
- **`AgentId` על מסמכי לקוח וליד:**
  - **בהעלאה:** `src/lib/server/documentOwners.ts` (`agentIdOf`). הקבצים: `customerDocuments/upload`, `leadDocuments/upload`, `integrations/prosaas`.
  - **השלמה לקיימים:** `backfillDocumentOwners` ו-`/api/admin/backfill-document-owners`. **רצה בטסט:** 15 מסמכי ליד הושלמו, ו-3 יתומים בלי ליד מתאים.
- **`NewCustomer.tsx`:** פונקציית הגירה מתה (`createCustomersFromSales`) נמחקה.
- **`SharonPage.tsx`:** מסמכי לקוח מסוננים לפי `AgentId`.

**ב3ב, חוקים:** ל-`customer`, `sales`, `contracts` ו-`customerDocuments` (`AgentId`), ול-`customerNotes` ו-`customerTasks` (`agentId`).
- **משימות:** מותר גם `assignedTo == uid`.
- **`isSystem()` נבדק ראשון.**
- **קריאה של מסמך שלא קיים מותרת** (`resource == null`).

### שלב ב4א: נתוני עמלות ✅ (טסט, נבדק מקיף)
- **חוקים לפי `agentId`:** `policyCommissionSummaries`, `externalCommissions`, `commissionSummaries`, `ymCommissionSummaries`, `commissionImportRuns`, `commissionImportQueue`, `importRuns`, `commissionSplits`, `commissionLinks`, `agentPortalFilters`, `tierCalcRuns`, `agentInsightsCache`. האחרון: רק השרת כותב.
- **חוקים לפי מזהה המסמך:** `agentImportState/{agentId}`, `tierThresholds/{agentId}` (כולל `default` משותף), ו-`portalAgentCodeIncludeList/{agentUid}_{portalId}`.
- **פונקציות עזר בחוקים:** `readByAgentId()`, שכולל `resource == null`, `deleteByAgentId()`, `createByAgentId()` ו-`updateByAgentId()`.
- **תיקוני קוד:**
  - `MagicSalesTableWithStatus.tsx`, `AutomaticRunsDashboard.tsx`: התור ומחיקה מהכרטיס מסוננים לפי סוכן.
  - `ExcelCommissionImporter.tsx`: מחיקת טעינה קיימת מסוננת לפי סוכן.
- **טעינה ידנית:**
  - **הודעת כשל למשתמש:** "הטעינה נכשלה. נסו שוב, ואם הבעיה חוזרת פנו לתמיכה." **לא להפנות משתמש ל-Console.**
  - ב-Console נרשם `handleImport error at step "<שלב>"`. ה-`importStep` **עדיין לא עשה commit.**
- **לקח:** הטעינה הידנית קוראת מסמך סיכום שעדיין לא קיים (`manualCommissionRecompute.ts:102`). בלי `resource == null` היא נכשלה, ובנוסף השאירה שורות יתומות ב-`externalCommissions`. אלה נוקו על ידה.

### ProSaaS ✅
`src/app/api/integrations/prosaas/route.ts` מחזיר `410`, אלא אם מוגדר `PROSAAS_ENABLED=true`. ההתקשרות הסתיימה. הקוד נשמר.

### ממשקים ציבוריים: חלקי
- ✅ `charge-token` ו-`create-token-only-payment` מחזירים `410` (**לא עשו commit**). הם לא היו בשימוש. `charge-token` היה מאפשר לחייב כרטיס שמור בכל סכום.
- ⏳ שאר הנושאים בסעיף 6.

### קישורים חתומים לקבצים: ✅ פרוס בטסט ונבדק ברובו (2026-10-05)
נבדקו: מסמכי לקוח (פתיחה והעלאה), הורדת קבצי טעינה מהכרטיס (סוכן, אדמין ומנהל קבוצה), הורדה ב-PURGE. נבדקו גם מסמך ליד ופקיעת קישור. **נותר:** עובד שפותח מסמך לקוח של הסוכן שלו (היא תקים עובד לבדיקה).
- **`src/app/api/files/signed-urls/route.ts`** (תמיד חוסם):
  - `{kind:'customerDocuments'|'leadDocuments', ids}` ← הבעלים לפי `AgentId` של המסמך. הקישור תקף ל-15 דקות.
  - `{kind:'commissionFiles', files:[{bucket,storagePath}]}` ← רק `portalRuns/{uid}/...` או `commission-imports/{uid}/...`. הבעלים לפי ה-uid שבנתיב. **עובד נחסם.** הקישור תקף ל-5 דקות.
  - חותם רק קבצים מה-bucket של הפרויקט, ומנסה גם `.appspot.com` וגם `.firebasestorage.app`.
- **`src/lib/fileLinks.ts`:** `getDocumentLinks` ו-`getCommissionFileLinks`.
- **החלפת `getDownloadURL`:** אין יותר קריאות כאלה בקוד. הקבצים: `SharonPage.tsx`, `NewLeads.tsx`, `AutomaticRunsDashboard.tsx` (הורדה מהכרטיס ובניית ZIP, צריך CORS) ו-`admin/commission-purge/page.tsx`.
- **`storage.rules`:** `customerFiles` ו-`leadFiles` פתוחים לקריאה רק ל-`isSystem`. **`portalRuns` ו-`commission-imports` לא שונו בכוונה,** כדי לא לשבור את ה-Runner ואת התוסף.
- **למה זה נחוץ:** `getDownloadURL` יוצר קישור עם token קבוע שעוקף את החוקים. בנוסף, היום מנהל לא יכול להוריד קבצי עמלות של סוכן בקבוצה שלו, כי החוק מאפשר רק לבעלים או לאדמין.
- **MagicTouch כבר עובד כך:** קבצים ב-`agents/{agentId}/...`, ו-`getMagicTouchWhatsAppMediaUrl` עם `getSignedUrl`.

### שונות
- **`next.config.mjs`:** `experimental.optimizePackageImports` (`lucide-react`, `recharts`, `chart.js`, `date-fns`). זה נועד לשפר את ה-local, שהיה איטי בגלל הידור של webpack ב-Next 14.1. הומלץ גם להחריג את התיקייה ב-Defender ולנסות `--turbo`.
- **`.gitignore`:** `tmpclaude-*`. אלה קבצים זמניים של Claude Code.
- **WhatsApp Embedded Signup, מספר ושם תצוגה (תיקון MagicTouch שבוצע כאן):** Meta מחזירה ב-Embedded Signup רק מזהים, ולכן "מספר מחובר" ו"שם תצוגה" הופיעו "לא הוגדר". עכשיו `saveAgentWhatsAppConfig` שולף מ-Meta את `display_phone_number` ואת `verified_name` אחרי החלפת הקוד ב-token (`fetchWhatsAppPhoneNumberDetails`, לא זורקת שגיאה), שומר אותם ב-`config/whatsapp` וב-`whatsapp_phone_mappings`, ומחזיר אותם ללקוח. `WhatsAppEmbeddedSignup.tsx` מציג אותם מיד. **חיבור קיים מתעדכן רק בחיבור מחדש.** שגיאות ה-eslint בקובץ (70) היו קיימות קודם.

---

## 5. החלטות חשובות (לא לשנות בלי לשאול)

- **מחיקה מ-`/admin/commission-purge` משאירה את `portalImportRuns` ואת `portalImportLocks` בכוונה,** ולכן הכרטיס נשאר ירוק. כך אפשר למחוק קובץ אחד מתוך ריצה. מחיקה מלאה עושים מהכרטיס (`AutomaticRunsDashboard.handleDeleteRun`). **לא "לתקן".** הכרטיס קורא קודם את הנעילה (`useAutomationDashboardStatus.ts`).
- **מסכי האדמין** (`commission-purge`, טבלת מנויים, מיפוי מוצרים, `agent-portal-filters`) **בשימוש שלה בלבד** (`isSystem`). שאילתות בלי סינון לפי סוכן מותרות שם רק ל-`isSystem`.
- **החיבור של הסוכן לטעינה בלי צימוד ידני הוא משימה נפרדת.** לא לערבב. בינתיים רק לוודא שהצימוד לא נשבר. **הערה:** הצימוד היום נותן ל-Runner token עם הזהות **המלאה** של הסוכן.
- **`customerFiles` ו-`leadFiles`:** היום רק סוכן שעזב השתמש בהם, אבל **בעתיד סוכנים וגם הבוט של MagicTouch ישתמשו.** לכן בנינו קישורים חתומים, ולא חסמנו את הפיצ'ר.
- **תוכן שיווקי ציבורי, כמו סרטון הדיוור** (`public-marketing/...`, דרך `/commissions-video`), נשאר ציבורי. לא נוגעים בו.
- **ProSaaS כבוי.**

---

## 6. באגים וממצאים פתוחים

| # | נושא | פרטים | סטטוס |
|---|---|---|---|
| 1 | **ה-webhook של Grow בלי אימות** | אפשר לזייף "תשלום הצליח" ולקבל חשבון או שדרוג בחינם. **התוכנית שהוצעה:** `notifyUrl` עם `?key=SECRET` להרשמות חדשות (נקבע ב-`create-subscription/route.ts:347`). בקשה בלי מפתח תוכל **רק** לעדכן מנוי קיים לפי `subscriptionId`: לא ליצור, לא להחיות ולא לשדרג. **שאלה פתוחה מול Grow:** לאן נשלחים עדכוני החיוב החודשי של מנויים קיימים? | ⏳ היא ביקשה לדחות. **לא לבנות בלי אישור** |
| 2 | **הגבלת קצב** | `validate-coupon`, `magic-touch/reset-password`, `contact`, `create-subscription`. ב-`contact` גם **ניקוי HTML** בהודעה (היום היא נכנסת למייל כ-HTML גולמי) | ⏳ |
| 3 | **ב4ב: ריצות הפורטל** | `portalImportRuns`, `portalImportLocks`, `portalRunnerStatus`, `portalExtensionStatus`, `portalRunBatches` עדיין תחת ה-catch-all, כלומר כל משתמש רשום. ה-Runner שולף ריצות **לפי `batchId` בלבד** (`scripts/portalRunner/src/runner.ts:594`), ולכן חוק לפי בעלים ישבור אותו. צריך עדכון ל-Runner (OTA) ולתוסף הכרום. **קוד התוסף הועבר לריפו (2026-10-06): `scripts/portalRunner/extension`**, יחד עם `integration/`, `tests/`, `scripts/build-extension.cjs` ו-`README.extension.md`. מהמיקום החדש הבנייה עברה (`npm run build:extension`), וגם 24 הבדיקות, והתוצר זהה לתוסף שהיה בנוי. התיקייה הישנה `C:\projects\portalRunner-extension` נשארת כארכיון עד שהיא תתקין מהמיקום החדש. ב-`secrets/` שלה יש מפתח service account של הטסט: הוא לא נכלל ב-zip וב-`dist-extension`, ולא הועבר. נבדק ב-2026-10-06: Runner ותוסף ניגשים רק ל-`portalImportRuns`, `portalImportLocks`, `portalRunnerStatus`/`portalExtensionStatus`, `company` ו-Storage `portalRuns/`, ול-callables. **לכן הם לא הושפעו מהשינויים עד עכשיו.** לקראת ב4ב, בכל אחד יש שאילתה אחת לפי `batchId` בלבד: `runner.ts:597` ו-`extension/jobs.ts:101`. צריך להוסיף לשתיהן `where('agentId','==',uid)`, וכנראה גם אינדקס | ⏳ |
| 4 | **ב5: לידים** | `leads`, `sourceLead` (כולל **מאגר לידים**, `ManagePoolAgents`: לידים מ-API שמחולקים בין X סוכנים בפול), `leadDocuments` (נשלף לפי `leadId` בלבד), `statusLead`, יעדים, `promotion`, `stars` ועוד. צריך מיפוי | ⏳ |
| 5 | **קישורים קבועים ישנים** במסמכי לקוחות ולידים | צריך סקריפט שמוחק את `firebaseStorageDownloadTokens` מהקבצים הקיימים ב-`customerFiles` וב-`leadFiles`. **היא מריצה, אחרי שהקישורים החתומים נבדקו.** בקבצי עמלות אין צורך, כי רק היא הורידה עד היום | ⏳ לכתוב סקריפט |
| 6 | **`checkServerPermission.ts`** | טוען את הרשאות התפקיד מ-`roles_permissions`, והמסכים משתמשים ב-`roles`. לכן עובד עם הרשאה מהתפקיד נדחה. `sendReport` כבר עבר ל-`guardAgentAccess`, אבל הקובץ עדיין קיים, ואולי בשימוש במקום אחר | ⏳ לבדוק ולתקן |
| 7 | **פירוט "לפי חודש פרסום"** | נשען על `portalImportRuns` (`src/lib/server/drillHelpers.ts` ← `jobIdsForYm`). אם הריצה נמחקה, הטבלה ריקה. אצל נעמה זה קרה כי היא מחקה ריצה ידנית ב-Firestore. **שיפור מוצע:** לחפש גם ב-`commissionImportRuns` לפי `agentId`, `companyId` ו-`ym` | 💡 לא דחוף |
| 8 | **ניסוח ההודעה "לא נותרו שורות לטעינה..."** | מופיעה כשסינון מספרי הסוכן (`agentPortalFilters`) מסנן את כל השורות. הניסוח מזכיר "השלמת ת"ז" ומטעה. **הוצע:** לציין אילו מספרי סוכן מוגדרים ואילו קיימים בקובץ | 💡 |
| 9 | **טעינת אקסל עסקאות בלשונית סיכונים** | לפי הדיווח, ההודעה אומרת שהטעינה הצליחה, הלקוח נטען, אבל העסקה לא. כנראה לא קשור לאבטחה. היא תעלה קובץ לדוגמה | ⏳ לא נחקר |
| 10 | **נתונים ישנים בלי שדה סוכן** | עסקאות, לקוחות או עמלות בלי `AgentId`/`agentId` גלויים רק ל-`isSystem`. בטסט נשארו 3 מסמכי ליד יתומים בלי `AgentId` | לבדוק בייצור לפני עלייה |
| 11 | **אינדקסים** | טסט וייצור לא מסונכרנים. בבדיקות נוצר בטסט אינדקס `portalImportRuns(agentId, status, createdAt desc)` לשאילתת השחזור ב-`ExcelCommissionImporter.tsx:647`, שנכשלה בשקט מאוגוסט. **הוצע:** לנהל `firestore.indexes.json` בריפו | 💡 |
| 12 | **`agent-insights/debug`** | מוגן במפתח שעובר ב-URL. אפשר לשקול להסיר את הממשק | 💡 |
| 13 | **⚠️ טעינה ידנית של מנהל או עובד עבור סוכן אחר** | בטעינה ידנית הקוד מעדכן `agentCodes` ברשומת הסוכן ב-`users` (`ExcelCommissionImporter.tsx:2461`, `arrayUnion`). חוק העדכון (`firestore.rules:127-131`) מתיר רק לסוכן עצמו, לעובד שלו (`me.agentId == uid`), למי שמופיע ב-`managerId` של הסוכן, ולאדמין. **ייתכן שייחסמו:** מנהל שהקשר שלו לסוכן הוא רק דרך `agentGroupId` (בלי `managerId`), ועובד עם `access_all_agents_in_group`. זה קורה רק כשבקובץ יש מספר סוכן שעוד לא שמור. **נבדק עד היום רק כשהסוכן עצמו מחובר.** **נפתר בקוד (החלטה שלה):** `users.agentCodes` שימש רק את רשימת הבחירה "מספר סוכן" בהשוואה בין חודשים, ולא דוחות. עכשיו `CommissionComparison` בונה את הרשימה משורות ההשוואה, והטעינה הידנית כבר לא כותבת ל-`users`. הטעינה האוטומטית (`commitRun.ts`, בשרת) ממשיכה למלא את השדה, וזה לא מזיק | ✅ נבדק בטסט: טעינה ידנית עוברת, והרשימה בהשוואה נטענת מהדוח |
| 14 | **אפליקציית MagicTouch לנייד** | אם היא קוראת ישירות מ-Firestore, חוקי ב2–ב4א חלים עליה. היא מתחברת בשם הסוכן, ולכן אמורה לעבוד, אבל זה לא נבדק. הקוד נמצא בפרויקט נפרד (`magictouch-mobile`) | ⏳ לבדוק |
| 15 | **"כל הקבוצה" למנהל** | בבחירת סוכן, האפשרות "כל הסוכנות" מוצגת רק לאדמין (`detail?.role === 'admin'`). מנהל בוחר סוכן אחד בכל פעם. זה פיצ'ר חדש ולא חלק מהאבטחה | 💡 פיצ'ר |
| 16 | **`anomaly-policies` איטי** | בניתוח ה-trace של local הוא לקח 62–90 שניות גם אחרי הידור. שאר הממשקים לוקחים פחות משנייה | 💡 לבדוק בנפרד |
| 17 | **שמירה על האבטחה לאורך זמן** | מהתוכנית המקורית, ולא נבנה: (א) בדיקה אוטומטית לכל ממשק: בקשה בלי טוקן ובקשה לסוכן אחר חייבות להיכשל; (ב) יומן פעולות רגישות: מחיקה, ייצוא ושליחה | 💡 |
| 18 | **`src/lib/MagicTouch.zip` ב-git** | נבדק ואין בו סודות, אבל אין סיבה שיישאר בריפו | 💡 |
| 19 | **🔴 דחיפות בייצור** | בייצור, `customerFiles` ו-`leadFiles` ב-Storage פתוחים גם למשתמש **אנונימי**, וכל משתמש רשום יכול לשנות לעצמו `role` או `isSystem`. לכן כדאי לא לדחות יותר מדי לפחות את חוקי שלב א' בייצור | ⏳ החלטה שלה |
| 21 | **🔴 ב6: MagicTouch בחוקים** | עדיין תחת ה-catch-all, כלומר כל משתמש רשום יכול לקרוא, לכתוב ולמחוק: `agents/{agentId}/**` (`magic_touch_contacts`, `magic_touch_flow_runs`, `magic_touch_events`, `whatsapp_templates`, `config`, `secrets` ועוד), `whatsapp_conversations` (+`messages`), `whatsapp_phone_mappings`, `whatsapp_inbound_messages`. **כלומר אנשי קשר ותוכן שיחות וואטסאפ של לקוחות.** ב-`secrets` ה-tokens של WhatsApp, Google ו-Microsoft מוצפנים (AES-GCM), אבל אפשר לדרוס או למחוק אותם. **טעות קודמת שלנו:** חוק ה-`false` של `agents/{agentId}/reengagement_leads` לא חוסם בפועל, כי ה-catch-all (`{collection}=agents`) מתיר את אותו נתיב. מה שהשיחה של MagicTouch הציעה: קריאה לפי `agentAccess`; `secrets` ו-`whatsapp_phone_mappings` לשרת בלבד. הווב והמובייל קוראים את `whatsapp_conversations` לפי `agentId`, והמובייל כותב `unreadCount: 0` | ✅ **פרוס ונבדק בטסט** (2026-10-05). מיפוי ווב+מובייל הושלם. **החלטה שלה:** ב-Touch יש גישה רק לסוכן עצמו ול-`isSystem` (`isTouchOwner`). אין גישה לעובד, למנהל או לאדמין סוכנות, כי זה עוד לא קיים במוצר. כשייבנה, מחליפים ל-`canAccessAgent` |
| 20 | **קטנים** | הניסוח "0 הוסרו" בכפתור הבנייה מחדש מבהיל. ההצעה: "X משתמשים נבדקו, X סיכומי גישה עודכנו, 0 סיכומים ישנים נמחקו". שדרוג עתידי ל-Next 14.2/15 (Turbopack יציב) | 💡 |

---

## 7. הצעדים הבאים, לפי סדר

1. **לסיים את הקישורים החתומים** (קוד מוכן):
   - היא עושה commit (כולל `importStep` ו-`charge-token`), ממתינה ל-Ready, ופורסת `firebase deploy --only storage --project test`.
   - **בדיקות:**
     - סוכן פותח מסמך לקוח ומסמך ליד, ומעלה מסמך חדש.
     - הורדה מהכרטיס.
     - **מנהל מוריד מהכרטיס של סוכן בקבוצה.**
     - עובד פותח מסמך לקוח.
     - הורדה ב-PURGE.
     - קישור שפג אחרי 16 דקות.
     - טעינה ידנית עוברת, וברשימת "מספר סוכן" בהשוואה בין חודשים מופיעים המספרים שבשורות (סעיף 6 #13).
   - אחר כך: סקריפט ביטול token-ים קבועים (סעיף 6 #5).
2. **ממשקים ציבוריים:** הגבלת קצב, וניקוי HTML ב-`contact`. ה-webhook של Grow רק באישור.
3. **ב4ב:** לברר איפה קוד תוסף הכרום, להוסיף `agentId` לשאילתות ה-Runner, לעשות OTA, ורק אז חוקים.
4. **ב5:** לידים ומאגר הלידים.
5. **עלייה לייצור:** לפי הצ'ק ליסט בסעיף 8.
6. **רק אחרי האבטחה:** עוזר ה-AI. תכנון: מילון נתונים, הוצאת הלוגיקה מממשקי השרת לפונקציות ב-`src/lib`, שדרוג `src/lib/ai/client.ts` ל-tool use ו-multi-turn (היום `claude-sonnet-4-5`, וכדאי מודל עדכני), מדיניות מידע למודל, ו-collection של נושאי עבודה עם הפרדה לפי סוכן.

---

## 8. צ'ק ליסט לעלייה לייצור (היא מבצעת הכול)

> עודכן 2026-10-06. **העיקרון:** כל שלב בטוח בפני עצמו ואפשר לעצור אחריו. קוד ופונקציות עולים קודם, כי הם לא חוסמים כלום: `agentScope` חוזר להתנהגות הקודמת כשאין `agentAccess`, והממשקים במצב `log`. החוקים עולים **אחרונים**, ורק אחרי ש-`agentAccess` בנוי, אחרת כולם ייחסמו. ל-Claude אסור לגעת בייצור, ולכן כל פקודה כאן היא שלה.

**שלב 0: הכנה, בלי שינוי בייצור**
- [x] **איך קוד מגיע לייצור:** commit ל-master נבנה כ-**Preview**, כלומר הטסט. אחרי שהיא בודקת, היא לוחצת ב-Vercel **Promote to Production**. את Functions היא פורסת לייצור במקביל, או לפני.
- [ ] **ה-promote מעלה את כל מה שנמצא ב-commit,** כולל עבודה של שיחות מקבילות (למשל MagicTouch). לפני promote צריך לוודא שכל מה שבו מוכן לייצור, ושה-Functions שהוא צריך כבר פרוסות בייצור.
- [ ] **משתני סביבה:** ב-Vercel, `API_AUTH_MODE=enforce` צריך להיות מסומן **רק ל-Preview**, ולא ל-Production. אחרי ה-promote הראשון צריך לבדוק ב-`/admin/api-auth-logs` של הייצור שהשורות מופיעות עם `mode: log`. אם מופיע `enforce`, הייצור קיבל את המשתנה של ה-Preview.
- [x] **גיבוי חוקים:** חוקי הייצור הועתקו מהקונסולה (2026-10-06), והיא שומרת אותם לשחזור. **ההשוואה הראתה:** חוקי ה-Firestore בייצור זהים לחוקים שהיו בטסט לפני העבודה, כלומר המעבר כבר נבדק בטסט. ב-Storage של הייצור היה חוק `public-marketing` (קריאה ציבורית), שלא היה בקובץ. **הוא הועתק ל-`storage.rules`**, ו-dry-run עבר.
- [x] **CORS** ב-`agentsale-693e8.firebasestorage.app` (נבדק 2026-10-06): `https://magicsale.co.il` ו-`https://www.magicsale.co.il`, GET ו-HEAD, `Content-Type` ו-`Content-Disposition`. ✅ ה-bucket הישן `agentsale-693e8.appspot.com` לא קיים בייצור (404), ולכן אין מה להגדיר שם.
- [ ] **אינדקסים:** להשוות בין `firebase firestore:indexes --project prod` (קריאה בלבד, היא מריצה) לבין הטסט. בטסט נוצר `portalImportRuns(agentId, status, createdAt desc)`.
- [x] **דוח מוכנות (2026-10-06), `scripts/prod-readiness-check.ps1`, קריאה בלבד, היא מריצה:**
  - **בייצור:** 109 משתמשים. לכולם `role` מוכר. אין עובדים יתומים, ואין אי-התאמה בקבוצות. בנתוני העמלות, בלקוחות, בהסכמים, במשימות, בהערות וב-`whatsapp_conversations` אין מסמכים חסרים.
  - ✅ `isSystem` מסומן רק ל-`WmLYPsV1XeUuFlZr9gfYBvc3Wxq1` ('נעמה כהן', admin). **זה המשתמש שלה בייצור.** (בטסט ה-isSystem הוא 'הראל כהן'.)
  - עסקה אחת בלי `AgentId`: `sales/zxrIm4EOwXrLqebDVbih` (לקוח 'כגככ רררר', ת"ז 33552, בלי חברה ובלי מוצר). זה נתון בדיקה ישן, והיא מטפלת בו ידנית.
  - **פתוח:** `customerDocuments` (66/66) ו-`leadDocuments` (89/89) חסרים `AgentId`. הכפתור "השלמה" בשלב 3 ישלים אותם. **להריץ את הדוח שוב לפני שלב 5.**
- [ ] **נתוני משתמשים:**
  - `isSystem` רק לה.
  - לכל משתמש יש `role` מוכר (agent, manager, worker, admin). מי שאין לו יאבד גישה.
  - `agentGroupId` של סוכנים זהה לזה של המנהל, ו-`agencies` עקבי.
- [ ] **מסמכים בלי שדה סוכן:** ב-`customer`, `sales`, `contracts` (`AgentId`), ובנתוני העמלות ו-`whatsapp_conversations` (`agentId`). אחרי החוקים הם יהיו גלויים רק ל-`isSystem`. צריך להחליט מה לעשות איתם.
- [ ] **התחברות אנונימית נשארת פעילה** בשביל צימוד ה-Runner.

**שלב 1: Functions לייצור (us-central1)**
- [ ] **agentAccess:** `syncAgentAccessOnUserWrite`, `syncAgentAccessOnPlanWrite`, `syncAgentAccessOnRoleWrite`, `rebuildAgentAccess`.
- [ ] **MagicTouch, אם הגרסה שלו עולה עכשיו (לתאם עם שיחת MagicTouch):** `saveAgentWhatsAppConfig`, `whatsappWebhook`, `sendWhatsAppConversationMessage`, `disconnectAgentWhatsApp`.
- [ ] תמיד עם `--only functions:<שם>,...` ו-`--project prod`. אם הפריסה שואלת על מחיקת פונקציות, עונים N.

**שלב 2: Vercel ייצור**
- [ ] `API_AUTH_MODE` **לא מוגדר**, כלומר מצב log. `PROSAAS_ENABLED` לא מוגדר.
- [ ] פריסת הקוד: **Promote to Production** של ה-Preview שנבדק, רק **אחרי** שלב 1. **בטוח בלי החוקים:** הקישורים החתומים ועדכון ההרשאות עוברים דרך השרת (Admin SDK), והטעינה הידנית כבר לא כותבת ל-`users`.

**שלב 3: נתונים (כפתורים ב-`/admin/api-auth-logs`, רק ל-isSystem)**
- [ ] "בנייה מחדש לכל המשתמשים". אחר כך בדיקה מדגמית ב-`agentAccess`: סוכן, עובד, מנהל, אדמין סוכנות ו-isSystem.
- [ ] "השלמה למסמכים קיימים". אחר כך בדיקה של המסמכים היתומים.

**שלב 4: מעקב במצב log, כמה ימים**
- [ ] כל יום: `/admin/api-auth-logs` ← "העתק הכל" ← לשלוח לבדיקה. כל השורות צריכות להיות `mode: log`.
- [ ] **מה מצופה בלוג:** בקשות בלי token מדף שנשאר פתוח אחרי שפג החיבור (`no valid token`). **מה מחייב בדיקה:** `agent not in scope`, `not admin`, או ממשק שחוזר הרבה פעמים.
- [ ] כשהלוג נקי: `API_AUTH_MODE=enforce` ← Redeploy ← עוד יום מעקב, עכשיו עם `mode: enforce`.

**שלב 5: החוקים, אחרונים**
- [ ] `firebase deploy --only firestore:rules,storage --project prod`. זה כולל את כל השלבים: א', ב2–ב4א, ב6 (MagicTouch) וקישורים חתומים.
- [ ] ממתינים כדקה, והמשתמשים מתחברים מחדש. בטסט הייתה טעינה שנכשלה מיד אחרי פריסה, ועברה אחרי כמה דקות.
- [ ] **שחזור:** להדביק בקונסולה את הגיבוי משלב 0 ולפרסם. אפשר גם לבטל את `API_AUTH_MODE` ולעשות Redeploy.

**שלב 6: בדיקות עשן בכל התפקידים**
- **MagicSale:** לקוחות, עסקאות, הסכמים, משימות והערות, מסמכי לקוח וליד (קישור חתום), טעינה ידנית ואוטומטית (Runner ותוסף), מחיקה והורדה מהכרטיס (כולל מנהל קבוצה), סיכומים ופירוטים, השוואות, תובנות, דירוג, טבלת הרשאות, Grow (הרשמה, חידוש וביטול), יצירת עובד, התחברות עם MFA.
- **MagicTouch:** שיחות במובייל ובווב, סימון כנקרא, תבניות, הגדרות WhatsApp/Google/Microsoft, Onboarding.
- **בדיקת חסימה מה-Console:** לפי סעיף 9, עם `agentsale-693e8` במקום `magicsale-test`. משתמש אחר, לקוח אחר ושיחה אחרת צריכים להחזיר 403.

**שלב 7: אחרי שהכול יציב**
- [ ] סקריפט שמבטל את הקישורים הקבועים הישנים (`firebaseStorageDownloadTokens`) ב-`customerFiles` וב-`leadFiles` (סעיף 6 #5). Claude כותב אותו, והיא מריצה.

---

## 9. כלים ושיטות בדיקה שימושיים

- **יומן ממשקים:** `/admin/api-auth-logs` ← "העתק הכל". צריך לבדוק עמודת `mode` (`log` או `enforce`).
- **בדיקת חוקים בדפדפן, בלי ה-SDK:** ב-Console, להקליד ידנית `allow pasting`, ואז להריץ סקריפט שלוקח את ה-token מ-IndexedDB (`firebaseLocalStorageDb` ← `stsTokenManager.accessToken`) ופונה ל-REST: `https://firestore.googleapis.com/v1/projects/magicsale-test/databases/(default)/documents/<collection>/<id>`. **הצפוי לסוכן רגיל:** המשתמש שלו מחזיר 200, משתמש אחר 403, ורשימה 403.
- **בדיקת Network:** F12 ← Network ← סינון לפי שם ה-route ← Payload ו-Response. שימי לב ש-`postJsonCached` טוען פירוטים מראש, במעבר עכבר.
- **קריאה מנתוני הטסט (רק באישור שלה):** ה-token של Firebase CLI ב-`~/.config/configstore/firebase-tools.json`.
  - חידוש ה-token: `firebase firestore:indexes --project test`, שהיא פעולת קריאה בלבד.
  - שאילתה: `runQuery` ב-REST מול `projects/magicsale-test`.
  - **לכתוב תמיד את שם הפרויקט בקוד ובהודעה. לעולם לא ייצור.**
- **בדיקת קומפילציה של חוקים:** `firebase deploy --only firestore:rules --project test --dry-run`. אותו דבר עם `storage`.
- **Build מלא:** `npx next build`, רק כשה-dev server עצור.
