/*
We're constantly improving the code you see. 
Please share your feedback here: https://form.asana.com/?k=uvp-HPgd3_hyoXRBw1IcNg&d=1152665201300829
*/

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
}) => {
  return (
    <div
      className={`button ${type} state-${state} ${className}`}
      data-03-components-colors-mode="light"
    >
      {icon === "off" && (
        <button
          className={`div ${buttonClassName}`}
          data-03-components-colors-mode="light"
        >
          {text}
        </button>
      )}

      {icon === "on" && (
        <>
          <button
            className="text-wrapper-2"
            data-03-components-colors-mode="light"
          >
            {text}
          </button>

          <Add
            add={
              type === "primary"
                ? "/img/add-7.png"
                : state === "hover" && ["secondary", "tertiary"].includes(type)
                  ? "/img/add-18.png"
                  : state === "disabled" &&
                      ["secondary", "tertiary"].includes(type)
                    ? "/img/add-16.png"
                    : "/img/add-2.png"
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
};
