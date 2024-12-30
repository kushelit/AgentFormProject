/*
We're constantly improving the code you see. 
Please share your feedback here: https://form.asana.com/?k=uvp-HPgd3_hyoXRBw1IcNg&d=1152665201300829
*/

import PropTypes from "prop-types";
import React from "react";
import "./style.css";

export const Add = ({ className, add = "/img/add-9.png" }) => {
  return <img className={`add ${className}`} alt="Add" src={add} />;
};

Add.propTypes = {
  add: PropTypes.string,
};
