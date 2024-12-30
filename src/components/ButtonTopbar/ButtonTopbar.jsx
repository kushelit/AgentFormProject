/*
We're constantly improving the code you see. 
Please share your feedback here: https://form.asana.com/?k=uvp-HPgd3_hyoXRBw1IcNg&d=1152665201300829
*/

import PropTypes from "prop-types";
import React from "react";
import { Logout } from "../Logout";
import "./style.css";

export const ButtonTopbar = ({ state, className }) => {
  return (
    <div
      className={`button-topbar ${className}`}
      data-03-components-colors-mode="light"
    >
      <button
        className={`text-wrapper ${state}`}
        data-03-components-colors-mode="light"
      >
        התנתק
      </button>

      <Logout
        className={`${state === "hover" ? "class" : (state === "disabled") ? "class-2" : "class-3"}`}
      />
    </div>
  );
};

ButtonTopbar.propTypes = {
  state: PropTypes.oneOf(["disabled", "hover", "default"]),
};
