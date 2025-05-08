'use client';

import React from 'react';
import "./UserSubscriptionPopup.css";

interface UserSubscriptionPopupProps {
  name?: string;
  email?: string;
  phone?: string;
  subscriptionStatus?: string;
  transactionId?: string;
  transactionToken?: string;
  asmachta?: string;
  onCancel: () => void;
  onClose: () => void;
}

export const UserSubscriptionPopup: React.FC<UserSubscriptionPopupProps> = ({
  name,
  email,
  phone,
  subscriptionStatus,
  transactionId,
  transactionToken,
  asmachta,
  onCancel,
  onClose,
}) => {
  return (
    <div className="popup-overlay">
      <div className="subscription-popup">
        <button className="popup-close-button" onClick={onClose}>×</button>
        <h2>פרטי המנוי שלך</h2>
        <div className="info-row"><strong>שם:</strong> {name}</div>
        <div className="info-row"><strong>אימייל:</strong> {email}</div>
        <div className="info-row"><strong>טלפון:</strong> {phone}</div>
        <div className="info-row"><strong>סטטוס מנוי:</strong> {subscriptionStatus}</div>
        <div className="info-row"><strong>מספר עסקה:</strong> {transactionId || '-'}</div>
        <div className="info-row"><strong>אסמכתא:</strong> {asmachta || '-'}</div>
        <div className="buttons">
          <button className="cancel-button" onClick={onCancel}>בטל מנוי</button>
          <button className="closeButton" onClick={onClose}>סגור</button>
        </div>
      </div>
    </div>
  );
};
