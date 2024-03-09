"use client"

import Link from 'next/link';
import styles from './Sidebar.module.css'; 


type SidebarProps = {
    className?: string;
  };
  
  const Sidebar: React.FC<SidebarProps> = ({ className }) => {
    return (
      <div className={`${className} ${styles.sidebar} bg-custom-blue`}>
        <nav>
          <ul>
            <li><Link href="/" className="text-custom-white">ניהול עסקאות</Link></li>
            <li><Link href="/summaryTable" className="text-custom-white">דף מרכז </Link></li>
            <li><Link href="/ManageWorkers" className="text-custom-white">ניהול עובדים</Link></li>
            <li><Link href="/contact" className="text-custom-white">ניהול יעדים ומבצעים</Link></li>
            <li><Link href="/contact" className="text-custom-white">ניהול עמלות </Link></li>
            {/* Additional list items with the class applied */}
          </ul>
        </nav>
      </div>
    );
  };
  export default Sidebar;