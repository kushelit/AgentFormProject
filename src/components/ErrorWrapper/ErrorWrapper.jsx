
import PropTypes from "prop-types";
import React from "react";
import "./style.css";

export const ErrorWrapper = ({ className, error = "/static/img/error-1.png" }) => {
  return (
    <img className={`error-wrapper ${className}`} alt="Error" src={error} />
  );
};

ErrorWrapper.propTypes = {
  error: PropTypes.string,
};
