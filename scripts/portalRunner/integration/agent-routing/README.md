# מעבר מדורג לפי סוכן — סביבת טסט תחילה

הקבצים כאן מוכנים להעתקה לפרויקט MAGIC. הם אינם מותקנים שם ואינם פרוסים ל־Firebase.
ה־Runner המקורי לא שונה. התוסף החדש מדווח ל־portalExtensionStatus בלבד.

## 1. העתקת שלושה קבצים ל־MAGIC

| קובץ בחבילה | יעד ב־MAGIC |
| --- | --- |
| magic/portalRuns/portalExecutor.ts | src/lib/portalRuns/portalExecutor.ts — חדש |
| magic/portalRuns/startAutoPortalRun.ts | src/lib/portalRuns/startAutoPortalRun.ts — החלפה |
| magic/portalRunBatches.ts | src/lib/portalRunBatches.ts — החלפה |

יש להשוות לשינויים מקומיים שהתווספו מאז הקטעים שנשלחו לפני החלפה.
הבחירה נבדקת מחדש ביצירת משימה; המזהה שנשלח מהמסך אינו יכול לעקוף אותה.
בלי users/{agentId}.portalExecutionMode ברירת המחדל היא runner.
ערך extension בוחר portalExtensionStatus; ערך runner בוחר portalRunnerStatus.
כל משימה חדשה מקבלת executionMode ו־reservedRunnerId מלא. אין מעבר אוטומטי בין כלים.

## 2. עדכון מסך הסטטוס

בקובץ magic/ExcelCommissionImporter-routing.tsx.txt נמצאים הקטעים והוראות השילוב
ב־ExcelCommissionImporter.tsx שסופק. אין להדביק את כל קובץ ההוראות כקומפוננטה:
הוא כולל החלפות מקומיות ל־imports, state, ההאזנה לסטטוס ובקרות עדכון EXE.
הפעלת UI ישן עם התוסף החדש תציג סטטוס מהאוסף הישן ועלולה לחסום הפעלה.

## 3. ניתוב הבוט ב־Functions

ב־shared/commissionAssistant/commissionAssistantRuns.ts החליפי רק את הפונקציה
getCommissionAssistantRunnerReadiness בקטע functions/getCommissionAssistantRunnerReadiness.ts.txt.
הסוג הקיים ופונקציות העזר נשארים. ההחזרה תואמת את הקוראים שסופקו.
לסוכן extension לא נקראת הגדרת installer ולא נוצרת בקשת self_update.
prepareCommissionAssistantRun ממשיך להעביר את readiness.runnerId כ־reservedRunnerId לבאץ׳.
אין צורך להחליף את כל קובצי inbound/auto-resume.
לפני הפריסה הריצי build בפרויקט Functions ופרסי לטסט את ה־Functions שקוראות למודול הזה,
כולל נקודת הכניסה של הבוט וה־auto-resume. שמות ה־exports לפריסה לא סופקו ולכן לא ניחשנו פקודת deploy.
אל תשני את הגדרת הסוכן בזמן סשן בוט שממתין לעדכון EXE; סיימי/בטלי אותו והתחילי בקשה חדשה.

## 4. בדיקה בטסט

1. עצרי/סיימי ריצות קיימות. העתקי את השינויים, הריצי build ב־MAGIC וב־Functions,
   והפעילי/פרסי את גרסת הטסט שלהם לפני טעינת התוסף החדש.
2. רענני את התוסף ב־chrome://extensions. הקבצים המעודכנים נמצאים ב־dist-extension בפרויקט התוסף.
3. בתוך כ־30 שניות ודאי שנוצר portalExtensionStatus/{agentId}, עם runnerType="chrome-extension",
   runnerId שמתחיל ב־chrome-, lastSeenAt טרי ו־isOnline=true.
4. לסוכן הטסט: users/{agentId}.portalExecutionMode="extension". צרי ריצה חדשה ובדקי
   executionMode="extension" ו־reservedRunnerId ששווה למזהה מרשומת התוסף. בדקי ריצה בודדת ובאץ׳.
5. בדקי גם בקשת בוט חדשה לאחר פריסת ה־Functions; היא צריכה לקבל אותו מזהה תוסף,
   בלי באנר/תהליך עדכון EXE.
6. השאירי את שני הכלים פתוחים, סיימי את הריצה, שַני את השדה ל־runner וודאי heartbeat חדש
   ב־portalRunnerStatus. צרי ריצה חדשה: היא חייבת להיות שמורה למזהה ה־Runner.
7. כבי/השהי את הכלי הנבחר ובדקי שהמסך/הבוט מסרבים ליצור ריצה עבורו ולא פונים לכלי האחר.

כלי נבחר שאינו זמין לא יוצר משימה חדשה דרך ה־helpers. ריצות ישנות שכבר נוצרו אינן מנותבות מחדש.
סוכן בלי שדה נשאר runner. שדה לא מוכר מייצר שגיאה ולא מעביר אותו בשקט ל־Runner.
שאר מקורות יצירת המשימות שלא סופקו צריכים להשתמש באותה בחירה ולשמור reservedRunnerId.
ה־Rules הנוכחיים מאפשרים את האוסף החדש; לא נוספו/פורסמו Rules בחבילה זו.
הרשומה הישנה עשויה עדיין להכיל heartbeat של התוסף הישן. מפעילים את ה־Runner וממתינים
לדיווח חדש כדי להחליף אותה; הקוד מסרב לזהות chrome- כ־Runner רגיל.

## אימות מקומי ומגבלות

בדיקות הניתוב מכסות בחירת כלי, היעדר שדה, מעבר חזרה ל־Runner, מצב כבוי/מושהה,
עדכון EXE, חותמת זמן ישנה, ריצה בודדת ובאץ׳ ושריון מזהה.
נבדקת תחבירית פונקציית ה־Functions שסופקה. אין כאן סביבת Next.js/Functions המלאה,
ולכן build כולל ואימות בוט מול Firebase נדרשים אצלך בטסט לפני ייצור.
