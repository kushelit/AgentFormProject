'use client';

import PropTypes from "prop-types";
import React, { useState } from "react";
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
                <button onClick={() => router.push('/Help')} className="help-button">
                  📖 עזרה
                </button>
                <img className="line" alt="Line" src="/static/img/line-2.png" />
                <span
                  className="user-name"
                  onClick={() => setShowPopup(true)}
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
                <Link href="/auth/sign-up/agent" className="user-name">הרשם</Link>
                <Link href="/auth/log-in" className="user-name">התחבר</Link>
              </>
            )}
          </div>
        )}
      </div>

      {/* הפופאפ מחוץ ל-top-bar */}
      {user && showPopup && detail?.subscriptionId && (
     <UserSubscriptionPopup
     name={detail?.name}
     email={detail?.email}
     phone={detail?.phone}
     subscriptionStatus={detail?.subscriptionStatus}
     subscriptionType={detail?.subscriptionType}
     transactionId={detail?.transactionId}
     transactionToken={detail?.transactionToken}
     asmachta={detail?.asmachta}
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
