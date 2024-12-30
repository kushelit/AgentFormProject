/*
We're constantly improving the code you see. 
Please share your feedback here: https://form.asana.com/?k=uvp-HPgd3_hyoXRBw1IcNg&d=1152665201300829
*/

import PropTypes from "prop-types";
import React from "react";
import "./style.css";

export const DialogHeader = ({ type, className }) => {
  return (
    <div
      className={`dialog-header type-0-${type} ${className}`}
      data-03-components-colors-mode="light"
    />
  );
};

DialogHeader.propTypes = {
  type: PropTypes.oneOf(["warning", "success", "error"]),
};
