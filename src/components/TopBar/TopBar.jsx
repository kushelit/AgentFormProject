'use client';

import PropTypes from "prop-types";
import React, { useEffect, useRef, useState } from "react";
import { ButtonTopbar } from "../ButtonTopbar";
import { Logo } from "../Logo";
import "./style.css";
import { useAuth } from "@/lib/firebase/AuthContext";
import Link from "next/link";
import { useRouter } from 'next/navigation';
import { UserSubscriptionPopup } from "@/components/UserSubscriptionPopup/UserSubscriptionPopup";

export const TopBar = ({ prop = true, className }) => {
  const { user, detail, logOut } = useAuth();
  const router = useRouter();
  const [showPopup, setShowPopup] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);


  const settingsRef = useRef(null);

useEffect(() => {
  const onDown = (e) => {
    if (!showSettingsMenu) return;
    const el = settingsRef.current;
    if (el && e.target && !el.contains(e.target)) {
      setShowSettingsMenu(false);
    }
  };

  document.addEventListener("mousedown", onDown);
  return () => document.removeEventListener("mousedown", onDown);
}, [showSettingsMenu]);

  

  return (
    <>
      <div className={`top-bar ${className}`}>
        <Link href="/NewAgentForm">
          <Logo className="logo-instance" />
        </Link>

        {prop && (
          <div className="frame">
            {user ? (
              <>
              <div ref={settingsRef} style={{ position: "relative" }}>
  <button
    className="help-button"
    onClick={() => setShowSettingsMenu((v) => !v)}
    title="הגדרות"
    style={{ marginRight: 8 }}
  >
    ⚙️
  </button>

  {showSettingsMenu && (
    <div
      style={{
        position: "absolute",
        top: "110%",
        right: 0,
        background: "#fff",
        border: "1px solid #e5e5e5",
        borderRadius: 10,
        padding: 8,
        minWidth: 200,
        zIndex: 9999,
        boxShadow: "0 8px 20px rgba(0,0,0,0.12)",
      }}
    >
      <button
        style={{
          width: "100%",
          textAlign: "right",
          background: "transparent",
          border: "none",
          padding: "10px 8px",
          cursor: "pointer",
        }}
        onClick={() => {
          setShowSettingsMenu(false);
          router.push("/Environments/portal-credentials");
        }}
      >
        🔐 חיבור לפורטלים
      </button>

      <button
        style={{
          width: "100%",
          textAlign: "right",
          background: "transparent",
          border: "none",
          padding: "10px 8px",
          cursor: "pointer",
          opacity: 0.6,
        }}
        onClick={() => setShowSettingsMenu(false)}
        disabled
      >
        👤 פרופיל סוכן (בקרוב)
      </button>
    </div>
  )}
</div>
                <button onClick={() => router.push('/Help')} className="help-button">
                  📖 עזרה
                </button>
                <img className="line" alt="Line" src="/static/img/line-2.png" />
                <span
                  className="user-name"
                  onClick={() => {
                    // console.log("detail", detail);
                    // console.log("grow fields", {
                    //   transactionToken: detail?.transactionToken,
                    //   transactionId: detail?.transactionId,
                    //   asmachta: detail?.asmachta,
                    // });
                    setShowPopup(true);
                  }}
                                    style={{ cursor: "pointer" }}
                >
                  {detail?.name}
                </span>
                <img className="line" alt="Line" src="/static/img/line-2.png" />
                <ButtonTopbar
                  className="design-component-instance-node"
                  state="default"
                  logOut={() => logOut().then(() => window.location.reload())}
                />
              </>
            ) : (
              <>
                {/* <Link href="/auth/sign-up/agent" className="user-name">הרשם</Link> */}
                <Link href="/auth/log-in" className="user-name">התחבר</Link>
              </>
            )}
          </div>
        )}
      </div>

      {/* הפופאפ מחוץ ל-top-bar */}
      {/* {user && showPopup && detail?.subscriptionId && detail?.role !== 'worker' && ( */}
      {user && showPopup && detail?.role !== 'worker' && (
    <UserSubscriptionPopup
    subscriptionStatus={detail?.subscriptionStatus}
    subscriptionType={detail?.subscriptionType}
    transactionId={detail?.transactionId}
    transactionToken={detail?.transactionToken}
    asmachta={detail?.asmachta}

    name={detail?.name}
    email={detail?.email}
    phone={detail?.phone}
    idNumber={detail?.idNumber}
    
    userId={user?.uid || ''}
  
    addOns={{
      leadsModule: detail?.addOns?.leadsModule || false,
      extraWorkers: detail?.addOns?.extraWorkers || 0
    }}
  
  
    onCancel={() => setShowPopup(false)}
    onClose={() => setShowPopup(false)}
  />
  
      )}
    </>
  );
};

TopBar.propTypes = {
  prop: PropTypes.bool,
};
