'use client';

import PropTypes from "prop-types";
import React, { useEffect, useRef, useState } from "react";
import { ButtonTopbar } from "../ButtonTopbar";
import { Logo } from "../Logo";
import "./style.css";
import { useAuth } from "@/lib/firebase/AuthContext";
import { usePermission } from "@/hooks/usePermission";
import Link from "next/link";
import { useRouter } from 'next/navigation';
import { UserSubscriptionPopup } from "@/components/UserSubscriptionPopup/UserSubscriptionPopup";
import CustomerSearchBox from "@/components/CustomerSearch/CustomerSearchBox";
import ContactFormModal from "@/components/ContactFormModal/ContactFormModal";

export const TopBar = ({ prop = true, className }) => {
  const { user, detail, logOut, isLoading } = useAuth();
  const router = useRouter();
  const { canAccess: canAccessCrm } = usePermission(user ? 'access_crm_module' : null);
  const [showPopup, setShowPopup] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [isContactOpen, setIsContactOpen] = useState(false);


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
        <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
        <Link
  href={
    isLoading
      ? '#'
      : user
        ? '/NewAgentForm'
        : '/auth/log-in'
  }
  onClick={(e) => {
    if (isLoading) {
      e.preventDefault();
    }
  }}
>
  <Logo className="logo-instance" />
</Link>
          {prop && user && canAccessCrm && (
            <CustomerSearchBox agentId={detail?.agentId} />
          )}
        </div>

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
  }}
  onClick={() => {
    setShowSettingsMenu(false);
    router.push("/Environments/company-preferences");
  }}
>
  🏢 בחירת חברות
</button>
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
          router.push("/Environments/product-preferences");
        }}
      >
        📦 בחירת מוצרים
      </button>
    </div>
  )}
</div>
                <button onClick={() => router.push('/Help')} className="help-button">
                  📖 עזרה
                </button>
                <button
                  onClick={() => setIsContactOpen(true)}
                  className="help-button"
                  title="צור קשר"
                >
                  📩 צור קשר
                </button>
                <img className="line" alt="Line" src="/static/img/line-2.png" />
                <span
                  className="user-name"
                  onClick={() => {
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
logOut={async () => {
  await logOut();
  window.location.replace('/auth/log-in');
}}                />
              </>
            ) : (
              <>
                <Link href="/auth/log-in" className="user-name">התחבר</Link>
              </>
            )}
          </div>
        )}
      </div>

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

      {isContactOpen && (
        <ContactFormModal
          onClose={() => setIsContactOpen(false)}
          userEmail={detail?.email || ""}
          userName={detail?.name || "משתמש אנונימי"}
        />
      )}
    </>
  );
};

TopBar.propTypes = {
  prop: PropTypes.bool,
};
