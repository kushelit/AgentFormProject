
import PropTypes from "prop-types";
import React from "react";
import { Add } from "../Add";
import "./style.css";

export const Button = ({
  type = "primary", // ברירת מחדל לסוג הכפתור
  icon = "off", // ברירת מחדל לאייקון
  state = "default", // ברירת מחדל ל-state
  className = "",
  buttonClassName = "",
  text = "כפתור",
  onClick,
  disabled = false, // ברירת מחדל ל-disabled
}) => {
  return (
    <div
      className={`button ${type} state-${state} ${className}`}
      data-03-components-colors-mode="light"
    >
      <button
        className={`div ${buttonClassName}`}
        onClick={onClick}
        disabled={disabled} // שימוש בפרמטר disabled
        data-03-components-colors-mode="light"
      >
        {text}
      </button>
    </div>
  );
};


Button.propTypes = {
  type: PropTypes.oneOf(["primary", "secondary", "tertiary"]),
  icon: PropTypes.oneOf(["off", "on"]),
  state: PropTypes.oneOf(["disabled", "hover", "default"]),
  text: PropTypes.string,
  className: PropTypes.string,
  buttonClassName: PropTypes.string,
  onClick: PropTypes.func, // הוספת onClick
  disabled: PropTypes.bool, // פרופס חדש
};