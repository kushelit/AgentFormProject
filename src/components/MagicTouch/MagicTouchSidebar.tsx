'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import magicTouchPages from '@/config/magicTouchPagesConfig';
import { useAuth } from '@/lib/firebase/AuthContext';
import { usePermission } from '@/hooks/usePermission';

function MagicTouchSidebarItem({
  href,
  label,
  icon,
  permission,
  selected,
}: {
  href: string;
  label: string;
  icon: string;
  permission?: string;
  selected: boolean;
}) {
  const { canAccess, isChecking } = usePermission(
    permission || null
  );

  /*
   * אין הרשאה לפריט:
   * לא מציגים אותו בכלל בתפריט.
   */
  if (permission && (isChecking || !canAccess)) {
    return null;
  }

  return (
    <Link
      href={href}
      className={`
        flex
        items-center
        gap-3
        rounded-lg
        px-3
        py-3
        text-sm
        font-medium
        transition
        ${
          selected
            ? 'bg-blue-600 text-white'
            : 'text-slate-200 hover:bg-slate-800 hover:text-white'
        }
      `}
    >
      <span
        aria-hidden="true"
        className="text-lg"
      >
        {icon}
      </span>

      <span>{label}</span>
    </Link>
  );
}

export default function MagicTouchSidebar() {
  const pathname = usePathname();

  const { user } = useAuth();

  const isSelected = (
    href: string
  ): boolean => {
    if (href === '/MagicTouch') {
      return pathname === href;
    }

    return pathname.startsWith(href);
  };

  if (!user) {
    return null;
  }

  return (
    <aside
      dir="rtl"
      className="
        fixed
        right-0
        top-16
        z-30
        flex
        h-[calc(100vh-64px)]
        w-60
        flex-col
        border-l
        border-slate-200
        bg-slate-950
        text-white
        shadow-xl
      "
    >
      <nav className="flex-1 overflow-y-auto px-3 py-5">
        <div className="mb-3 px-3 text-xs font-medium text-slate-400">
          ניהול Magic Touch
        </div>

        <div className="space-y-1">
          {magicTouchPages.map((item) => (
            <MagicTouchSidebarItem
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              permission={item.permission}
              selected={isSelected(item.href)}
            />
          ))}
        </div>
      </nav>

      <div className="border-t border-slate-800 p-3">
        <Link
          href="/NewAgentForm"
          className="
            flex
            items-center
            justify-center
            gap-2
            rounded-lg
            border
            border-slate-700
            px-3
            py-3
            text-sm
            font-medium
            text-slate-200
            transition
            hover:bg-slate-800
          "
        >
          <span>↩</span>
          <span>חזרה ל־MagicSale</span>
        </Link>
      </div>
    </aside>
  );
}