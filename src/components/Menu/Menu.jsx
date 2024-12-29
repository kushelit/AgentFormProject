/*
We're constantly improving the code you see. 
Please share your feedback here: https://form.asana.com/?k=uvp-HPgd3_hyoXRBw1IcNg&d=1152665201300829
*/

import PropTypes from "prop-types";
import React from "react";
import { Menu8 } from "../../assets/icons/Menu8";
import "./style.css";

export const Menu = ({ state }) => {
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

Menu.propTypes = {
  state: PropTypes.oneOf(["disabled", "hover", "active", "default"]),
};
