'use client';

import React, { useState } from 'react';
import { ChangePlanModal } from '../ChangePlanModal/ChangePlanModal';
import axios from 'axios';
import { ToastNotification } from '@/components/ToastNotification';
import { useToast } from "@/hooks/useToast";
import { useAuth } from "@/lib/firebase/AuthContext";
import { useRouter } from "next/navigation";
import DialogNotification from '@/components/DialogNotification';

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
  addOns?: {
    leadsModule?: boolean;
    extraWorkers?: number;
  };
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
  addOns,
}) => {
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const { logOut } = useAuth();
  const router = useRouter();
  const { toasts, addToast, setToasts } = useToast();

  const planNames: { [key: string]: string } = {
    basic: 'מנוי בסיסי',
    pro: 'מנוי מקצועי',
  };

  const renderInfoRow = (label: string, value?: string | null) => (
    <div className="flex justify-between border-b py-1">
      <span className="font-semibold text-gray-600">{label}:</span>
      <span className="text-gray-800">{value || '-'}</span>
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
        await logOut();
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
      setShowCancelDialog(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-xl w-full p-6 text-right relative">
        <button
          className="absolute top-3 left-3 text-gray-500 hover:text-black text-2xl font-bold"
          onClick={onClose}
        >
          ×
        </button>

        <h2 className="text-2xl font-bold mb-6 text-blue-800">פרטי המנוי שלך</h2>

        <div className="space-y-3 text-sm">
          {renderInfoRow('שם', name)}
          {renderInfoRow('אימייל', email)}
          {renderInfoRow('טלפון', phone)}
          {renderInfoRow('סטטוס מנוי', subscriptionStatus)}
          {renderInfoRow('מסלול נוכחי', planNames[subscriptionType ?? ''] || '-')}
          {renderInfoRow('מספר עסקה', transactionId)}
          {renderInfoRow('אסמכתא', asmachta)}
        </div>

        <div className="flex justify-end mt-6 gap-3">
          <button
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition"
            onClick={() => setShowCancelDialog(true)}
            disabled={isCancelling}
          >
            {isCancelling ? 'מבטל...' : 'בטל מנוי'}
          </button>

          <button
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
            onClick={() => setShowChangeModal(true)}
          >
            שנה תוכנית
          </button>

          <button
            className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300 transition"
            onClick={onClose}
          >
            סגור
          </button>
        </div>

        {toasts.length > 0 &&
          toasts.map((toast) => (
            <ToastNotification
              key={toast.id}
              type={toast.type}
              className={toast.isHiding ? 'hide' : ''}
              message={toast.message}
              onClose={() =>
                setToasts((prevToasts) => prevToasts.filter((t) => t.id !== toast.id))
              }
            />
          ))}

        {showChangeModal && (
          <ChangePlanModal
            userId={userId}
            transactionId={transactionId || ''}
            transactionToken={transactionToken || ''}
            asmachta={asmachta || ''}
            currentPlan={subscriptionType || ''}
            currentAddOns={addOns}
            onClose={() => setShowChangeModal(false)}
          />
        )}

        {showCancelDialog && (
          <DialogNotification
            type="warning"
            title="אישור ביטול מנוי"
            message="האם את בטוחה שברצונך לבטל את המנוי? פעולה זו תנתק אותך ותסיים את ההרשאות."
            onConfirm={handleCancelSubscription}
            onCancel={() => setShowCancelDialog(false)}
            confirmText="כן, בטל מנוי"
            cancelText="חזרה"
          />
        )}
      </div>
    </div>
  );
};
