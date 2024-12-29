/*
We're constantly improving the code you see. 
Please share your feedback here: https://form.asana.com/?k=uvp-HPgd3_hyoXRBw1IcNg&d=1152665201300829
*/

import PropTypes from "prop-types";
import React from "react";

export const StateDefaultActiveOn = ({ color = "#3C6B96", className }) => {
  return (
    <svg
      className={`state-default-active-on ${className}`}
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect className="rect" fill={color} height="16" rx="0.5" width="16" />

      <g className="g" clipPath="url(#clip0_1_5326)">
        <path
          className="path"
          d="M13.015 5.80298L6.88802 12.014L6.5345 11.6555L2.99951 8.07202L4.76701 6.28052L6.77 8.31097L11.1295 4.01099L13.015 5.80298Z"
          fill="white"
        />
      </g>

      <defs className="defs">
        <clipPath className="clip-path" id="clip0_1_5326">
          <rect
            className="rect"
            fill="white"
            height="10"
            transform="translate(3 3)"
            width="10"
          />
        </clipPath>
      </defs>
    </svg>
  );
};

StateDefaultActiveOn.propTypes = {
  color: PropTypes.string,
};
