/*
We're constantly improving the code you see. 
Please share your feedback here: https://form.asana.com/?k=uvp-HPgd3_hyoXRBw1IcNg&d=1152665201300829
*/

import PropTypes from "prop-types";
import React from "react";
import "./style.css";

export const PaginationNumbers = ({ state, divClassName, text = "23" }) => {
  return (
    <div className={`pagination-numbers state-0-${state}`}>
      <div
        className={`element ${["hover", "selected"].includes(state) ? divClassName : undefined}`}
      >
        {text}
      </div>
    </div>
  );
};

PaginationNumbers.propTypes = {
  state: PropTypes.oneOf(["disabled", "hover", "selected", "default"]),
  text: PropTypes.string,
};
