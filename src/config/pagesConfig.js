const pages = [
  // { href: '/', label: 'ניהול עסקאות' },
  // { href: '/Customer', label: 'לקוחות' },
  // { href: '/summaryTable', label: 'דף מרכז' },
  { href: '/NewAgentForm', label: 'ניהול עסקאות' },
  { href: '/NewCustomer', label: 'ניהול לקוחות' },
  { href: '/NewSummaryTable', label: 'דף מרכז' },
  { href: '/ManageWorkers', label: 'ניהול עובדים' },
  // { href: '/Goals', label: 'ניהול יעדים ומבצעים' },
  {
    href: '/ContractsHub',
    label: 'עמלות',
    submenu: [
      // { href: '/ContractsHub/ManageContracts', label: 'ניהול עמלות' },
      // { href: '/ContractsHub/Simulation', label: 'סימולטור' },
      { href: '/NewManageContracts', label: 'ניהול עמלות' },
      { href: '/NewSimulation', label: 'סימולטור' },
    ],
  },
  { href: '/NewGoals', label: 'ניהול יעדים' },
  { href: '/NewEnviorment', label: 'ניהול הגדרות לידים' },
  // { href: '/Enviorment', label: 'הגדרות מערכת' },
  { href: '/ManageSimulation', label: 'ניהול סימולטור' },
  { href: '/Log', label: 'לוג מערכת' },
  { href: '/RequestStatus', label: 'סטאטוס API' },
  { href: '/ManagePoolAgents', label: 'ניהול פול ליד' },
];

const bottomPage = { href: '/NewLeads', label: 'Flow' };

export default pages;
export { bottomPage };
