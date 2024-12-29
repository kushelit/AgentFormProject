/*
We're constantly improving the code you see. 
Please share your feedback here: https://form.asana.com/?k=uvp-HPgd3_hyoXRBw1IcNg&d=1152665201300829
*/

import PropTypes from "prop-types";
import React from "react";

export const Next7 = ({ color = "#A2B7C4", className }) => {
  return (
    <svg
      className={`next-7 ${className}`}
      fill="none"
      height="20"
      viewBox="0 0 20 20"
      width="20"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        className="path"
        d="M12.91 9.49878L7 4L7 5.94523L10.8182 9.49829L7 13.0538L7 15L12.9093 9.49976L12.91 9.49878Z"
        fill={color}
      />
    </svg>
  );
};

Next7.propTypes = {
  color: PropTypes.string,
};
