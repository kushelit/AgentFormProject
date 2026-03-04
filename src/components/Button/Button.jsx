import PropTypes from "prop-types";
import React from "react";
import "./style.css";

export const Button = ({
  type = "primary", // ברירת מחדל
  icon = "off",
  state = "default",
  className = "",
  text = "כפתור",
  onClick,
  disabled = false,
}) => {
  const currentState = disabled ? "disabled" : state;
  return (
    <button
     className={`button ${type} state-${currentState} ${className}`}
      onClick={!disabled ? onClick : undefined} // הגנה נוספת מפני לחיצות
      disabled={disabled}
    >
      {text}
    </button>
  );
};

Button.propTypes = {
  type: PropTypes.oneOf(["primary", "secondary", "tertiary"]),
  icon: PropTypes.oneOf(["off", "on"]),
  state: PropTypes.oneOf(["disabled", "hover", "default"]),
  text: PropTypes.string,
  className: PropTypes.string,
  onClick: PropTypes.func,
  disabled: PropTypes.bool,
};
