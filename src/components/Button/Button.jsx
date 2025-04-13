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
  return (
    <button
      className={`button ${type} state-${state} ${className}`}
      // data-03-components-colors-mode="light"
      onClick={onClick}
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
