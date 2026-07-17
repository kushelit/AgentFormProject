'use client';
import React, { useState, useEffect } from "react";
import { NavbarItem } from "../NavbarItem";
import { Expand } from "../Expand";
import { Collapse } from "../Collapse";
import useFetchAgentData from "@/hooks/useFetchAgentData";
import { useAuth } from '@/lib/firebase/AuthContext';
import ContactFormModal from "@/components/ContactFormModal/ContactFormModal";
import "./Navbar.css";
import { usePermission } from '@/hooks/usePermission';


export const Navbar = ({ items, bottomPage, className }) => {
  const [openSubmenu, setOpenSubmenu] = useState(null);
  const [selectedTab, setSelectedTab] = useState(null);
  const [isContactOpen, setIsContactOpen] = useState(false);
  const [isClient, setIsClient] = useState(false);

  const { user, detail } = useAuth();
  const { selectedAgentId } = useFetchAgentData();


  // const isItemVisible = (item) => {
  //   // עד שטעון ה-role – לא להציג (גם מונע הבהוב)
  //   if (!detail?.role) return false;
  
  //   if (Array.isArray(item.onlyRoles) && item.onlyRoles.length > 0) {
  //     return item.onlyRoles.includes(detail.role);
  //   }
  //   return true;
  // };


const { canAccess: canAccessElementary } = usePermission(user ? 'access_sharon_elementary' : null);
const { canAccess: canAccessTax } = usePermission(user ? 'access_sharon_tax_returns' : null);  // ← חסר!
const { canAccess: canAccessSummary } = usePermission(user ? 'access_sharon_summary' : null);
const { canAccess: canAccessPension } = usePermission(user ? 'access_sharon_pension' : null);
const { canAccess: canAccessCrm } = usePermission(user ? 'access_crm_module' : null);
const { canAccess: canAccessCustomerTiers } = usePermission(user ? 'access_customer_tiers' : null);

const permissionsMap = {
  access_sharon_elementary: canAccessElementary,
  access_sharon_tax_returns: canAccessTax,
  access_sharon_summary: canAccessSummary,
  access_sharon_pension: canAccessPension,
  access_crm_module: canAccessCrm, 
  access_customer_tiers: canAccessCustomerTiers,
};

const isItemVisible = (item) => {
  if (!detail?.role) return false;

  if (Array.isArray(item.onlyRoles) && item.onlyRoles.length > 0) {
    if (!item.onlyRoles.includes(detail.role)) return false;
  }

  if (Array.isArray(item.onlyPermissions) && item.onlyPermissions.length > 0) {
  return item.onlyPermissions.some(
    (p) => permissionsMap[p] === true
  );
}

  return true;
};



  // זיהוי רנדר בצד לקוח
  useEffect(() => {
    setIsClient(true);
  }, []);

  // שחזור מ-localStorage רק בקליינט
  useEffect(() => {
    if (!isClient) return;
    const savedTab = localStorage.getItem("selectedTab");
    const savedOpenSubmenu = localStorage.getItem("openSubmenu");

    if (savedTab) setSelectedTab(savedTab);
    if (savedOpenSubmenu) setOpenSubmenu(null);
  }, [isClient]);

  const handleTabClick = (href) => {
    setSelectedTab(href);
    localStorage.setItem("selectedTab", href);
  };



  const handleToggle = (href) => {
    if (openSubmenu === href) {
      setOpenSubmenu(null);
      localStorage.removeItem("openSubmenu");
    } else {
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
              handleToggle(item.href);
            } else {
              setOpenSubmenu(null);
              handleTabClick(item.href);
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
      handleToggle(item.href);
    }}
    aria-expanded={openSubmenu === item.href}
  >
    {openSubmenu === item.href ? '▾' : '▸'}
  </span>
)}
      </div>
    </NavbarItem>
  );

  return (
    <div className={`navbar ${className}`}>
      {user ? (
        <>
       {Array.isArray(items) &&
  items
    .filter(isItemVisible)                      // ← סינון פריטים ראשיים
    .map((item) => (
      <React.Fragment key={item.href}>
        {renderNavbarItem(item)}
        {item.submenu && openSubmenu === item.href && (
          <div className="submenu">
            {item.submenu
              .filter(isItemVisible)            // ← סינון גם לתת-פריטים
              .map((submenuItem) => (
                <NavbarItem key={submenuItem.href} className="submenu-item" state="default">
                  <a
                    href={submenuItem.href}
                    className="navbar-link"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTabClick(submenuItem.href);
                    }}
                  >
                    {submenuItem.label}
                  </a>
                </NavbarItem>
              ))}
          </div>
        )}
      </React.Fragment>
    ))
}
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
            <a
              href="#"
              className="contact-link"
              onClick={(e) => {
                e.preventDefault();
                setIsContactOpen(true);
              }}
            >
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
        <p>נא התחבר למערכת</p>
      )}
    </div>
  );
};
