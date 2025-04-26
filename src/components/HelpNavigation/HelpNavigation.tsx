"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import "./HelpNavigation.css";

const HelpNavigation = () => {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(true);

  const links = [
    { href: "/Help/deals", label: "💼 ניהול עסקאות ויעדים" },
    { href: "/Help/clients", label: "🧑‍💼 ניהול לקוחות" },
    { href: "/Help/central", label: "🏢 דף מרכז" },
    { href: "/Help/commissions", label: "💰 ניהול עמלות" },
    { href: "/Help/simulator", label: "🧮 סימולטור" },
    { href: "/Help/targets", label: "🎯 ניהול יעדים ומבצעים" },
    { href: "/Help/flow", label: "🔄 Flow - ניהול לידים" },
    { href: "/Help/mdflow", label: "🧩 Flow - ניהול הגדרות לידים" },
    { href: "/Help/TeamPermissions", label: "🛡️ ניהול הרשאות" },

    
    // { href: "/Help/reports", label: "📈 דוחות" },
  ];

  // סגירת הרשימה אוטומטית בעת שינוי נתיב
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  return (
    <div className="help-navigation">
      <hr />
      <button onClick={() => setIsOpen(!isOpen)} className="help-toggle">
        <strong>📖 המשך לעמודים נוספים במדריך:</strong> {isOpen ? "🔽" : "▶️"}
      </button>
      <div className={`help-links-wrapper ${isOpen ? "open" : ""}`}>
        <div className="help-links">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`help-link ${pathname === link.href ? "active-link" : ""}`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HelpNavigation;
