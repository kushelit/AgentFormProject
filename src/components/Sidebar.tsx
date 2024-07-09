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
  { href: '/contact', label: 'ניהול יעדים ומבצעים' },
  { href: '/ContractsHub', label: 'עמלות' , submenu: [
    { href: '/ContractsHub/ManageContracts', label: 'ניהול עמלות' },
    { href: '/ContractsHub/Simulation', label: 'סימולטור' }
  ]
},
  { href: '/Enviorment', label: 'הגדרות מערכת' },
  { href: '/ManageSimulation', label: 'ניהול סימולטור' },
];
  
const Sidebar: React.FC<SidebarProps> = ({ className }) => {
  const { user } = useAuth(); // Destructure to get the user object
  const pathname = usePathname()
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  const handleToggle = (event: React.MouseEvent, href: string) => {
    // If this item has a submenu, we'll prevent navigation and toggle the submenu instead
    event.preventDefault(); // Stop the link from navigating
    setOpenSubmenu(openSubmenu === href ? null : href); // Toggle the submenu visibility
  };

  return (
    <div className={`${className ?? ''} relative max-w-40 min-w-40 bg-custom-blue`}>
      {user ? (
        <nav className="fixed max-w-40 min-w-40">
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