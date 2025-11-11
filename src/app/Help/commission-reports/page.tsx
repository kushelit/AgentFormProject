'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import './styles.css';
import HelpNavigation from '@/components/HelpNavigation/HelpNavigation';

type Report = { title: string; path: string[]; steps: Array<string | JSX.Element> };
type Company = { name: string; key: string; reports: Report[] };

const data: Company[] = [
  {
    name: 'מגדל',
    key: 'migdal',
    reports: [
      {
        title: 'דוח משולמים לסוכן',
        path: ['כלים', 'דוחות', 'הסכמים ועמלות', 'משולמים לסוכן'],
        steps: ['בחרו תקופה להצגה.', 'לחצו על ייצוא לאקסל.'],
      },
      {
        title: 'עמלה מדמי ניהול קהש וגמל – לבעלים',
        path: ['כלים', 'דוחות', 'הסכמים ועמלות', 'עמלה מדמי ניהול קהש וגמל – לבעלים'],
        steps: ['בחרו תקופה להצגה.', 'לחצו על ייצוא לאקסל.'],
      },
      {
        title: 'עמלה מצבירה/דמי ניהול לביטוח חיים לבעלים',
        path: ['כלים', 'דוחות', 'הסכמים ועמלות', 'עמלה מצבירה/דמי ניהול לביטוח חיים לבעלים'],
        steps: ['בחרו תקופה להצגה.', 'לחצו על ייצוא לאקסל.'],
      },
    ],
  },
  {
    name: 'פניקס',
    key: 'phoenix',
    reports: [
      {
        title: 'דוח נפרעים',
        path: ['דוחות', 'עמלות', 'עמלות נפרעים'],
        steps: ['ודאו שהשדה "חודש עיבוד (רישום)" תקין.', 'לחצו על אייקון ייצוא לאקסל.'],
      },
      {
        title: 'עמלות נפרעים והפרשי סוכנויות גמל',
        path: ['עמלות', 'ריכוז תשלומי עמלות', 'עמלות נפרעים והפרשי סוכנויות גמל'],
        steps: [
          'בחרו חודש עיבוד.',
          'לחצו על "הורד אקסל".',
          'בחרו באפשרות "דוח גמל מורחב".',
        ],
      },
    ],
  },
  {
    name: 'כלל',
    key: 'clal',
    reports: [
      {
        title: 'פנסיה',
        path: ['קוביית עמלות ומכירות', 'לפירוט עמלות', 'עמיתים'],
        steps: ['בחרו חודש ולחצו "חפש".', 'בעמיתים – ייצוא לאקסל.'],
      },
      {
        title: 'חיים',
        path: ['קוביית עמלות ומכירות', 'לפירוט עמלות', 'פוליסה'],
        steps: ['בחרו חודש ולחצו "חפש".', 'בפוליסה – ייצוא לאקסל.'],
      },
      {
        title: 'בריאות',
        path: ['קוביית עמלות ומכירות', 'לפירוט עמלות', 'פוליסת'],
        steps: ['בחרו חודש ולחצו "חפש".', 'בפוליסת – ייצוא לאקסל.'],
      },
      {
        title: 'גמל',
        path: ['קוביית עמלות ומכירות', 'לפירוט עמלות', 'עמיתים'],
        steps: ['בחרו חודש ולחצו "חפש".', 'בעמיתים – ייצוא לאקסל.'],
      },
    ],
  },
  {
    name: 'מנורה',
    key: 'menora',
    reports: [
      {
        title: 'דוח עמלות',
        path: ['עמלות', 'דוחות'],
        steps: [
          'באתר מנורה הפיקו את "דוח עמלות" – הקובץ נשמר כ-ZIP. שמרו את ה-ZIP כמו שהוא (לא לחלץ).',
          'ב-MagicSale במסך "טעינת קבצים": בחרו חברה "מנורה".',
          'בשדה "בחר תבנית" בחרו באחת האפשרויות: "דוח עמלות – נפרעים" או "דוח עמלות – צבירה".',
          <img
            key="menora-template"
            src="/static/img/help/menora-template-select.png"
            alt="בחירת תבנית מנורה"
            className="help-image"
          />,
          'לאחר מכן לחצו על "בחר קובץ" ובחרו את קובץ ה-ZIP שהורדתם ממנורה.',
          'בחלון שייפתח יוצגו שני קבצים מתוך ה-ZIP – ZVIRA ו-NIFRAIM. בחרו את המתאים (צבירה או נפרעים).',
          <img
            key="menora-zip"
            src="/static/img/help/menora-zip-select.png"
            alt="בחירת קובץ מתוך ZIP של מנורה"
            className="help-image"
          />,
          'ולבסוף לחצו על "טען".',
        ],
      }      
    ],
  },
  {
    name: 'הראל',
    key: 'harel',
    reports: [
      {
        title: 'דוח נפרעים',
        path: ['דוחות חיים/בריאות/חיסכון', 'סוכן', 'תמונת עמלות', 'דוח ריכוז תשלומים'],
        steps: [
          'לחצו על הסכום בעמודת נפרעים בשורת החודש.',
          'בעמוד הבא – שוב על הסכום בחודש הרלוונטי.',
          'ייצוא לאקסל.',
        ],
      },
      {
        title: 'דוח עמלות מוצרי צבירה לסוכן',
        path: ['דוחות חיים/בריאות/חיסכון', 'סוכן', 'תמונת עמלות', 'דוח ריכוז תשלומים'],
        steps: [
          'לחצו על הסכום בעמודת נפרעים בשורת החודש.',
          'בעמוד הבא – שוב על הסכום בחודש הרלוונטי.',
          'ייצוא לאקסל.',
        ],
      },
    ],
  },

  /* --- חברות חדשות --- */

  {
    name: 'איילון',
    key: 'ayalon',
    reports: [
      {
        title: 'דוח נפרעים לסוכן משנה',
        path: ['כל הדוחות שלי', 'דוח נפרעים לסוכן משנה'],
        steps: ['בחרו חודש להצגה.', 'לחצו על ייצוא לאקסל.'],
      },
    ],
  },
  {
    name: 'אנליסט',
    key: 'analyst',
    reports: [
      {
        title: 'עמלות סוכנים',
        path: ['הפקת דוחות', 'עמלות סוכנים'],
        steps: ['בחרו טווח תאריכים.', 'לחצו על "הפק דוח".'],
      },
    ],
  },
  {
    name: 'מור',
    key: 'mor',
    reports: [
      {
        title: 'דוח נפרעים',
        path: ['חישוב תגמול', 'סכום נפרעים'],
        steps: ['בחרו חודש.', 'לחצו על "חפש".', 'ייצוא לאקסל.'],
      },
    ],
  },
  {
    name: 'מיטב',
    key: 'meitav',
    reports: [
      {
        title: 'דוח עמלות מפורט',
        path: ['עמלות', 'עמלות נפרעים'],
        steps: ['בחרו טווח חודשים ולחצו על "הצג".', 'לחצו "ייצא דוח עמלות מפורט".'],
      },
    ],
  },
];

// עוגן ידידותי (כולל אותיות עבריות)
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[()\[\]{}"“”'׳״]/g, '')
    .replace(/[^\p{Letter}\p{Number}\s\-]+/gu, '')
    .trim()
    .replace(/\s+/g, '-');

const companyId = (idx: number, c: Company) => `c${idx + 1}-${slug(c.name)}`;
const reportId = (cIdx: number, rIdx: number, c: Company, r: Report) =>
  `c${cIdx + 1}-r${rIdx + 1}-${slug(c.name)}-${slug(r.title)}`;

const RTL_SEP = ' \u2190 '; // ←

export default function Page() {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);
  if (!isClient) return null;

  return (
    <div className="help-container" dir="rtl">
      <span id="top" />

      {/* כותרת גדולה בראש הדף */}
      <h1 className="page-title">📖 טעינת עמלות – מדריך דוחות</h1>
      <p className="page-subtitle">
        בוחרים חברה ← בוחרים דוח ← פועלים לפי ההנחיות. בסוף כל דוח יש קישור ↥ חזרה לרשימה.
      </p>

      {/* תוכן עניינים עם מספור מדורג */}
      <nav className="toc" aria-label="תוכן עניינים">
        <h2 className="toc-title">📚 הדוחות הקיימים</h2>
        <ol className="toc-level-1">
          {data.map((c, ci) => (
            <li key={c.key}>
              <Link href={`#${companyId(ci, c)}`} className="toc-company-link">
                {ci + 1}. {c.name}
              </Link>
              <ol className="toc-level-2">
                {c.reports.map((r, ri) => (
                  <li key={r.title}>
                    <Link href={`#${reportId(ci, ri, c, r)}`} className="toc-report-link">
                      {ci + 1}.{ri + 1} {r.title}
                    </Link>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      </nav>

      <hr />

      {/* פירוט – כותרות חברות + מספור דוחות */}
      {data.map((c, ci) => (
        <section key={c.key} id={companyId(ci, c)} className="company-section">
          <h2 className="company-title">
            {ci + 1}. {c.name}
          </h2>

          {c.reports.map((r, ri) => {
            const rid = reportId(ci, ri, c, r);
            const number = `${ci + 1}.${ri + 1}`;
            return (
              <article key={rid} id={rid} className="report">
                <h3 className="report-title">
                  {number} {r.title}
                </h3>

                <div className="steps">
                  <p>
                    <strong>נתיב:</strong> {r.path.join(RTL_SEP)}
                  </p>
                  <ol>
                    {r.steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </div>

                <p className="back">
                  <Link href="#top" className="back-link">
                    ↥ חזרה לרשימה
                  </Link>
                </p>
              </article>
            );
          })}
        </section>
      ))}

      <HelpNavigation />
    </div>
  );
}
