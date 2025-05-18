const pages = [
 
  { href: '/NewAgentForm', label: 'ניהול עסקאות' },
  { href: '/NewCustomer', label: 'ניהול לקוחות' },
  { href: '/NewSummaryTable', label: 'דף מרכז' },
  { href: '/ManageWorkers', label: 'ניהול עובדים' },
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
  { href: '/ManageSimulation', label: 'ניהול סימולטור' },
  { href: '/TeamPermissionsTable', label: 'ניהול הרשאות' },
  {
    href: '/AdminHub', // או כל דף ראשי שתבחרי
    label: 'ניהול אדמין',
    submenu: [
      { href: '/Log', label: 'לוג מערכת' },
      { href: '/RequestStatus', label: 'סטאטוס API' },
      { href: '/ManagePoolAgents', label: 'ניהול פול ליד' },
      { href: '/ManageManager', label: 'ניהול קבוצות סוכנים' },
      { href: '/SubscriptionsTable', label: 'ניהול מנויים ' },
      { href: 'import-excel', label: 'ייבוא אקסל עסקאות' },

    ],
  }

];

const bottomPage = { href: '/NewLeads', label: 'Flow' };

export default pages;
export { bottomPage };
