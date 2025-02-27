import PropTypes from "prop-types";
import React, { useState } from "react";
import { Collapse } from "../Collapse";
import { Expand } from "../Expand";
import "./style.css";

export const NavbarItem = ({
  state,
  type,
  className,
  children,
  hasSubmenu,
  isSubmenuOpen,
  onToggleSubmenu,
  onClick 
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
    className={`navbar-item ${className} ${
      isHovered ? "state-12-hover" : ""
    } ${state === "selected" ? "state-12-selected" : ""}`}
    onMouseEnter={() => setIsHovered(true)}
    onMouseLeave={() => setIsHovered(false)}
    onClick={(e) => {
      if (hasSubmenu) {
        e.stopPropagation(); // מונע אירוע לחיצה כפול
      }
      onClick && onClick(e); // קרא ל-onClick אם קיים
    }}
  >
      <div className="navbar-item-content" onClick={onClick}>
      <span className="menu-label">{children}</span>
         {hasSubmenu && (
          <span
            className="submenu-toggle"
            onClick={onToggleSubmenu}
            aria-expanded={isSubmenuOpen}
          >
            {isSubmenuOpen ? (
              <Collapse className="collapse-icon" collapse="/static/img/collapse-6.png" />
            ) : (
              <Expand className="expand-icon" expand="/static/img/expand-5.png" />
            )}
          </span>
        )}
      </div>
    </div>
  );
};

NavbarItem.propTypes = {
  state: PropTypes.oneOf(["hover", "selected", "default"]),
  type: PropTypes.oneOf(["collapse", "expand", "secondary", "default"]),
  className: PropTypes.string,
  children: PropTypes.node,
  hasSubmenu: PropTypes.bool, // האם יש תפריט משנה
  isSubmenuOpen: PropTypes.bool, // האם תפריט המשנה פתוח
  onToggleSubmenu: PropTypes.func, // פעולה להפעלת תפריט המשנה
  onClick: PropTypes.func, // פעולה ללחיצה כללית
};