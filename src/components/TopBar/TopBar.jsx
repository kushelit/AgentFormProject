/*
We're constantly improving the code you see. 
Please share your feedback here: https://form.asana.com/?k=uvp-HPgd3_hyoXRBw1IcNg&d=1152665201300829
*/

import PropTypes from "prop-types";
import React from "react";
import { Button } from "../Button";
import { ButtonTopbar } from "../ButtonTopbar";
import { Logo } from "../Logo";
import "./style.css";

export const TopBar = ({ prop = true, className }) => {
  return (
    <div className={`top-bar ${className}`}>
     <Logo className="logo-instance" /> {/* לוגו בצד שמאל */}
      {prop && (
        <div className="frame">
          <ButtonTopbar
            className="design-component-instance-node"
            state="default"
          />
          <img className="line" alt="Line" src="/static/img/line-2.png" />
          <Button
            buttonClassName="button-instance"
            className="design-component-instance-node"
            icon="off"
            state="default"
            text="הראל כהן"
            type="tertiary"
          />
        </div>
      )}
      
    </div>
  );
};

TopBar.propTypes = {
  prop: PropTypes.bool,
};
