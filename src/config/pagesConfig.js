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
];

const bottomPage = { href: '/Leads', label: 'Flow' };

export default pages;
export { bottomPage };
