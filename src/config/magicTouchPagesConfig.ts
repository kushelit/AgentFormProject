export type MagicTouchNavigationItem = {
  href: string;
  label: string;
  icon: string;
  permission?: string;
};

const magicTouchPages: MagicTouchNavigationItem[] = [
  {
    href: '/MagicTouch',
    label: 'דשבורד',
    icon: '🏠',
    permission: 'access_magic_touch',
  },
  {
    href: '/MagicTouch/Contacts',
    label: 'אנשי קשר',
    icon: '👥',
    permission: 'access_magic_touch_contacts',
  },
  {
    href: '/MagicTouch/Conversations',
    label: 'שיחות',
    icon: '💬',
    permission: 'access_magic_touch_conversations',
  },
  {
    href: '/MagicTouch/Campaigns',
    label: 'קמפיינים',
    icon: '📣',
    permission: 'access_magic_touch_campaigns',
  },
  {
    href: '/MagicTouch/Workflows',
    label: 'אוטומציות',
    icon: '⚡',
    permission: 'access_magic_touch_workflows',
  },
  {
    href: '/MagicTouch/Appointments',
    label: 'פגישות',
    icon: '📅',
    permission: 'access_magic_touch_appointments',
  },
  {
    href: '/MagicTouch/Templates',
    label: 'תבניות',
    icon: '📝',
    permission: 'access_magic_touch_templates',
  },
  {
    href: '/MagicTouch/Integrations',
    label: 'ייבוא וחיבורים',
    icon: '🔗',
    permission: 'access_magic_touch_integrations',
  },
  {
    href: '/MagicTouch/Settings',
    label: 'הגדרות',
    icon: '⚙️',
    permission: 'access_magic_touch_settings',
  },
];

export default magicTouchPages;