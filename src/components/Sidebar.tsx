"use client"

import Link from 'next/link';
import { useAuth } from "@/lib/firebase/AuthContext";
import { usePathname } from 'next/navigation'
import { useState } from 'react';

type SidebarProps = {
  className?: string;
};

const pages = [
  { href: '/', label: 'ניהול עסקאות' },
  { href: '/Customer', label: 'לקוחות' },
  { href: '/summaryTable', label: 'דף מרכז' },
  { href: '/ManageWorkers', label: 'ניהול עובדים' },
  { href: '/Goals', label: 'ניהול יעדים ומבצעים' },
  {
    href: '/ContractsHub', label: 'עמלות', submenu: [
      { href: '/ContractsHub/ManageContracts', label: 'ניהול עמלות' },
      { href: '/ContractsHub/Simulation', label: 'סימולטור' }
    ]
  },
  { href: '/Enviorment', label: 'הגדרות מערכת' },
  { href: '/ManageSimulation', label: 'ניהול סימולטור' },
  { href: '/Log', label: 'לוג מערכת' },
  { href: '/RequestStatus', label: 'סטאטוס API' },
  { href: '/ManagePoolAgents', label: 'ניהול פול ליד' },
  
];

const bottomPage = { href: '/Leads', label: 'Flow' };

const Sidebar: React.FC<SidebarProps> = ({ className }) => {
  const { user } = useAuth();
  const pathname = usePathname();
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);

  const handleToggle = (event: React.MouseEvent, href: string) => {
    event.preventDefault();
    setOpenSubmenu(openSubmenu === href ? null : href);
  };

  return (
    <div className={`${className ?? ''} relative max-w-40 min-w-40 bg-custom-blue h-screen`}>
      {user ? (
        <nav className="h-full flex flex-col overflow-y-auto">
          {/* Main Pages */}
          <ul className="flex flex-col">
            {pages.map((page) => (
              <li key={page.href} className={`px-2 py-2 ${pathname === page.href ? 'bg-white/10' : ''}`}>
                <div className="w-full flex items-center">
                  <Link href={page.href} className="text-custom-white text-sm flex-grow"
                        onClick={page.submenu ? (e) => handleToggle(e, page.href) : undefined}>
                    {page.label}
                  </Link>
                  {page.submenu && (
                    <span onClick={(e) => handleToggle(e, page.href)} className="pl-2 cursor-pointer">
                      ▼
                    </span>
                  )}
                </div>
                {page.submenu && openSubmenu === page.href && (
                  <ul className="mt-2">
                    {page.submenu.map(sub => (
                      <li key={sub.href} className={`px-2 py-1 ${pathname === sub.href ? 'bg-white/20' : ''}`}>
                        <Link href={sub.href} className="text-custom-white text-sm w-full">
                          {sub.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>

          {/* Bottom Page (Leads) */}
          <ul className="mt-auto mb-20"> {/* Larger margin to push it further down */}
            <li
              key={bottomPage.href}
              className={`px-2 py-2 ${pathname === bottomPage.href ? 'bg-white/10' : ''}`}
            >
              <Link
                href={bottomPage.href}
                className="text-custom-white text-2xl italic font-semibold" // Increased font size and added boldness
                style={{ transform: 'skew(-25deg)' }} // Skew effect
              >
                {bottomPage.label}
              </Link>
            </li>
          </ul>
        </nav>
      ) : (
        <div className="text-custom-white px-4 py-2 rounded-lg">
          נדרש להתחבר למערכת
        </div>
      )}
    </div>
  );
};

export default Sidebar;
