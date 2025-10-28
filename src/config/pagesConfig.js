const pages = [
 
  { href: '/NewAgentForm', label: 'ניהול עסקאות' },
  { href: '/NewCustomer', label: 'ניהול לקוחות' },
  { href: '/NewSummaryTable', label: 'דף מרכז' },
  // { href: '/ManageWorkers', label: 'ניהול עובדים' },
  {
    href: '/ContractsHub',
    label: 'עמלות',
    submenu: [
      { href: '/NewManageContracts', label: 'ניהול עמלות' },
      { href: '/NewSimulation', label: 'סימולטור' },
    ],
  },
  { href: '/NewGoals', label: 'ניהול יעדים' },
  { href: '/NewEnviorment', label: 'ניהול הגדרות לידים' },
  { href: '/TeamPermissionsTable', label: 'ניהול הרשאות' },
  { href: '/Reports', label: 'דוחות' },
  { href: '/import-excel', label: 'ייבוא אקסל עסקאות' },
  {
    href: '#import-commissions',
    label: 'טעינת עמלות',
    submenu: [
      { href: '/importCommissionHub/ExcelCommissionImporter', label: 'קליטת קבצים' },
      // { href: '/importCommissionHub/onboard', label: 'הקמת לקוחות מטעינה' },
      { href: '/importCommissionHub/CommissionSummary', label: 'דף מסכם עמלות' },
      { href: '/importCommissionHub/CommissionComparison', label: 'השוואת טעינות' },
      // { href: '/importCommissionHub/CompareRealToReported', label: 'השוואה לעמלה בפועל' },
    ],
  },
  {
    href: '/AdminHub', // או כל דף ראשי שתבחרי
    label: 'ניהול אדמין',
    onlyRoles: ['admin'],     submenu: [
      { href: '/Log', label: 'לוג מערכת' },
      { href: '/ManageSimulation', label: 'ניהול סימולטור' },
      { href: '/RequestStatus', label: 'סטאטוס API' },
      { href: '/ManagePoolAgents', label: 'ניהול פול ליד' },
      { href: '/ManageManager', label: 'ניהול קבוצות סוכנים' },
      { href: '/SubscriptionsTable', label: 'ניהול מנויים ' },
      { href: '/Admin-ImportExcelruns', label: 'ניהול טעינת קבצי עסקאות' },  
      { href: '/admin/mfa', label: 'ניהול MFA' },      
  
    ],
  }

];

const bottomPage = { href: '/NewLeads', label: 'Flow' };

export default pages;
export { bottomPage };
