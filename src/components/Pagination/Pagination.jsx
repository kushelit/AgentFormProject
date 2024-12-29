/*
We're constantly improving the code you see. 
Please share your feedback here: https://form.asana.com/?k=uvp-HPgd3_hyoXRBw1IcNg&d=1152665201300829
*/

import React from "react";
import { PaginationArrows } from "../PaginationArrows";
import { PaginationNumbers } from "../PaginationNumbers";
import "./style.css";

export const Pagination = ({ className }) => {
  return (
    <div className={`pagination ${className}`}>
      <PaginationArrows
        className="pagination-arrows-instance"
        state="default"
        type="back"
      />
      <div className="div-wrapper">
        <div className="element-2">1</div>
      </div>

      <PaginationNumbers
        divClassName="pagination-numbers-instance"
        state="selected"
        text="2"
      />
      <div className="div-wrapper">
        <div className="element-3">3</div>
      </div>

      <div className="div-wrapper">
        <div className="element-3">4</div>
      </div>

      <div className="div-wrapper">
        <div className="element-4">...</div>
      </div>

      <div className="div-wrapper">
        <div className="text-wrapper-2">23</div>
      </div>

      <PaginationArrows
        className="pagination-arrows-instance"
        state="default"
        type="next"
      />
    </div>
  );
};
