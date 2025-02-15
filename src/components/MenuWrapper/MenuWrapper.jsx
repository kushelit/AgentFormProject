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

  useEffect(() => {
    if (menuRef.current) {
      const menuRect = menuRef.current.getBoundingClientRect();
      const table = menuRef.current.closest('table');
      const tableRect = table?.getBoundingClientRect();
      const nextTable = table?.nextElementSibling?.closest('table');
      const spaceToNextTable = nextTable ? nextTable.getBoundingClientRect().top - menuRect.bottom : window.innerHeight - menuRect.bottom;
      
      if (spaceToNextTable < 100) {
        menuRef.current.style.cssText = `
          position: absolute;
          top: auto;
          bottom: 100%;
          right: -30px; // Increased from -15px
          margin-bottom: 15px; // Increased from 8px
          z-index: 1001;
        `;
      } else {
        menuRef.current.style.cssText = `
          position: absolute;
          top: 0;
          right: -30px; // Increased from -15px
          margin-top: 15px; // Added margin-top
          z-index: 1001;
        `;
      }
    }
  }, [openMenuRow]);

  
  const toggleMenu = () => {
    if (openMenuRow === rowId) {
      console.log("Closing menu for row:", rowId);
      setOpenMenuRow(null); // סוגר את התפריט
    } else {
      console.log("Opening menu for row:", rowId);
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
  // openMenuRow: PropTypes.string,
  // setOpenMenuRow: PropTypes.func.isRequired,
};

export default MenuWrapper;
