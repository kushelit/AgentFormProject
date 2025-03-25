import React from "react";
import Link from "next/link";

const HelpNavigation = () => {
  return (
    <div className="help-navigation">
      <hr />
      <p><strong>📖 המשך לעמודים נוספים במדריך:</strong></p>
      <div className="help-links">
        <Link href="/Help/reports" className="help-link">📘 דוחות</Link> |
        <Link href="/Help/commissions" className="help-link"> 🔗 עמלות</Link> |
        <Link href="/Help/clients" className="help-link"> 🔗 ניהול לקוחות</Link>
      </div>
    </div>
  );
};

export default HelpNavigation;
