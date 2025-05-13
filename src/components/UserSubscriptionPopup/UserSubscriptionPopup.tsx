'use client';

import React, { useState } from 'react';
import { ChangePlanModal } from '../ChangePlanModal/ChangePlanModal';
import './UserSubscriptionPopup.css';
import axios from 'axios';
import {ToastNotification} from '@/components/ToastNotification';
import { useToast } from "@/hooks/useToast";
import { useAuth } from "@/lib/firebase/AuthContext";
import { useRouter } from "next/navigation";


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
  const [isCancelling, setIsCancelling] = useState(false);

  const { logOut } = useAuth();
  const router = useRouter();
  

  const renderInfoRow = (label: string, value?: string | null) => (
    <div className="info-row">
      <span className="label">{label}:</span>
      <span className="value">{value || '-'}</span>
    </div>
  );

  const handleCancelSubscription = async () => {
    if (!userId || !transactionToken || !transactionId || !asmachta) return;
    setIsCancelling(true);

    try {
      const res = await axios.post('/api/cancelSubscription', {
        id: userId,
        transactionToken,
        transactionId,
        asmachta,
        sendCancelEmail: true,
      });

      if (res.data.success) {
        addToast("success", "המנוי בוטל בהצלחה");
        await logOut(); // 🚪 התנתקות
        onCancel();
        onClose();
        router.refresh();
      } else {
        addToast("error", "שגיאה בביטול המנוי");

      }
    } catch (err) {
      console.error('שגיאה בביטול:', err);
      addToast("error", "שגיאה בביטול המנוי");
    } finally {
      setIsCancelling(false);
    }
  };

  const { toasts, addToast, setToasts } = useToast();

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
          <button
            className="cancel-button"
            onClick={handleCancelSubscription}
            disabled={isCancelling}
          >
            {isCancelling ? 'מבטל...' : 'בטל מנוי'}
          </button>
          <button
            className="upgrade-button"
            onClick={() => {
              console.log('✅ נלחץ כפתור שינוי תוכנית');
              setShowChangeModal(true);
            }}
          >
            שנה תוכנית
          </button>
          <button className="closeButton" onClick={onClose}>סגור</button>
        </div>
        {toasts.length > 0  && toasts.map((toast) => (
  <ToastNotification 
    key={toast.id}  
    type={toast.type}
    className={toast.isHiding ? "hide" : ""} 
    message={toast.message}
    onClose={() => setToasts((prevToasts) => prevToasts.filter((t) => t.id !== toast.id))}
  />
))}
      </div>

      {showChangeModal && (
        <ChangePlanModal
          userId={userId}
          transactionId={transactionId || ''}
          transactionToken={transactionToken || ''}
          asmachta={asmachta || ''}
          currentPlan={subscriptionType || ''}
          onClose={() => {
            console.log('🔒 נסגר מודל שינוי תוכנית');
            setShowChangeModal(false);
          }}
        />
      )}
    </div>
  );
};
