"use client";
import React, { useState, useEffect } from "react";
import { NavbarItem } from "../NavbarItem";
import { Expand } from "../Expand";
import { Collapse } from "../Collapse";
import useFetchAgentData from "@/hooks/useFetchAgentData"; 
import { useAuth } from '@/lib/firebase/AuthContext';
import ContactFormModal from "@/components/ContactFormModal/ContactFormModal";
import "./Navbar.css";

export const Navbar = ({ items, bottomPage, className }) => {
  const [openSubmenu, setOpenSubmenu] = useState(null);
  const [selectedTab, setSelectedTab] = useState(null);
  const {  user, detail } = useAuth(); // קבלת מידע על המשתמש המחובר

  const [isContactOpen, setIsContactOpen] = useState(false);


  const { 
    selectedAgentId, 
  } = useFetchAgentData();


  // שחזור המצב מ-localStorage בעת טעינת הקומפוננטה
  useEffect(() => {
    const savedTab = localStorage.getItem("selectedTab");
    const savedOpenSubmenu = localStorage.getItem("openSubmenu");

    if (savedTab) {
      setSelectedTab(savedTab); // שחזור הטאב שנבחר
    }

    // נוודא שהמצב נשמר אך לא נפתח אוטומטית
    if (savedOpenSubmenu) {
      setOpenSubmenu(null); // לא פותחים אוטומטית
    }
  }, []);

  // עדכון הטאב שנבחר
  const handleTabClick = (href) => {
    setSelectedTab(href);
    localStorage.setItem("selectedTab", href);
  };

  // פתיחה וסגירה של תפריט המשנה
  const handleToggle = (href) => {
    if (openSubmenu === href) {
      // אם התפריט פתוח, נסגור אותו
      setOpenSubmenu(null);
      localStorage.removeItem("openSubmenu");
    } else {
      // אם התפריט סגור, נפתח אותו
      setOpenSubmenu(href);
      localStorage.setItem("openSubmenu", href);
    }
  };

  const renderNavbarItem = (item, isSubmenu = false) => (
    <NavbarItem
      key={item.href}
      className={`navbar-item-instance ${isSubmenu ? "submenu-item" : ""}`}
      state={selectedTab === item.href ? "selected" : "default"}
    >
      <div className="navbar-item-content">
        <a
          href={item.submenu ? "#" : item.href}
          className="navbar-link"
          onClick={(e) => {
            if (item.submenu) {
              e.preventDefault();
              handleToggle(item.href); // נהל פתיחה/סגירה של תפריט המשנה
            } else {
              setOpenSubmenu(null); // סגור תפריטים פתוחים
              handleTabClick(item.href); // עדכן את הטאב הנבחר
            }
          }}
        >
          {item.label}
        </a>
        {item.submenu && (
          <span
            className="submenu-toggle"
            onClick={(e) => {
              e.preventDefault();
              handleToggle(item.href); // פתיחה/סגירה של תפריט המשנה
            }}
            aria-expanded={openSubmenu === item.href}
          >
            {openSubmenu === item.href ? (
              <Collapse className="collapse-icon" />
            ) : (
              <Expand className="expand-icon" />
            )}
          </span>
        )}
      </div>
    </NavbarItem>
  );

  return (
    <div className={`navbar ${className}`}>
      {user ? ( // הצגת ה-Navbar רק אם יש משתמש מחובר
        <>
          {Array.isArray(items) &&
            items.map((item) => (
              <React.Fragment key={item.href}>
                {renderNavbarItem(item)}
                {item.submenu &&
                  openSubmenu === item.href && (
                    <div className="submenu">
                      {item.submenu.map((submenuItem) => (
                        <NavbarItem
                          key={submenuItem.href}
                          className="submenu-item"
                          state="default"
                        >
                          <a
                            href={submenuItem.href}
                            className="navbar-link"
                            onClick={(e) => {
                              e.stopPropagation(); // מנע סגירה של התפריט
                              handleTabClick(submenuItem.href); // בחר את הטאב
                            }}
                          >
                            {submenuItem.label}
                          </a>
                        </NavbarItem>
                      ))}
                    </div>
                  )}
              </React.Fragment>
            ))}
          {/* Bottom page */}
          {bottomPage && (
            <div className="navbar-bottom">
              <NavbarItem
                key={bottomPage.href}
                state="default"
                className="bottom-item"
              >
                <a href={bottomPage.href} className="navbar-link" lang="en">
                  {bottomPage.label}
                </a>
                </NavbarItem>
                </div>
                )}
         <div className="contact-container">
  <a href="#" className="contact-link" onClick={(e) => { e.preventDefault(); setIsContactOpen(true); }}>
    📩 צור קשר
  </a>
</div>

{isContactOpen && (
  <ContactFormModal
    onClose={() => setIsContactOpen(false)}
    userEmail={detail?.email || ""}
    userName={detail?.name || "משתמש אנונימי"} 
    />
)}
        </>
      ) : (
        <p>נא התחבר למערכת</p> // הודעה במקרה שאין `selectedAgentId`
      )}
    </div>
  );
};