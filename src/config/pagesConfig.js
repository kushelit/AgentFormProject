// =========================================================
// מערכות - מוצגות כפסים במגירה שבתחתית ה-sidebar
// הסדר כאן הוא סדר ברירת המחדל.
// המערכת הראשית של הסוכן עולה ראשונה, השאר נשארות בסדר הזה.
// =========================================================
export const systems = [
  {
    id: 'magicsale',
    label: 'MagicSale',
    href: '/NewAgentForm',
  },
  {
    id: 'commissions',
    label: 'טעינת עמלות',
    href: '/importCommissionHub/CommissionSummary',
  },
  {
    id: 'flow',
    label: 'Flow',
    href: '/NewLeads',
  },
  {
    id: 'magictouch',
    label: 'Magic Touch',
    href: '/MagicTouch',
    onlyPermissions: ['access_magic_touch'],
    // ל-MagicTouch יש layout משלו, אין לו תפריט ב-sidebar
    external: true,
  },
  {
    id: 'admin',
    label: 'אדמין',
    href: '/Log',
    onlyRoles: ['admin'],
    // תמיד אחרון, לא משתתף בסידור לפי מערכת ראשית
    pinnedLast: true,
  },
];

// מערכת ראשית כברירת מחדל - לסוכן שלא הוגדר לו primarySystem
export const DEFAULT_PRIMARY_SYSTEM = 'magicsale';

// =========================================================
// MagicSale - ניהול מכירות
// =========================================================
const magicSaleMenu = [
  { href: '/NewAgentForm', label: 'ניהול עסקאות' },
   {
    href: '/sharon',
    label: 'ניהול מכירות',
    onlyPermissions: ['access_sharon_elementary', 'access_sharon_tax_returns', 'access_sharon_pension'],
  },
  // { href: '/NewCustomer', label: 'ניהול לקוחות' },
  { href: '/NewSummaryTable', label: 'דף מרכז' },
  {
    href: '#crm',
    label: 'CRM',
    onlyPermissions: ['access_crm_module'],
    submenu: [
      { href: '/NewCustomer',  label: 'לקוחות', onlyPermissions: ['access_crm_module'] },
      { href: '/tasks', label: 'משימות', onlyPermissions: ['access_crm_module'] },
      { href: '/MeetingsDashboard', label: 'מסע לקוח', onlyPermissions: ['access_crm_module'] },
      { href: '/customer-tiers', label: 'מדרג לקוחות', onlyPermissions: ['access_customer_tiers'] },
    ],
  },
  { href: '/NewGoals', label: 'ניהול יעדים' },
  { href: '/Reports', label: 'דוחות' },
  // {
  //   href: '/sharon-summary',
  //   label: 'שרון — עמלות מסכם',
  //   onlyPermissions: ['access_sharon_summary'],
  //   onlyRoles: ['agent', 'worker'],
  // },
  { href: '/import-excel', label: 'ייבוא אקסל עסקאות' },
  { href: '/TeamPermissionsTable', label: 'ניהול הרשאות' },
];

// =========================================================
// טעינת עמלות - לפי זרימת העבודה של הסוכן
// =========================================================
const commissionsMenu = [
  { href: '/importCommissionHub/ExcelCommissionImporter', label: 'קליטת קבצים' },
  { href: '/importCommissionHub/CommissionSummary', label: 'דף מסכם עמלות' },
  { href: '/importCommissionHub/CommissionComparison', label: 'השוואה בין חודשים' },
  { href: '/importCommissionHub/CompareRealToReported', label: 'השוואה לעמלה בפועל' },
  { href: '/NewManageContracts', label: 'הסכמי עמלות' },
  { href: '/NewSimulation', label: 'סימולטור' },
];

// =========================================================
// Flow - ניהול לידים
// =========================================================
const flowMenu = [
  { href: '/NewLeads', label: 'Flow' },
  { href: '/NewEnviorment', label: 'ניהול הגדרות לידים' },
];

// =========================================================
// אדמין - מקובץ לפי נושאים
// =========================================================
const adminMenu = [
  { type: 'section', label: 'ניטור ובקרה' },
  { href: '/Log', label: 'לוג מערכת' },
  { href: '/RequestStatus', label: 'סטאטוס API' },
  { href: '/admin/claude-usage', label: 'ניטור Claude API' },
  { href: '/admin/mfa', label: 'ניהול MFA' },

  { type: 'section', label: 'סוכנויות ומנויים' },
  { href: '/agency-center', label: 'הגדרת סוכנות' },
  { href: '/ManageManager', label: 'ניהול קבוצות סוכנים' },
  { href: '/SubscriptionsTable', label: 'ניהול מנויים' },
  { href: '/ManagePoolAgents', label: 'ניהול פול ליד' },

  { type: 'section', label: 'טעינות ותבניות' },
  { href: '/Admin-ImportExcelruns', label: 'טעינת קבצי עסקאות' },
  { href: '/admin/commission-purge', label: 'מחיקת קבצי עמלות' },
  { href: '/admin/agent-portal-filters', label: 'סינון מספרי סוכן בטעינה' },
  { href: '/admin/product-map', label: 'מפת מוצרים בתבניות' },
  { href: '/ManageSimulation', label: 'ניהול סימולטור' },

  { type: 'section', label: 'אינטגרציות' },
  { href: '/admin/whatsapp-config', label: 'WhatsApp' },
];

export const menus = {
  magicsale: magicSaleMenu,
  commissions: commissionsMenu,
  flow: flowMenu,
  admin: adminMenu,
};

// =========================================================
// תאימות לאחור - ה-layout עדיין מייבא את אלה
// ה-Navbar כבר לא משתמש בהם
// =========================================================
const bottomPage = { href: '/NewLeads', label: 'Flow' };

export default magicSaleMenu;
export { bottomPage };