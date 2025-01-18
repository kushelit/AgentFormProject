import React, { useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";
import { Menu8 } from "../icons/Menu8";
import "./style.css";


const MenuWrapper = ({ className, menuItems, rowId , openMenuRow, setOpenMenuRow}) => {
  const [menuState, setMenuState] = useState("default");
  const menuRef = useRef();

  // Function to handle icon color based on state
  const getColor = () => {
    switch (menuState) {
      case "hover":
        return "#4D7DA8";
      case "active":
        return "#3C6B96";
      case "disabled":
        return "#A2B7C4";
      default:
        return "#696969";
    }
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest(".menu-wrapper")) {
        setOpenMenuRow(null);
        setMenuState("default");
      }
    }; 
    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, [setOpenMenuRow]);

  // Adjust menu position to prevent overflow
  useEffect(() => {
    if (openMenuRow && menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      if (rect.left < 0) {
        menuRef.current.style.left = "auto";
        menuRef.current.style.right = "0";
      }
    }
  }, [openMenuRow]);

  const toggleMenu = () => {
    if (openMenuRow === rowId) {
      setOpenMenuRow(null); // סוגר את התפריט
    } else {
      setOpenMenuRow(rowId); // פותח את התפריט של השורה הנוכחית
    }
  };
  
  
  return (
    <div
    className={`menu-wrapper ${className || ""}`}
    onMouseEnter={() => setMenuState("hover")}
      onMouseLeave={() => setMenuState(openMenuRow ? "active" : "default")}
    >
      <div className="custom-menu-button" onClick={() => toggleMenu(rowId)}>
        <Menu8 color={getColor()} />
      </div>

      {openMenuRow === rowId ? (
  <div className="menu-options" ref={menuRef}>
    {menuItems.map((menuItem, index) => (
      <div key={index} onClick={menuItem.onClick} className="menu-item">
        <menuItem.Icon className="menu-item-icon" />
        {menuItem.label}
      </div>
    ))}
  </div>
) : null}
    </div>
  );
} 


MenuWrapper.propTypes = {
  className: PropTypes.string,
  menuItems: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      onClick: PropTypes.func.isRequired,
      Icon: PropTypes.elementType.isRequired,
    })
  ).isRequired,
  rowId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
};

export default MenuWrapper;
