'use client';

import React, { useState } from 'react';
import { ChangePlanModal } from '../ChangePlanModal/ChangePlanModal';
import "./UserSubscriptionPopup.css";

interface UserSubscriptionPopupProps {
  name?: string;
  email?: string;
  phone?: string;
  subscriptionStatus?: string;
  subscriptionType?: string;
  transactionId?: string;
  transactionToken?: string;
  asmachta?: string;
  onCancel: () => void;
  onClose: () => void;
  userId: string;
}

export const UserSubscriptionPopup: React.FC<UserSubscriptionPopupProps> = ({
  name,
  email,
  phone,
  subscriptionStatus,
  subscriptionType,
  transactionId,
  transactionToken,
  asmachta,
  onCancel,
  onClose,
  userId,
}) => {
  const [showChangeModal, setShowChangeModal] = useState(false);

  const renderInfoRow = (label: string, value?: string | null) => (
    <div className="info-row">
      <span className="label">{label}:</span>
      <span className="value">{value || '-'}</span>
    </div>
  );

  return (
    <div className="popup-overlay">
      <div className="subscription-popup">
        <button className="popup-close-button" onClick={onClose}>×</button>
        <h2 className="popup-title">פרטי המנוי שלך</h2>

        {renderInfoRow('שם', name)}
        {renderInfoRow('אימייל', email)}
        {renderInfoRow('טלפון', phone)}
        {renderInfoRow('סטטוס מנוי', subscriptionStatus)}
        {renderInfoRow('מסלול נוכחי', subscriptionType)}
        {renderInfoRow('מספר עסקה', transactionId)}
        {renderInfoRow('אסמכתא', asmachta)}

        <div className="buttons">
          <button className="cancel-button" onClick={onCancel}>בטל מנוי</button>
          <button className="upgrade-button" onClick={() => setShowChangeModal(true)}>שנה תוכנית</button>
          <button className="closeButton" onClick={onClose}>סגור</button>
        </div>
      </div>

      {showChangeModal && (
        <ChangePlanModal
          userId={userId}
          transactionId={transactionId || ''}
          transactionToken={transactionToken || ''}
          asmachta={asmachta || ''}
          currentPlan={subscriptionType || ''}
          onClose={() => setShowChangeModal(false)}
        />
      )}
    </div>
  );
};
