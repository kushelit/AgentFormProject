'use client';
import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { NavbarItem } from "../NavbarItem";
import useFetchAgentData from "@/hooks/useFetchAgentData";
import { useAuth } from '@/lib/firebase/AuthContext';
import { usePermission } from '@/hooks/usePermission';
import usePrimarySystem, { LAST_SYSTEM_KEY } from '@/hooks/usePrimarySystem';
import { systems, menus } from '@/config/pagesConfig';
import "./Navbar.css";

// =========================================================
// עזרים
// =========================================================

// האם href תואם לנתיב הנוכחי (כולל דפים שמתחתיו)
const matchesPath = (pathname, href) => {
  if (!href || href.startsWith('#')) return false;
  return pathname === href || pathname.startsWith(href + '/');
};

// האם תפריט מכיל את הנתיב הנוכחי (כולל תתי-תפריטים)
const menuContainsPath = (menu, pathname) =>
  Array.isArray(menu) &&
  menu.some(
    (item) =>
      matchesPath(pathname, item.href) ||
      (Array.isArray(item.submenu) &&
        item.submenu.some((sub) => matchesPath(pathname, sub.href)))
  );

const isLatin = (text) => /^[\x00-\x7F]+$/.test(text);

const readLastSystem = () => {
  try {
    return sessionStorage.getItem(LAST_SYSTEM_KEY);
  } catch {
    return null;
  }
};

const writeLastSystem = (id) => {
  try {
    sessionStorage.setItem(LAST_SYSTEM_KEY, id);
  } catch {
    // אין גישה ל-storage - לא קריטי
  }
};

// =========================================================
// Navbar
// items / bottomPage עדיין מתקבלים מה-layout אבל כבר לא בשימוש
// =========================================================
export const Navbar = ({ className }) => {
  const pathname = usePathname() || '';
  const [openSubmenu, setOpenSubmenu] = useState(null);
  const [lastSystemId, setLastSystemId] = useState(null);

  const { user, detail } = useAuth();
  // נשאר כמו שהיה - ייתכן שה-hook מבצע טעינה שדפים אחרים נשענים עליה
  const { selectedAgentId } = useFetchAgentData();

  // =========================================================
  // הרשאות
  // =========================================================
  const { canAccess: canAccessMagicTouch } = usePermission(user ? 'access_magic_touch' : null);
  const { canAccess: canAccessElementary } = usePermission(user ? 'access_sharon_elementary' : null);
  const { canAccess: canAccessTax } = usePermission(user ? 'access_sharon_tax_returns' : null);
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
    access_magic_touch: canAccessMagicTouch,
  };

  const isItemVisible = (item) => {
    if (!detail?.role) return false;

    if (Array.isArray(item.onlyRoles) && item.onlyRoles.length > 0) {
      if (!item.onlyRoles.includes(detail.role)) return false;
    }

    if (Array.isArray(item.onlyPermissions) && item.onlyPermissions.length > 0) {
      return item.onlyPermissions.some((p) => permissionsMap[p] === true);
    }

    return true;
  };

  // =========================================================
  // מערכות גלויות, מסודרות: ראשית ← לפי ברירת מחדל ← מוצמדות לסוף
  // =========================================================
  // מערכת ראשית - ברמת הסוכן, עובדים יורשים לפי agentId
  const { primarySystem: primarySystemId, isResolved: isPrimaryResolved } = usePrimarySystem();

  const visibleSystems = systems.filter(isItemVisible);

  const orderedSystems = [
    ...visibleSystems.filter((s) => s.id === primarySystemId && !s.pinnedLast),
    ...visibleSystems.filter((s) => s.id !== primarySystemId && !s.pinnedLast),
    ...visibleSystems.filter((s) => s.pinnedLast),
  ];

  // מערכות שיש להן תפריט ב-sidebar
  const menuSystems = orderedSystems.filter((s) => !s.external && menus[s.id]);
  const isMenuSystem = (id) => menuSystems.some((s) => s.id === id);

  // =========================================================
  // המערכת הפעילה
  // 1. הדף שייך למערכת אחת בלבד → היא
  // 2. הדף שייך לכמה מערכות → זו שממנה הגענו, אחרת הראשונה בסדר
  // 3. הדף לא שייך לאף מערכת → זו שממנה הגענו, אחרת הראשית
  // =========================================================
  useEffect(() => {
    setLastSystemId(readLastSystem());
  }, []);

  const getActiveSystemId = () => {
    const owners = menuSystems
      .filter((s) => menuContainsPath(menus[s.id], pathname))
      .map((s) => s.id);

    if (owners.length === 1) return owners[0];

    if (owners.length > 1) {
      return owners.includes(lastSystemId) ? lastSystemId : owners[0];
    }

    if (lastSystemId && isMenuSystem(lastSystemId)) return lastSystemId;
    if (isMenuSystem(primarySystemId)) return primarySystemId;
    return menuSystems[0]?.id || 'magicsale';
  };

  const activeSystemId = getActiveSystemId();
  const activeSystem = menuSystems.find((s) => s.id === activeSystemId);
  const activeMenu = menus[activeSystemId] || [];

  // זכירת המערכת הפעילה לדפים משותפים
  useEffect(() => {
    if (!detail?.role || !activeSystemId) return;
    if (activeSystemId !== lastSystemId) {
      writeLastSystem(activeSystemId);
      setLastSystemId(activeSystemId);
    }
  }, [activeSystemId, detail?.role]);

  // =========================================================
  // מצב פעיל של פריט
  // =========================================================
  const isItemActive = (item) => {
    if (matchesPath(pathname, item.href)) return true;
    if (Array.isArray(item.submenu)) {
      return item.submenu.some((sub) => matchesPath(pathname, sub.href));
    }
    return false;
  };

  // פתיחה אוטומטית של תת-התפריט שמכיל את הדף הנוכחי
  useEffect(() => {
    const menu = menus[activeSystemId] || [];
    const activeParent = menu.find(
      (item) =>
        Array.isArray(item.submenu) &&
        item.submenu.some((sub) => matchesPath(pathname, sub.href))
    );
    setOpenSubmenu(activeParent ? activeParent.href : null);
  }, [pathname, activeSystemId]);

  const handleToggle = (href) => {
    setOpenSubmenu((current) => (current === href ? null : href));
  };

  // =========================================================
  // כותרת - שם המערכת הנוכחית
  // =========================================================
  const renderSystemTitle = () => {
    if (!activeSystem) return null;
    return (
      <div
        className="navbar-system-title"
        dir={isLatin(activeSystem.label) ? 'ltr' : 'rtl'}
      >
        {activeSystem.label}
      </div>
    );
  };

  // =========================================================
  // מגירת מערכות - פסים זה מתחת לזה
  // =========================================================
  const renderSystemsDrawer = () => {
    // לא מציגים עד שהסדר ידוע - מונע "קפיצה" של הפסים
    if (!isPrimaryResolved) return null;
    if (orderedSystems.length < 2) return null;

    return (
      <nav className="navbar-drawer" aria-label="מעבר בין מערכות">
        {orderedSystems.map((sys) => {
          const isActive = sys.id === activeSystemId;
          return (
            <a
              key={sys.id}
              href={sys.href}
              className={`drawer-bar ${isActive ? 'active' : ''}`}
              aria-current={isActive ? 'true' : undefined}
              onClick={() => {
                if (!sys.external) writeLastSystem(sys.id);
              }}
            >
              <span dir={isLatin(sys.label) ? 'ltr' : 'rtl'}>{sys.label}</span>
            </a>
          );
        })}
      </nav>
    );
  };

  // =========================================================
  // תת-תפריט
  // =========================================================
  const renderSubmenu = (item) => {
    if (!item.submenu || openSubmenu !== item.href) return null;

    return (
      <div className="submenu">
        {item.submenu.filter(isItemVisible).map((submenuItem, index) => (
          <NavbarItem
            key={`${submenuItem.href}-${index}`}
            className="submenu-item"
            state={matchesPath(pathname, submenuItem.href) ? "selected" : "default"}
          >
            <a
              href={submenuItem.href}
              className="navbar-link"
              onClick={(e) => e.stopPropagation()}
            >
              {submenuItem.label}
            </a>
          </NavbarItem>
        ))}
      </div>
    );
  };

  // =========================================================
  // פריט ראשי
  // =========================================================
  const renderNavbarItem = (item) => (
    <NavbarItem
      className="navbar-item-instance"
      state={isItemActive(item) ? "selected" : "default"}
    >
      <div className="navbar-item-content">
        <a
          href={item.submenu ? "#" : item.href}
          className="navbar-link"
          onClick={(e) => {
            if (item.submenu) {
              e.preventDefault();
              handleToggle(item.href);
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

  // =========================================================
  // פריט בתפריט - כותרת קבוצה או פריט רגיל
  // =========================================================
  const renderMenuEntry = (item, index) => {
    if (item.type === 'section') {
      return (
        <div key={`section-${index}`} className="navbar-section-label">
          {item.label}
        </div>
      );
    }

    return (
      <React.Fragment key={`${item.href}-${index}`}>
        {renderNavbarItem(item)}
        {renderSubmenu(item)}
      </React.Fragment>
    );
  };

  // =========================================================
  // Render
  // =========================================================
  if (!user) {
    return (
      <div className={`navbar ${className || ''}`}>
        <p>נא התחבר למערכת</p>
      </div>
    );
  }

  const visibleEntries = activeMenu.filter(isItemVisible);

  return (
    <div className={`navbar ${className || ''}`}>
      {/* כותרת - המערכת הנוכחית */}
      {renderSystemTitle()}

      {/* תפריט המערכת - גולל בתוך עצמו */}
      <div className="navbar-scroll">
        {visibleEntries.map(renderMenuEntry)}
      </div>

      {/* מגירת מערכות - תמיד נראית */}
      {renderSystemsDrawer()}
    </div>
  );
};