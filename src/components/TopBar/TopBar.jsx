"use client";

import PropTypes from "prop-types";
import React from "react";
import { ButtonTopbar } from "../ButtonTopbar";
import { Logo } from "../Logo";
import "./style.css";
import { useAuth } from "@/lib/firebase/AuthContext";
import Link from "next/link";

export const TopBar = ({ prop = true, className }) => {
  const { user, detail, logOut } = useAuth();

  return (
    <div className={`top-bar ${className}`}>
    <Link href="/">
          < Logo className="logo-instance" />
     </Link> {prop && (
        <div className="frame">
          {user ? (
            <>
              {/* שם המשתמש */}
              <span className="user-name">{detail?.name}</span>
              <img className="line" alt="Line" src="/static/img/line-2.png" />
              {/* כפתור יציאה */}
              <ButtonTopbar
                className="design-component-instance-node"
                state="default"
                logOut={() => {
                  logOut().then(() => window.location.reload())
                }}
              />
            </>
          ) : (
            <>
              {/* קישור התחברות */}
              <Link href="/auth/sign-up/agent" className="user-name">הרשם</Link>
              <Link href="/auth/log-in" className="user-name">התחבר</Link>
            </>
          )}
        </div>
      )}
    </div>
  );
};

TopBar.propTypes = {
  prop: PropTypes.bool,
};
