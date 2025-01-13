/*
We're constantly improving the code you see. 
Please share your feedback here: https://form.asana.com/?k=uvp-HPgd3_hyoXRBw1IcNg&d=1152665201300829
*/

import PropTypes from "prop-types";
import React from "react";
import "./style.css";

export const ErrorWrapper = ({ className, error = "/img/error-1.png" }) => {
  return (
    <img className={`error-wrapper ${className}`} alt="Error" src={error} />
  );
};

ErrorWrapper.propTypes = {
  error: PropTypes.string,
};
