import PropTypes from "prop-types";
import React from "react";

const Menu8 = ({ color = "#696969", className }) => {
  return (
    <svg
      className={`menu-8 ${className || ""}`.trim()}
      fill="none"
      width="24"
      height="24"
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M18 24.68C18 24.24 18.21 23.83 18.58 23.52C18.96 23.22 19.47 23.05 20 23.05C20.53 23.05 21.04 23.22 21.41 23.52C21.79 23.83 22 24.24 22 24.68C22 25.11 21.79 25.52 21.41 25.83C21.04 26.14 20.53 26.31 20 26.31C19.47 26.31 18.96 26.14 18.58 25.83C18.21 25.52 18 25.11 18 24.68ZM18 18.15C18 17.72 18.21 17.31 18.58 17C18.96 16.69 19.47 16.52 20 16.52C20.53 16.52 21.04 16.69 21.41 17C21.79 17.31 22 17.72 22 18.15C22 18.59 21.79 19 21.41 19.31C21.04 19.61 20.53 19.78 20 19.78C19.47 19.78 18.96 19.61 18.58 19.31C18.21 19 18 18.59 18 18.15ZM18 11.63C18 11.2 18.21 10.78 18.58 10.48C18.96 10.17 19.47 10 20 10C20.53 10 21.04 10.17 21.41 10.48C21.79 10.78 22 11.2 22 11.63C22 12.06 21.79 12.48 21.41 12.78C21.04 13.09 20.53 13.26 20 13.26C19.47 13.26 18.96 13.09 18.58 12.78C18.21 12.48 18 12.06 18 11.63Z"
        fill={color}
      />
    </svg>
  );
};

Menu8.propTypes = {
  color: PropTypes.string,
  className: PropTypes.string,
};

export default Menu8;
