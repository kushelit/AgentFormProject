/*
We're constantly improving the code you see. 
Please share your feedback here: https://form.asana.com/?k=uvp-HPgd3_hyoXRBw1IcNg&d=1152665201300829
*/

import PropTypes from "prop-types";
import React from "react";
import { Clear } from "../Clear";
import { Error } from "../Error";
import { Warning } from "../Warning";
import { Success } from "../Success";
import "./style.css";

export const ToastNotification = ({ type, className , message, onClose}) => {

  // console.log("Received props:", { type, className, message });

  return (
    <div
      className={`toast-notification ${className}`}
      data-03-components-colors-mode="light"
    >
      <div className="clear-wrapper"  onClick={onClose} style={{ cursor: "pointer" }}>
        <Clear className="clear-instance" clear="/static/img/clear-4.png" />
      </div>

      {/* {type === "success" && (
        <img className="frame-5" alt="Frame" src="/img/frame-25.svg" />
      )} */}

      {["error", "warning", "success"].includes(type) && (
        <div className="frame-6">
          <div className="text-2" data-03-components-colors-mode="light">
            <div className="frame-wrapper-3">
              <div className="frame-7">
                <div className={`div-7 type-1-${type} heading-small-bold`}>
                {type === "success" && <>הודעת הצלחה</>}
                  {type === "warning" && <>הודעת אזהרה</>}

                  {type === "error" && <>הודעת שגיאה</>}
                </div>
              </div>
            </div>

            <p className="text-wrapper-6 text-regular">
            {message}
            </p>
          </div>

          <div
            className="notification-icon"
            data-03-components-colors-mode="light"
          >
            {type === "success" && (
              <Success 
              className="instance-node-4" 
              success="/static/img/success-1.png" />
            )}
            {type === "warning" && (
              <Warning
                className="instance-node-4"
                warning="/static/img/warning-2.png"
              />
            )}

            {type === "error" && (
              <Error 
              className="instance-node-4" 
              error="/static/img/error-4.png" />
            )}
          </div>
        </div>
      )}

      <div className="line-wrapper">
        <img
          className="line-6"
          alt="Line"
          src={
            type === "warning"
              ? "/static/img/line-12-5.png"
              : type === "error"
                ? "/static/img/line-12-6.png"
                : "/static/img/line-12-4.png"
          }
        />
      </div>
    </div>
  );
};

ToastNotification.propTypes = {
  type: PropTypes.oneOf(["warning", "success", "error"]),
  className: PropTypes.string,
  message: PropTypes.string.isRequired, 
};
