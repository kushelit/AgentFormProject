/*
We're constantly improving the code you see. 
Please share your feedback here: https://form.asana.com/?k=uvp-HPgd3_hyoXRBw1IcNg&d=1152665201300829
*/

import PropTypes from "prop-types";
import React from "react";
import { StateDefaultActiveOn } from "../../assets/icons/StateDefaultActiveOn";
import "./style.css";

export const Checkbox = ({ state, active, stateDefaultActiveClassName }) => {
  return (
    <>
      {active === "off" && (
        <div
          className={`checkbox state-3-${state} ${stateDefaultActiveClassName}`}
        />
      )}

      {active === "on" && (
        <StateDefaultActiveOn
          className="state-default-active"
          color={
            state === "hover"
              ? "#345D82"
              : state === "disabled"
                ? "#A2B7C4"
                : "#3C6B96"
          }
        />
      )}
    </>
  );
};

Checkbox.propTypes = {
  state: PropTypes.oneOf(["disabled", "hover", "default"]),
  active: PropTypes.oneOf(["off", "on"]),
};
