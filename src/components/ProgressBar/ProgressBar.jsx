
import PropTypes from "prop-types";
import React from "react";
import { Checkmark } from "../Checkmark";
import { ErrorWrapper } from "../ErrorWrapper";
import "./style.css";

export const ProgressBar = ({
  graff = true,
  prop = true,
  state,
  className,
}) => {
  return (
    <div className={`progress-bar state-${state} ${className}`}>
      {["high", "low", "progress", "time"].includes(state) && (
        <>
          <>{graff && <div className="indicator" />}</>
        </>
      )}

      {["didn-t-start", "high", "low", "progress", "time"].includes(state) && (
        <>
          <>
            {prop && (
              <div className="element-5">
                {state === "low" && <>15%</>}

                {["progress", "time"].includes(state) && <>40%</>}

                {state === "high" && <>95%</>}

                {state === "didn-t-start" && <>0%</>}
              </div>
            )}
          </>
        </>
      )}

      {["complete", "error"].includes(state) && (
        <div className="text-5">
          <div className="div-9">
            {state === "error" && <>שגיאה</>}

            {state === "complete" && <>עמדת ביעד</>}
          </div>

          {state === "complete" && (
            <Checkmark
              checkmark="/img/checkmark.png"
              className="instance-node-5"
            />
          )}

          {state === "error" && (
            <ErrorWrapper className="instance-node-5" error="/img/error.png" />
          )}
        </div>
      )}
    </div>
  );
};

ProgressBar.propTypes = {
  graff: PropTypes.bool,
  prop: PropTypes.bool,
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
