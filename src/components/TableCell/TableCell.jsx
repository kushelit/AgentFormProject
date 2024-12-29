/*
We're constantly improving the code you see. 
Please share your feedback here: https://form.asana.com/?k=uvp-HPgd3_hyoXRBw1IcNg&d=1152665201300829
*/

import PropTypes from "prop-types";
import React from "react";
import { Collapse7 } from "../../assets/icons/Collapse7";
import { DatePicker1 } from "../../assets/icons/DatePicker1";
import { Link2 } from "../../assets/icons/Link2";
import { Checkbox } from "../Checkbox";
import { Menu } from "../Menu";
import "./style.css";

export const TableCell = ({ type, state, link, className }) => {
  return (
    <div className={`table-cell ${state} type-${type} ${link} ${className}`}>
      {(link === "bottom" ||
        (link === "empty" && state === "default") ||
        (link === "empty" && state === "hover") ||
        (link === "empty" && state === "selected") ||
        link === "middle" ||
        type === "date-picker" ||
        type === "drop-down" ||
        type === "text") && (
        <div className="div">
          {((state === "default" && type === "drop-down") ||
            (state === "default" && type === "text") ||
            (state === "hover" && type === "drop-down") ||
            (state === "hover" && type === "text") ||
            (state === "selected" && type === "drop-down") ||
            (state === "selected" && type === "text") ||
            state === "summary") && <>טקסט</>}

          {type === "date-picker" &&
            ["default", "hover", "selected"].includes(state) && <>##/##/####</>}

          {(link === "bottom" ||
            state === "disabled" ||
            state === "hover-field" ||
            (link === "default" && state === "edit")) && (
            <div className="rectangle">
              {(type === "text" ||
                (state === "disabled" && type === "date-picker") ||
                (state === "disabled" && type === "drop-down")) && (
                <div className="label">
                  {type === "text" && <>טקסט</>}

                  {type === "drop-down" && (
                    <div className="text-wrapper">בחירה ב</div>
                  )}

                  {type === "date-picker" && <>##/##/####</>}
                </div>
              )}

              {type === "drop-down" &&
                ["edit", "hover-field"].includes(state) && (
                  <>
                    <Collapse7 className="collapse" color="#696969" />
                    <div className="label-wrapper">
                      <div className="text-wrapper">בחירה ב</div>
                    </div>
                  </>
                )}

              {type === "date-picker" &&
                ["edit", "hover-field"].includes(state) && (
                  <>
                    <DatePicker1 className="date-picker-1" color="#696969" />
                    <div className="label-2">##/##/####</div>
                  </>
                )}
            </div>
          )}

          {link === "middle" && (
            <>
              <img className="line" alt="Line" src="/img/line-7-5.svg" />

              <img className="img" alt="Line" src="/img/line-8-5.svg" />
            </>
          )}
        </div>
      )}

      {type === "action-icons" && (
        <Menu
          state={
            state === "disabled"
              ? "disabled"
              : state === "hover-field"
                ? "hover"
                : "default"
          }
        />
      )}

      {type === "checkbox" && (
        <Checkbox
          active="off"
          state={
            state === "hover-field"
              ? "hover"
              : state === "disabled"
                ? "disabled"
                : "default"
          }
          stateDefaultActiveClassName="checkbox-instance"
        />
      )}

      {link === "parent" && (
        <>
          <div className="frame-wrapper">
            <div className="rectangle-wrapper">
              <div className="rectangle-2" />
            </div>
          </div>

          <div className="ellipse" />

          <Link2 className="link-2" />
        </>
      )}
    </div>
  );
};

TableCell.propTypes = {
  type: PropTypes.oneOf([
    "checkbox",
    "date-picker",
    "action-icons",
    "link",
    "drop-down",
    "text",
  ]),
  state: PropTypes.oneOf([
    "default",
    "selected",
    "edit",
    "hover",
    "hover-field",
    "summary",
    "disabled",
  ]),
  link: PropTypes.oneOf(["default", "parent", "empty", "bottom", "middle"]),
};
