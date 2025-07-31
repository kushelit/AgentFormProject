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

  // {
  //   href: '/importCommissionHub',
  //   label: 'טעינת קבצי עמלות',
  //   submenu: [
  //     { href: '/ExcelCommissionImporter', label: 'קליטת קבצים' },
  //     { href: '/CommissionComparison', label: ' השוואת טעינות' },
  //     { href: '/CommissionSummary', label: ' דף מסכם עמלות' },
  //     { href: '/CompareRealToReported', label: ' השוואה לעמלה בפועל' },

  //   ],
  // },
  {
    href: '/AdminHub', // או כל דף ראשי שתבחרי
    label: 'ניהול אדמין',
    submenu: [
      { href: '/Log', label: 'לוג מערכת' },
      { href: '/ManageSimulation', label: 'ניהול סימולטור' },
      { href: '/RequestStatus', label: 'סטאטוס API' },
      { href: '/ManagePoolAgents', label: 'ניהול פול ליד' },
      { href: '/ManageManager', label: 'ניהול קבוצות סוכנים' },
      { href: '/SubscriptionsTable', label: 'ניהול מנויים ' },
      { href: '/import-excel', label: 'ייבוא אקסל עסקאות' },
      { href: '/Admin-ImportExcelruns', label: 'ניהול טעינת קבצי עסקאות' },

      
    ],
  }

];

const bottomPage = { href: '/NewLeads', label: 'Flow' };

export default pages;
export { bottomPage };
