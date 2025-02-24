const pages = [
  { href: '/', label: 'ניהול עסקאות' },
  { href: '/Customer', label: 'לקוחות' },
  { href: '/summaryTable', label: 'דף מרכז' },
  { href: '/ManageWorkers', label: 'ניהול עובדים' },
  { href: '/Goals', label: 'ניהול יעדים ומבצעים' },
  {
    href: '/ContractsHub',
    label: 'עמלות',
    submenu: [
      { href: '/ContractsHub/ManageContracts', label: 'ניהול עמלות' },
      { href: '/ContractsHub/Simulation', label: 'סימולטור' },
    ],
  },
  { href: '/Enviorment', label: 'הגדרות מערכת' },
  { href: '/ManageSimulation', label: 'ניהול סימולטור' },
  { href: '/Log', label: 'לוג מערכת' },
  { href: '/RequestStatus', label: 'סטאטוס API' },
  { href: '/ManagePoolAgents', label: 'ניהול פול ליד' },
  { href: '/NewAgentForm', label: 'סוכנים חדש' },
  { href: '/NewCustomer', label: 'לקוחות חדש' },
  { href: '/NewSummaryTable', label: 'דף מרכז חדש' },
  { href: '/NewGoals', label: 'ניהול יעדים חדש' },
  { href: '/NewEnviorment', label: 'הגדרות מערכת חדש' },
  { href: '/NewManageContracts', label: 'ניהול עמלות' },
  { href: '/NewSimulation', label: 'ניהול סימולטור' },

];

const bottomPage = { href: '/Leads', label: 'Flow' };

export default pages;
export { bottomPage };
