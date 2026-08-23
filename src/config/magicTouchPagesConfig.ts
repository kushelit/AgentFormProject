export type MagicTouchNavigationItem = {
  href: string;
  label: string;
  icon: string;
  permission?: string;
};

const magicTouchPages: MagicTouchNavigationItem[] = [
  // {
  //   href: '/MagicTouch',
  //   label: 'דשבורד',
  //   icon: '🏠',
  //   permission: 'access_magic_touch',
  // },
  {
    href: '/MagicTouch/Contacts',
    label: 'אנשי קשר',
    icon: '👥',
    permission: 'access_magic_touch',
  },
  {
    href: '/MagicTouch/Conversations',
    label: 'שיחות',
    icon: '💬',
  permission: 'access_magic_touch',
  },
  // {
  //   href: '/MagicTouch/Campaigns',
  //   label: 'קמפיינים',
  //   icon: '📣',
  //   permission: 'access_magic_touch_campaigns',
  // },
    {
    href: '/MagicTouch/Flows',
    label: 'אוטומציות',
    icon: '⚡',
    permission: 'access_magic_touch',
  },
   {
    href: '/MagicTouch/Templates',
    label: 'תבניות',
    icon: '📝',
    permission: 'access_magic_touch',
  },
  {
  href: '/MagicTouch/Integrations',
  label: 'ייבוא וחיבורים',
  icon: '🔗',
  permission: 'access_magic_touch',
},
{
  href: '/MagicTouch/Onboarding',
  label: 'הגדרת MagicTouch',
  icon: '🚀',
  permission: 'access_magic_touch',
},
  {
  href: '/MagicTouch/Runs',
  label: 'הרצות תהליכים',
  icon: '📋',
  permission: 'access_magic_touch_jobs_admin',
},
{
  href: '/MagicTouch/Monitor/Jobs',
  label: 'עיבודים',
  icon: '🗂️',
  permission: 'access_magic_touch_jobs_admin',
},
//   {
//   href: '/MagicTouch/Monitor',
//   label: 'מעקב ובקרה',
//   icon: '📊',
//   permission: 'access_magic_touch',
// },
  // {
  //   href: '/MagicTouch/Appointments',
  //   label: 'פגישות',
  //   icon: '📅',
  //   permission: 'access_magic_touch_appointments',
  // },

  // {
  //   href: '/MagicTouch/Settings',
  //   label: 'הגדרות',
  //   icon: '⚙️',
  //   permission: 'access_magic_touch_settings',
  // },
];

export default magicTouchPages;