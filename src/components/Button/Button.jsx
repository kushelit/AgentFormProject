
import PropTypes from "prop-types";
import React from "react";
import { Add } from "../Add";
import "./style.css";
export const Button = ({
  type,
  icon,
  state,
  className,
  buttonClassName,
  text = "כפתור",
  onClick,
}) => {
  return (
    <div
      className={`button ${type} state-${state} ${className}`}
      data-03-components-colors-mode="light"
    >
      {icon === "off" && (
        <button
          className={`div ${buttonClassName}`}
          onClick={onClick} // הוספת אירוע onClick לכפתור
          data-03-components-colors-mode="light"
        >
          {text}
        </button>
      )}

      {icon === "on" && (
        <>
          <button
            className="text-wrapper-2"
            onClick={onClick} // הוספת אירוע onClick גם כאן
            data-03-components-colors-mode="light"
          >
            {text}
          </button>

          <Add
            add={
              type === "primary"
                ? "/static/img/add-7.png"
                : state === "hover" && ["secondary", "tertiary"].includes(type)
                ? "/static/img/add-18.png"
                : state === "disabled" &&
                  ["secondary", "tertiary"].includes(type)
                ? "/static/img/add-16.png"
                : "/static/img/add-2.png"
            }
            className="add-instance"
          />
        </>
      )}
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
};