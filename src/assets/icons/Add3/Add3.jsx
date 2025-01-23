/*
We're constantly improving the code you see. 
Please share your feedback here: https://form.asana.com/?k=uvp-HPgd3_hyoXRBw1IcNg&d=1152665201300829
*/

import PropTypes from "prop-types";
import React from "react";

export const Add3 = ({ color = "#345D82", className }) => {
  return (
    <svg
      className={`add-3 ${className}`}
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g className="g" clipPath="url(#clip0_1_5296)">
        <path
          className="path"
          clipRule="evenodd"
          d="M13.6664 13.647C12.5476 14.7659 11.1221 15.5278 9.57028 15.8365C8.01842 16.1452 6.40988 15.9868 4.94806 15.3813C3.48624 14.7758 2.2368 13.7504 1.35775 12.4348C0.478687 11.1192 0.00949097 9.5725 0.00949097 7.99024C0.00949097 6.40799 0.478687 4.86126 1.35775 3.54566C2.2368 2.23007 3.48624 1.20469 4.94806 0.59919C6.40988 -0.00630617 8.01842 -0.164728 9.57028 0.143966C11.1221 0.45266 12.5476 1.21461 13.6664 2.33344C15.161 3.83673 15.9999 5.87041 15.9999 7.99024C15.9999 10.1101 15.161 12.1438 13.6664 13.647ZM11.2104 7.19024H8.8104V4.79024C8.8104 4.57807 8.72612 4.37459 8.57609 4.22456C8.42606 4.07453 8.22257 3.99024 8.0104 3.99024C7.79823 3.99024 7.59474 4.07453 7.44471 4.22456C7.29469 4.37459 7.2104 4.57807 7.2104 4.79024V7.19024H4.8104C4.59823 7.19024 4.39474 7.27453 4.24471 7.42456C4.09469 7.57459 4.0104 7.77807 4.0104 7.99024C4.0104 8.20242 4.09469 8.4059 4.24471 8.55593C4.39474 8.70596 4.59823 8.79024 4.8104 8.79024H7.2104V11.1902C7.2104 11.4024 7.29469 11.6059 7.44471 11.7559C7.59474 11.906 7.79823 11.9902 8.0104 11.9902C8.22257 11.9902 8.42606 11.906 8.57609 11.7559C8.72612 11.6059 8.8104 11.4024 8.8104 11.1902V8.79024H11.2104C11.4226 8.79024 11.6261 8.70596 11.7761 8.55593C11.9261 8.4059 12.0104 8.20242 12.0104 7.99024C12.0104 7.77807 11.9261 7.57459 11.7761 7.42456C11.6261 7.27453 11.4226 7.19024 11.2104 7.19024Z"
          fill={color}
          fillRule="evenodd"
        />
      </g>

      <defs className="defs">
        <clipPath className="clip-path" id="clip0_1_5296">
          <rect className="rect" fill="white" height="16" width="16" />
        </clipPath>
      </defs>
    </svg>
  );
};

Add3.propTypes = {
  color: PropTypes.string,
};