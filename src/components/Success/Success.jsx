/*
We're constantly improving the code you see. 
Please share your feedback here: https://form.asana.com/?k=uvp-HPgd3_hyoXRBw1IcNg&d=1152665201300829
*/

import PropTypes from "prop-types";
import React from "react";
import "./style.css";

export const Success = ({ className, success = "/img/success.png" }) => {
  return <img className={`success ${className}`} alt="Success" src={success} />;
};

Success.propTypes = {
  success: PropTypes.string,
};
