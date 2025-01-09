import PropTypes from "prop-types";
import React from "react";
import { Logout } from "../Logout";
import "./style.css";

export const ButtonTopbar = ({ state, className, logOut }) => {
  return (
    <div
      className={`button-topbar ${className}`}
      data-03-components-colors-mode="light"
    >
      <button
        className={`text-wrapper ${state}`}
        data-03-components-colors-mode="light"
        onClick={logOut} // חיבור לפונקציית logOut
      >
        התנתק
      </button>

      <Logout
        className={`${
          state === "hover"
            ? "class"
            : state === "disabled"
            ? "class-2"
            : "class-3"
        }`}
      />
    </div>
  );
};

ButtonTopbar.propTypes = {
  state: PropTypes.oneOf(["disabled", "hover", "default"]),
  className: PropTypes.string,
  logOut: PropTypes.func.isRequired, // דרישה לפונקציית logOut
};
