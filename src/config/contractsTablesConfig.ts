export const CONTRACTS_TABLES_CONFIG = [
  {
    key: "pension",
    title: "פנסיוני",
    note: 'נא להזין את ההסכם כולל מע״מ.',
    showDefaultColumn: true,
    sections: [
      {
        key: "pension_main",
        label: "פנסיה",
        productGroupId: "1",
        productSubGroupId: "pension_main",
        rows: [
           {
      commissionType: "nifraim",
      label: "נפרעים",
      valueMode: "percent",
      minuySochen: false,
    },
     { commissionType: "niud", 
        label: "היקף על צבירה", 
        valueMode: "per_million",
         minuySochen: false },
    {
      commissionType: "hekef",
      label: "היקף על שוטף",
      valueMode: "percent",
      minuySochen: false,
    },
    {
      commissionType: "nifraim",
      label: "נפרעים מינוי סוכן",
      valueMode: "percent",
      minuySochen: true,
    },
        ],
      },
      {
  key: "executive_insurance",
  label: "ביטוח מנהלים",
  productGroupId: "1",
  productSubGroupId: "executive_insurance",
      rows: [
           {
      commissionType: "nifraim",
      label: "נפרעים",
      valueMode: "percent",
      minuySochen: false,
    },
     { commissionType: "niud", 
        label: "היקף על צבירה", 
        valueMode: "per_million",
         minuySochen: false },
    {
      commissionType: "hekef",
      label: "היקף על שוטף",
      valueMode: "percent",
      minuySochen: false,
    },
    {
      commissionType: "nifraim",
      label: "נפרעים מינוי סוכן",
      valueMode: "percent",
      minuySochen: true,
    },
        ],
}
    ],
  },

  {
    key: "finance",
    title: "פיננסים",
    note: 'נא להזין את ההסכם כולל מע״מ.',
     showDefaultColumn: true,
    sections: [
  {
  key: "gemel_hishtalmut",
  label: "גמל והשתלמות",
  productGroupId: "4",
  productSubGroupId: "gemel_hishtalmut",
  rows: [
     {
      commissionType: "nifraim",
      label: "נפרעים",
      valueMode: "percent",
      minuySochen: false,
    },
     { commissionType: "niud", 
        label: "היקף על צבירה", 
        valueMode: "per_million",
         minuySochen: false },
    {
      commissionType: "hekef",
      label: "היקף על שוטף",
      valueMode: "percent",
      minuySochen: false,
    },
    {
      commissionType: "nifraim",
      label: "נפרעים מינוי סוכן",
      valueMode: "percent",
      minuySochen: true,
    },
  ],
},
  {
  key: "financial_saving",
  label: "חיסכון פיננסי",
  productGroupId: "4",
  productSubGroupId: "financial_saving",
  rows: [
      {
      commissionType: "nifraim",
      label: "נפרעים",
      valueMode: "percent",
      minuySochen: false,
    },
     { commissionType: "niud", 
    label: "היקף על צבירה", 
    valueMode: "per_million", 
    minuySochen: false },
    {
      commissionType: "hekef",
      label: "היקף על שוטף",
      valueMode: "percent",
      minuySochen: false,
    },
    {
      commissionType: "nifraim",
      label: "נפרעים מינוי סוכן",
      valueMode: "percent",
      minuySochen: true,
    },
  ],
},
     {
  key: "portfolio_management",
  label: "ניהול תיקים",
  productGroupId: "4",
  productSubGroupId: "portfolio_management",
  rows: [
    { commissionType: "nifraim",
       label: "נפרעים", 
       valueMode: "percent",
        minuySochen: false 
      },
    { commissionType: "niud", 
      label: "היקף על צבירה",
       valueMode: "per_million", 
       minuySochen: false },
  ],
}
    ],
  },

  {
    key: "risk",
    title: "סיכונים",
    note: 'נא להזין את ההסכם ללא מע״מ.',
    showDefaultColumn: true,
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
      {
  key: "misc_risk",
  label: "אכ״ע, מטריה ביטוחית, סיעוד",
  productGroupId: "3",
  productSubGroupId: "misc_risk",
  rows: [
    { commissionType: "hekef", label: "היקף", valueMode: "percent", minuySochen: false },
    { commissionType: "nifraim", label: "נפרעים", valueMode: "percent", minuySochen: false },
    { commissionType: "nifraim", label: "נפרעים מינוי סוכן", valueMode: "percent", minuySochen: true },
  ],
}
    ],
  },

  {
    key: "retirement",
    title: "פרישה מיידית",
    note: 'נא להזין את ההסכם כולל מע״מ.',
    showDefaultColumn: false,
    sections: [
      {
        key: "immediate_retirement",
        label: "פרישה מיידית",
        productGroupId: "6",
        productSubGroupId: "immediate_retirement",
        rows: [
          { commissionType: "niud", label: "ניוד", valueMode: "per_million", minuySochen: false },
        ],
      },
    ],
  },

  {
    key: "travel",
    title: "נסיעות חול",
    note: 'נא להזין את ההסכם כולל מע״מ.',
    showDefaultColumn: false,
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