/*
We're constantly improving the code you see. 
Please share your feedback here: https://form.asana.com/?k=uvp-HPgd3_hyoXRBw1IcNg&d=1152665201300829
*/

import PropTypes from "prop-types";
import React from "react";
import "./style.css";

export const PaginationArrows = ({ type, state, className }) => {
  return (
    <div
      className={`pagination-arrows state-1-${state} ${type} ${className}`}
    />
  );
};

PaginationArrows.propTypes = {
  type: PropTypes.oneOf(["back", "next"]),
  state: PropTypes.oneOf(["disabled", "hover", "selected", "default"]),
};
