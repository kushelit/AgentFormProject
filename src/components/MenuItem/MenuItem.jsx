import PropTypes from "prop-types";
import React from "react";
import "./style.css";

export const MenuItem = ({ state, className, onClick, children }) => {
  return (
    <div
      className={`menu-item state-22-${state} ${className}`}
      data-03-components-colors-mode="light"
      onClick={onClick} // תמיכה ב-onClick
    >
      <div className="label-18" data-03-components-colors-mode="light">
        {children} {/* הצגת תוכן שהועבר */}
      </div>
    </div>
  );
};

MenuItem.propTypes = {
  state: PropTypes.oneOf(["disabled", "hover", "selected", "default"]),
  className: PropTypes.string,
  onClick: PropTypes.func,
  children: PropTypes.node, // תמיכה ב-children
};
