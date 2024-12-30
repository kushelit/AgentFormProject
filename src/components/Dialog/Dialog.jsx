/*
We're constantly improving the code you see. 
Please share your feedback here: https://form.asana.com/?k=uvp-HPgd3_hyoXRBw1IcNg&d=1152665201300829
*/

import PropTypes from "prop-types";
import React from "react";
import { Button } from "../Button";
import { Clear } from "../Clear";
import { DialogHeader } from "../DialogHeader";
import { Error } from "../Error";
import { Success } from "../Success";
import { Warning } from "../Warning";
import "./style.css";

export const Dialog = ({ type, className }) => {
  return (
    <div
      className={`dialog ${className}`}
      data-03-components-colors-mode="light"
    >
      {type === "info" && (
        <div
          className="dialog-main-content"
          data-03-components-colors-mode="light"
        >
          <div className="icon">
            <Clear className="instance-node-2" clear="/img/clear-4.png" />
          </div>

          <div className="div-4">
            <div className="div-wrapper-3">
              <div className="text-wrapper-5">כותרת</div>
            </div>

            <p className="p">
              טקסט לדוגמה טקסט לדוגמה טקסט לדוגמה טקסט לדוגמה
              <br />
              טקסט לדוגמה טקסט לדוגמה טקסט לדוגמה טקסט
              <br />
              טקסט לדוגמה טקסט לדוגמה
            </p>
          </div>
        </div>
      )}

      {["error", "success", "warning"].includes(type) && (
        <>
          <DialogHeader
            className="dialog-header-instance"
            type={
              type === "warning"
                ? "warning"
                : type === "error"
                  ? "error"
                  : "success"
            }
          />
          <div
            className="dialog-main-content-2"
            data-03-components-colors-mode="light"
          >
            <div className="div-5">
              <div className="frame-wrapper-2">
                <div className="frame-3">
                  <div className={`div-6 type-${type}`}>
                    {["error", "warning"].includes(type) && <>כותרת שגיאה</>}

                    {type === "success" && <>כותרת הצלחה</>}
                  </div>

                  {type === "success" && (
                    <Success
                      className="instance-node-2"
                      success="/img/success-1.png"
                    />
                  )}

                  {type === "warning" && (
                    <Warning
                      className="instance-node-3"
                      warning="/img/warning-2.png"
                    />
                  )}

                  {type === "error" && (
                    <Error
                      className="instance-node-3"
                      error="/img/error-4.png"
                    />
                  )}
                </div>
              </div>

              <p className="p">
                טקסט לדוגמה טקסט לדוגמה טקסט לדוגמה טקסט לדוגמה
                <br />
                טקסט לדוגמה טקסט לדוגמה טקסט לדוגמה טקסט
                <br />
                טקסט לדוגמה טקסט לדוגמה
              </p>
            </div>
          </div>
        </>
      )}

      <div className="dialog-footer" data-03-components-colors-mode="light">
        <div className="frame-4">
          <Button
            className="button-2"
            icon="off"
            state="default"
            text="כפתור"
            type="primary"
          />
          <Button
            className="button-2"
            icon="off"
            state="default"
            text="כפתור"
            type="secondary"
          />
        </div>

        <Button
          className="button-2"
          icon="off"
          state="default"
          text="כפתור"
          type="tertiary"
        />
      </div>
    </div>
  );
};

Dialog.propTypes = {
  type: PropTypes.oneOf(["warning", "success", "error", "info"]),
};
