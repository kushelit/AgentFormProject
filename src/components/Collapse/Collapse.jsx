/*
We're constantly improving the code you see. 
Please share your feedback here: https://form.asana.com/?k=uvp-HPgd3_hyoXRBw1IcNg&d=1152665201300829
*/

import PropTypes from "prop-types";
import React from "react";
import "./style.css";

export const Collapse = ({ className, collapse = "/static/img/collapse-6.png" }) => {
  return (
    <img className={`collapse ${className}`} alt="Collapse" src={collapse} />
  );
};

Collapse.propTypes = {
  collapse: PropTypes.string,
};
