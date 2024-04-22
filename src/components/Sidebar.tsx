"use client"

import Link from 'next/link';
import styles from './Sidebar.module.css'; 
import { useAuth } from "@/lib/firebase/AuthContext";


type SidebarProps = {
    className?: string;
  };
  
  const Sidebar: React.FC<SidebarProps> = ({ className }) => {
    const { user } = useAuth(); // Destructure to get the user object

    return (
      <div className={`${className} ${styles.sidebar} bg-custom-blue`}>
         {user ? (
        <nav>
          <ul>
            <li><Link href="/" className="text-custom-white">ניהול עסקאות</Link></li>
            <li><Link href="/summaryTable" className="text-custom-white">דף מרכז </Link></li>
            <li><Link href="/ManageWorkers" className="text-custom-white">ניהול עובדים</Link></li>
            <li><Link href="/contact" className="text-custom-white">ניהול יעדים ומבצעים</Link></li>
            <li><Link href="/ManageContracts" className="text-custom-white">ניהול עמלות </Link></li>
            {/* Additional list items with the class applied */}
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