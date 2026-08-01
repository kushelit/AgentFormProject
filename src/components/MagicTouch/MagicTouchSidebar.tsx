'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import magicTouchPages from '@/config/magicTouchPagesConfig';

export default function MagicTouchSidebar() {
  const pathname = usePathname();

  const isSelected = (
    href: string
  ): boolean => {
    if (href === '/MagicTouch') {
      return pathname === href;
    }

    return pathname.startsWith(href);
  };

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
          {magicTouchPages.map((item) => {
            const selected =
              isSelected(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
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
                  {item.icon}
                </span>

                <span>{item.label}</span>
              </Link>
            );
          })}
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