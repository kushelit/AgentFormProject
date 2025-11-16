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
  // מומלץ להוסיף אם יש לך ת"ז ב-DB ורוצה להעביר הלאה ל-ChangePlanModal
  idNumber?: string;
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
  idNumber,
}) => {
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const { user, logOut } = useAuth(); // ← נביא גם את user כדי להשתמש כפולבק
  const router = useRouter();
  const { toasts, addToast, setToasts } = useToast();

  // Fallbacks לתצוגה במקרה שההורה לא העביר props
  const displayName  = name  ?? (user as any)?.name ?? user?.displayName ?? '-';
  const displayEmail = email ?? user?.email ?? '-';
  const displayPhone = phone ?? (user as any)?.phone ?? (user as any)?.phoneNumber ?? '-';
  const displayIdNum = idNumber ?? (user as any)?.idNumber; // לא חובה לתצוגה, כן מועיל כ-prefill

  const planNames: { [key: string]: string } = {
    basic: 'מנוי בסיסי',
    pro: 'מנוי מקצועי',
    enterprise: 'Enterprise', // ליתר בטחון
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
        addToast("success", res.data.message || "✅ המנוי בוטל בהצלחה. חשבונך הושהה.");
        await new Promise(r => setTimeout(r, 3000));
        await logOut();
        onCancel?.();
        onClose?.();
        router.refresh();
      } else {
        addToast("error", res.data.message || "שגיאה בביטול המנוי");
      }
    } catch (err) {
      // console.error('שגיאה בביטול:', err);
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
          {renderInfoRow('שם', displayName)}
          {renderInfoRow('אימייל', displayEmail)}
          {renderInfoRow('טלפון', displayPhone)}
          {renderInfoRow('סטטוס מנוי', subscriptionStatus ?? (user as any)?.subscriptionStatus)}
          {renderInfoRow('מסלול נוכחי', planNames[subscriptionType ?? (user as any)?.subscriptionType ?? ''] || '-')}
          {renderInfoRow('מספר עסקה', transactionId ?? (user as any)?.transactionId)}
          {renderInfoRow('אסמכתא', asmachta ?? (user as any)?.asmachta)}
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

        {toasts.map((toast) => (
          <ToastNotification
            key={toast.id}
            type={toast.type}
            className={toast.isHiding ? 'hide' : ''}
            message={toast.message}
            onClose={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
          />
        ))}

        {showChangeModal && (
          <ChangePlanModal
            userId={userId}
            transactionId={transactionId || (user as any)?.transactionId || ''}
            transactionToken={transactionToken || (user as any)?.transactionToken || ''}
            asmachta={asmachta || (user as any)?.asmachta || ''}
            currentPlan={subscriptionType || (user as any)?.subscriptionType || ''}
            currentAddOns={addOns || (user as any)?.addOns}
            prefill={{
              name: displayName,
              email: displayEmail,
              phone: displayPhone,
              idNumber: displayIdNum,
            }}
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
