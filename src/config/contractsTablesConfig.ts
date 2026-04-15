export const CONTRACTS_TABLES_CONFIG = [
  {
    key: "pension",
    title: "פנסיה",
    note: 'הערכים מוזנים כפי שמופיעים בהסכם (כולל מע״מ). ניתן להזין אחוזים או סכום למיליון (לניוד). המערכת ממירה אוטומטית לאחוזים וללא מע״מ בשמירה.',
    sections: [
      {
        key: "pension_main",
        label: "פנסיה",
        productGroupId: "1",
        productSubGroupId: "pension_main",
        rows: [
          { commissionType: "hekef", label: "היקף", valueMode: "percent", minuySochen: false },
          { commissionType: "nifraim", label: "נפרעים", valueMode: "percent", minuySochen: false },
          { commissionType: "nifraim", label: "נפרעים מינוי סוכן", valueMode: "percent", minuySochen: true },
          { commissionType: "niud", label: "ניוד", valueMode: "per_million", minuySochen: false },
        ],
      },
    ],
  },

  {
    key: "finance",
    title: "פיננסים",
    note: 'הערכים מוזנים כפי שמופיעים בהסכם (כולל מע״מ). ניתן להזין אחוזים או סכום למיליון (לניוד). המערכת ממירה אוטומטית לאחוזים וללא מע״מ בשמירה.',
    sections: [
      {
        key: "gemel_hishtalmut",
        label: "גמל והשתלמות",
        productGroupId: "4",
        productSubGroupId: "gemel_hishtalmut",
        rows: [
          { commissionType: "hekef", label: "היקף", valueMode: "percent", minuySochen: false },
          { commissionType: "nifraim", label: "נפרעים", valueMode: "percent", minuySochen: false },
          { commissionType: "nifraim", label: "נפרעים מינוי סוכן", valueMode: "percent", minuySochen: true },
          { commissionType: "niud", label: "ניוד", valueMode: "per_million", minuySochen: false },
        ],
      },
      {
        key: "financial_saving",
        label: "חיסכון פיננסי",
        productGroupId: "4",
        productSubGroupId: "financial_saving",
        rows: [
          { commissionType: "hekef", label: "היקף", valueMode: "percent", minuySochen: false },
          { commissionType: "nifraim", label: "נפרעים", valueMode: "percent", minuySochen: false },
          { commissionType: "nifraim", label: "נפרעים מינוי סוכן", valueMode: "percent", minuySochen: true },
          { commissionType: "niud", label: "ניוד", valueMode: "per_million", minuySochen: false },
        ],
      },
      {
        key: "portfolio_management",
        label: "ניהול תיקים",
        productGroupId: "4",
        productSubGroupId: "portfolio_management",
        rows: [
          { commissionType: "hekef", label: "היקף", valueMode: "percent", minuySochen: false },
          { commissionType: "nifraim", label: "נפרעים", valueMode: "percent", minuySochen: false },
          { commissionType: "nifraim", label: "נפרעים מינוי סוכן", valueMode: "percent", minuySochen: true },
          { commissionType: "niud", label: "ניוד", valueMode: "per_million", minuySochen: false },
        ],
      },
    ],
  },

  {
    key: "risk",
    title: "סיכונים",
    note: 'הערכים מוזנים כפי שמופיעים בהסכם (ללא מע״מ). הזנה באחוזים בלבד.',
    sections: [
      {
        key: "risk_only",
        label: "ריסק",
        productGroupId: "3",
        productSubGroupId: "risk_only",
        rows: [
          { commissionType: "hekef", label: "היקף", valueMode: "percent", minuySochen: false },
          { commissionType: "nifraim", label: "נפרעים", valueMode: "percent", minuySochen: false },
          { commissionType: "nifraim", label: "נפרעים מינוי סוכן", valueMode: "percent", minuySochen: true },
        ],
      },
      {
        key: "mortgage",
        label: "משכנתא",
        productGroupId: "3",
        productSubGroupId: "mortgage",
        rows: [
          { commissionType: "hekef", label: "היקף", valueMode: "percent", minuySochen: false },
          { commissionType: "nifraim", label: "נפרעים", valueMode: "percent", minuySochen: false },
          { commissionType: "nifraim", label: "נפרעים מינוי סוכן", valueMode: "percent", minuySochen: true },
        ],
      },
      {
        key: "health",
        label: "בריאות",
        productGroupId: "3",
        productSubGroupId: "health",
        rows: [
          { commissionType: "hekef", label: "היקף", valueMode: "percent", minuySochen: false },
          { commissionType: "nifraim", label: "נפרעים", valueMode: "percent", minuySochen: false },
          { commissionType: "nifraim", label: "נפרעים מינוי סוכן", valueMode: "percent", minuySochen: true },
        ],
      },
    ],
  },

  {
    key: "retirement",
    title: "פרישה מיידית",
    note: 'הזנה לפי סכום למיליון (ניוד בלבד). המערכת ממירה לאחוזים וללא מע״מ בשמירה.',
    sections: [
      {
        key: "immediate_retirement_main",
        label: "פרישה מיידית",
        productGroupId: "6",
        productSubGroupId: "immediate_retirement_main",
        rows: [
          { commissionType: "niud", label: "ניוד", valueMode: "per_million", minuySochen: false },
        ],
      },
    ],
  },

  {
    key: "travel",
    title: "נסיעות חול",
    note: 'הזנה באחוזים בלבד (כולל מע״מ). המערכת ממירה לאחוזים וללא מע״מ בשמירה.',
    sections: [
      {
        key: "travel_abroad",
        label: "נסיעות חול",
        productGroupId: "5",
        productSubGroupId: "travel_abroad",
        rows: [
          { commissionType: "hekef", label: "היקף", valueMode: "percent", minuySochen: false },
        ],
      },
    ],
  },
];