import PropTypes from "prop-types";
import React from "react";
import "./style.css";

export const ProgressBar = ({ percentage = 0, state, className }) => {
  return (
    <div className={`progress-bar state-${state} ${className}`}>
      <div
        className="indicator"
        style={{ width: `${percentage}%` }}
      ></div>

      {/* הצגת המלל "עמדת ביעד ✔" רק עבור אחוז עמידה (state === "complete") */}
      {state === "complete" && percentage >= 100 ? (
        <div className="status-text">עמדת ביעד ✔</div>
      ) : (
        // הצגת אחוזים עבור כל שאר המצבים
        <div className="progress-text">
{Math.round(percentage)}%
</div>
      )}
    </div>
  );
};

ProgressBar.propTypes = {
  percentage: PropTypes.number,
  state: PropTypes.oneOf([
    "low",
    "didn-t-start",
    "high",
    "complete",
    "time",
    "progress",
    "error",
  ]),
};