"use client"

import Link from 'next/link';
import { useAuth } from "@/lib/firebase/AuthContext";
import { usePathname } from 'next/navigation'


type SidebarProps = {
  className?: string;
};

const pages = [
  { href: '/', label: 'ניהול עסקאות' },
  { href: '/Customer', label: 'לקוחות' },
  { href: '/summaryTable', label: 'דף מרכז' },
  { href: '/ManageWorkers', label: 'ניהול עובדים' },
  { href: '/contact', label: 'ניהול יעדים ומבצעים' },
  { href: '/ManageContracts', label: 'ניהול עמלות' },
  { href: '/Enviorment', label: 'הגדרות מערכת' },
];
  
const Sidebar: React.FC<SidebarProps> = ({ className }) => {
  const { user } = useAuth(); // Destructure to get the user object
  const pathname = usePathname()

  return (
    <div className={`${className ?? ''} relative max-w-40 min-w-40 bg-custom-blue`}>
        {user ? (
      <nav className="fixed max-w-40 min-w-40">
        <ul className="flex flex-col">
          {pages.map((page) => (
            <li key={page.href} className={`flex px-2 py-2 ${pathname === page.href ? 'bg-white/10' : ''}`}>
              <Link
                href={page.href}
                className="text-custom-white text-sm w-full"
              >
                {page.label}
              </Link>
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