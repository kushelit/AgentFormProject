

import PropTypes from "prop-types";
import React from "react";
import "./style.css";

export const Add = ({ className, add = "/static/img/add-9.png" }) => {
  return <img className={`add ${className}`} alt="Add" src={add} />;
};

Add.propTypes = {
  add: PropTypes.string,
};
