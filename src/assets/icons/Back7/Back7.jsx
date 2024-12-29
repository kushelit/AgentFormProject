/*
We're constantly improving the code you see. 
Please share your feedback here: https://form.asana.com/?k=uvp-HPgd3_hyoXRBw1IcNg&d=1152665201300829
*/

import PropTypes from "prop-types";
import React from "react";

export const Back7 = ({ color = "#A2B7C4", className }) => {
  return (
    <svg
      className={`back-7 ${className}`}
      fill="none"
      height="20"
      viewBox="0 0 20 20"
      width="20"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        className="path"
        d="M7.09 9.49878L13 4L13 5.94523L9.1818 9.49829L13 13.0538L13 15L7.09073 9.49976L7.09 9.49878Z"
        fill={color}
      />
    </svg>
  );
};

Back7.propTypes = {
  color: PropTypes.string,
};
