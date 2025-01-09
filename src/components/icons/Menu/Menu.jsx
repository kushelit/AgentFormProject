import React from "react";
import Menu8 from "../Menu8/Menu8"; // הייבוא הנכון

const Menu = ({ state }) => {
  return (
    <div className="menu">
      <Menu8
        className="menu-8"
        color={
          state === "hover"
            ? "#4D7DA8"
            : state === "active"
            ? "#3C6B96"
            : state === "disabled"
            ? "#A2B7C4"
            : "#696969"
        }
      />
    </div>
  );
};

export default Menu; // וודאי שיש ייצוא דיפולט
