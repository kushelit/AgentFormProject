

import PropTypes from "prop-types";
import React from "react";
import "./style.css";

export const Checkmark = ({
  className,
  checkmark = "/static/img/checkmark-1.png",
}) => {
  return (
    <img className={`checkmark ${className}`} alt="Checkmark" src={checkmark} />
  );
};

Checkmark.propTypes = {
  checkmark: PropTypes.string,
};
