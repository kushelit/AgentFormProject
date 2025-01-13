import PropTypes from "prop-types";
import React from "react";
import "./style.css";

export const PaginationArrows = ({ type, state, className, onClick }) => {
  return (
    <div
      className={`pagination-arrows state-6-${state} ${type} ${className}`}
      onClick={state !== "disabled" ? onClick : undefined}
      style={{ cursor: state === "disabled" ? "not-allowed" : "pointer" }}
    >
      {type === "back" ? "<" : ">"}
    </div>
  );
};

PaginationArrows.propTypes = {
  type: PropTypes.oneOf(["back", "next"]),
  state: PropTypes.oneOf(["disabled", "hover", "selected", "default"]),
  onClick: PropTypes.func,
};
