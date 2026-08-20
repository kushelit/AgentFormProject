'use client';

import React, { useState } from 'react';
import { ChangePlanModal } from '../ChangePlanModal/ChangePlanModal';
import axios from 'axios';
import { ToastNotification } from '@/components/ToastNotification';
import { useToast } from '@/hooks/useToast';
import { useAuth } from '@/lib/firebase/AuthContext';
import { useRouter } from 'next/navigation';
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

  const [isUpdatingCard, setIsUpdatingCard] = useState(false);

  const { user, logOut } = useAuth();
  const router = useRouter();

  const { toasts, addToast, setToasts } = useToast();

  const displayName =
    name ??
    (user as any)?.name ??
    user?.displayName ??
    '-';

  const displayEmail =
    email ??
    user?.email ??
    '-';

  const displayPhone =
    phone ??
    (user as any)?.phone ??
    (user as any)?.phoneNumber ??
    '-';

  const displayIdNum =
    idNumber ??
    (user as any)?.idNumber;

  const currentSubscriptionType =
    subscriptionType ??
    (user as any)?.subscriptionType ??
    '';

  const currentSubscriptionStatus =
    subscriptionStatus ??
    (user as any)?.subscriptionStatus ??
    '';

  const currentTransactionId =
    transactionId ??
    (user as any)?.transactionId ??
    '';

  const currentAsmachta =
    asmachta ??
    (user as any)?.asmachta ??
    '';

  const planNames: Record<string, string> = {
    basic: 'מנוי בסיסי',
    pro: 'מנוי מקצועי',
    enterprise: 'Enterprise',
  };

  const statusLabels: Record<string, string> = {
    active: 'פעיל',
    canceled: 'מבוטל',
    failed: 'תקלה בחיוב',
    pending: 'ממתין',
  };

  const isActive =
    currentSubscriptionStatus === 'active';

  const renderInfoRow = (
    label: string,
    value?: string | null
  ) => (
    <div className="flex items-center justify-between gap-6 py-2.5">
      <span className="text-gray-500">
        {label}
      </span>

      <span className="font-medium text-gray-900 text-left">
        {value || '-'}
      </span>
    </div>
  );

  // =====================================================
  // החלפת כרטיס
  // =====================================================

  const handleUpdatePaymentMethod = async () => {
    if (!user) {
      addToast(
        'error',
        'לא ניתן לזהות את המשתמש המחובר.'
      );
      return;
    }

    setIsUpdatingCard(true);

    // פותחים את החלון מיד כחלק מה-click כדי להימנע מחסימת popup.
    const growWindow = window.open('', '_blank');

    // מציגים מסך המתנה במקום about:blank עד שה-API מחזיר URL של GROW.
    if (growWindow) {
      growWindow.document.open();
      growWindow.document.write(`
        <!doctype html>
        <html lang="he" dir="rtl">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>עדכון אמצעי תשלום</title>
            <style>
              * {
                box-sizing: border-box;
              }

              body {
                margin: 0;
                min-height: 100vh;
                font-family: Arial, sans-serif;
                background: #f8fafc;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #0f172a;
              }

              .box {
                width: calc(100% - 40px);
                max-width: 430px;
                background: #ffffff;
                padding: 42px 32px;
                border-radius: 18px;
                text-align: center;
                box-shadow: 0 12px 35px rgba(15, 23, 42, 0.10);
                border: 1px solid #e2e8f0;
              }

              .spinner {
                width: 42px;
                height: 42px;
                margin: 0 auto 24px;
                border: 4px solid #e2e8f0;
                border-top-color: #4f46e5;
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
              }

              .title {
                font-size: 19px;
                font-weight: 700;
                margin-bottom: 10px;
              }

              .subtitle {
                color: #64748b;
                font-size: 14px;
                line-height: 1.6;
              }

              @keyframes spin {
                to {
                  transform: rotate(360deg);
                }
              }
            </style>
          </head>

          <body>
            <div class="box">
              <div class="spinner"></div>

              <div class="title">
                מעבירים אותך בצורה מאובטחת ל-GROW
              </div>

              <div class="subtitle">
                מסך עדכון כרטיס האשראי ייפתח בעוד מספר רגעים
              </div>
            </div>
          </body>
        </html>
      `);
      growWindow.document.close();
    }

    try {
      const idToken = await user.getIdToken();

      const res = await axios.post(
        '/api/updatePaymentMethod',
        {},
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        }
      );

      const updateCardUrl = res.data?.updateCardUrl;

      if (!updateCardUrl) {
        growWindow?.close();

        addToast(
          'error',
          'לא התקבל קישור לעדכון כרטיס.'
        );

        return;
      }

      // מעבירים את החלון שכבר נפתח ל-GROW.
      if (growWindow && !growWindow.closed) {
        growWindow.location.href = updateCardUrl;
        growWindow.focus();
      } else {
        // fallback אם הדפדפן חסם/סגר את החלון.
        window.location.href = updateCardUrl;
      }

      addToast(
        'success',
        'נפתח עבורך מסך מאובטח של GROW להחלפת כרטיס האשראי. יש להשלים את העדכון בחלון שנפתח.'
      );
    } catch (err: any) {
      growWindow?.close();

      const message =
        err?.response?.data?.error ||
        'לא ניתן לפתוח כרגע את מסך החלפת הכרטיס.';

      addToast(
        'error',
        message
      );
    } finally {
      setIsUpdatingCard(false);
    }
  };

  // =====================================================
  // ביטול מנוי
  // =====================================================

  const handleCancelSubscription = async () => {
    if (
      !userId ||
      !transactionToken ||
      !transactionId ||
      !asmachta
    ) {
      addToast(
        'error',
        'חסרים נתוני עסקה – לא ניתן לבטל כרגע.'
      );
      return;
    }

    setIsCancelling(true);

    try {
      const res = await axios.post(
        '/api/cancelSubscription',
        {
          id: userId,
          transactionToken,
          transactionId,
          asmachta,
          sendCancelEmail: true,
        }
      );

      if (res.data.success) {
        addToast(
          'success',
          res.data.message ||
            'המנוי בוטל בהצלחה. חשבונך הושהה.'
        );

        await new Promise((r) =>
          setTimeout(r, 3000)
        );

        await logOut();

        onCancel?.();
        onClose?.();

        router.refresh();
      } else {
        addToast(
          'error',
          res.data.message ||
            'שגיאה בביטול המנוי'
        );
      }
    } catch {
      addToast(
        'error',
        'שגיאה בביטול המנוי'
      );
    } finally {
      setIsCancelling(false);
      setShowCancelDialog(false);
    }
  };

  return (
    <div
      className="
        fixed inset-0 z-50
        flex items-center justify-center
        bg-black/40
        backdrop-blur-[2px]
        p-4
      "
      dir="rtl"
    >
      <div
        className="
          relative
          w-full max-w-2xl
          overflow-hidden
          rounded-2xl
          bg-white
          shadow-2xl
        "
      >
        {/* Header */}
        <div
          className="
            border-b
            bg-gradient-to-l
            from-blue-50
            via-white
            to-white
            px-7 py-6
          "
        >
          <button
            type="button"
            onClick={onClose}
            className="
              absolute left-5 top-5
              flex h-9 w-9
              items-center justify-center
              rounded-full
              text-xl text-gray-400
              transition
              hover:bg-gray-100
              hover:text-gray-700
            "
          >
            ×
          </button>

          <div className="flex items-start justify-between gap-4 pl-12">

            <div>
              <div className="mb-1 text-sm font-medium text-blue-600">
                ניהול חשבון
              </div>

              <h2 className="text-2xl font-bold text-gray-900">
                המנוי שלך
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                ניהול המסלול, אמצעי התשלום ופרטי המנוי
              </p>
            </div>

            <span
              className={`
                mt-1
                inline-flex items-center
                rounded-full
                px-3 py-1
                text-sm font-semibold
                ${
                  isActive
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-600'
                }
              `}
            >
              <span
                className={`
                  ml-2
                  h-2 w-2
                  rounded-full
                  ${
                    isActive
                      ? 'bg-green-500'
                      : 'bg-gray-400'
                  }
                `}
              />

              {statusLabels[currentSubscriptionStatus] ||
                currentSubscriptionStatus ||
                'לא ידוע'}
            </span>
          </div>
        </div>

        <div className="space-y-5 p-7">

          {/* Current plan */}
          <div
            className="
              flex items-center justify-between
              rounded-xl
              border border-blue-100
              bg-blue-50/60
              px-5 py-4
            "
          >
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-blue-500">
                המסלול הנוכחי
              </div>

              <div className="mt-1 text-xl font-bold text-blue-900">
                {planNames[currentSubscriptionType] ||
                  currentSubscriptionType ||
                  '-'}
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                setShowChangeModal(true)
              }
              className="
                rounded-lg
                border border-blue-200
                bg-white
                px-4 py-2
                text-sm font-semibold
                text-blue-700
                shadow-sm
                transition
                hover:border-blue-300
                hover:bg-blue-50
              "
            >
              שינוי מסלול
            </button>
          </div>

          {/* Account details */}
          <div className="rounded-xl border border-gray-200 px-5 py-3">
            <div className="border-b py-3">
              <h3 className="font-bold text-gray-900">
                פרטי החשבון
              </h3>
            </div>

            <div className="divide-y">
              {renderInfoRow(
                'שם',
                displayName
              )}

              {renderInfoRow(
                'אימייל',
                displayEmail
              )}

              {renderInfoRow(
                'טלפון',
                displayPhone
              )}
            </div>
          </div>

          {/* Billing */}
          <div className="rounded-xl border border-gray-200 px-5 py-3">
            <div className="flex items-center justify-between border-b py-3">

              <div>
                <h3 className="font-bold text-gray-900">
                  חיוב ואמצעי תשלום
                </h3>

                <p className="mt-0.5 text-xs text-gray-500">
                  אמצעי התשלום מנוהל באופן מאובטח באמצעות GROW
                </p>
              </div>

          <div className="text-left">
  <button
    type="button"
    disabled={
      isUpdatingCard ||
      !isActive
    }
    onClick={
      handleUpdatePaymentMethod
    }
    className="
      rounded-lg
      bg-indigo-600
      px-4 py-2
      text-sm font-semibold
      text-white
      shadow-sm
      transition
      hover:bg-indigo-700
      disabled:cursor-not-allowed
      disabled:opacity-50
    "
  >
    {isUpdatingCard
      ? 'פותח GROW...'
      : 'החלפת כרטיס אשראי'}
  </button>

  <div className="mt-1 text-[11px] text-gray-400">
    העדכון מתבצע באתר המאובטח של GROW
  </div>
</div>            </div>

            <div className="divide-y">
              {renderInfoRow(
                'מספר עסקה',
                currentTransactionId
              )}

              {renderInfoRow(
                'אסמכתא',
                currentAsmachta
              )}
            </div>
          </div>

          {/* Danger zone */}
          <div
            className="
              flex items-center justify-between
              rounded-xl
              border border-red-100
              bg-red-50/50
              px-5 py-4
            "
          >
            <div>
              <div className="font-semibold text-gray-900">
                ביטול המנוי
              </div>

              <div className="mt-1 text-xs text-gray-500">
                הביטול יפסיק את המנוי ויחסום את הגישה למערכת
              </div>
            </div>

            <button
              type="button"
              className="
                rounded-lg
                border border-red-200
                bg-white
                px-4 py-2
                text-sm font-semibold
                text-red-600
                transition
                hover:bg-red-50
                disabled:opacity-50
              "
              onClick={() =>
                setShowCancelDialog(true)
              }
              disabled={isCancelling}
            >
              {isCancelling
                ? 'מבטל...'
                : 'ביטול מנוי'}
            </button>
          </div>

          <div className="flex justify-start">
            <button
              type="button"
              onClick={onClose}
              className="
                rounded-lg
                bg-gray-100
                px-5 py-2
                text-sm font-medium
                text-gray-700
                transition
                hover:bg-gray-200
              "
            >
              סגור
            </button>
          </div>
        </div>

        {/* Toasts */}
        {toasts.map((toast) => (
          <ToastNotification
            key={toast.id}
            type={toast.type}
            className={
              toast.isHiding
                ? 'hide'
                : ''
            }
            message={toast.message}
            onClose={() =>
              setToasts((prev) =>
                prev.filter(
                  (t) =>
                    t.id !== toast.id
                )
              )
            }
          />
        ))}

        {/* Change Plan */}
        {showChangeModal && (
          <ChangePlanModal
            userId={userId}
            transactionId={
              transactionId ||
              (user as any)
                ?.transactionId ||
              ''
            }
            transactionToken={
              transactionToken ||
              (user as any)
                ?.transactionToken ||
              ''
            }
            asmachta={
              asmachta ||
              (user as any)?.asmachta ||
              ''
            }
            currentPlan={
              currentSubscriptionType
            }
            currentAddOns={
              addOns ||
              (user as any)?.addOns
            }
            prefill={{
              name: displayName,
              email: displayEmail,
              phone: displayPhone,
              idNumber: displayIdNum,
            }}
            onClose={() =>
              setShowChangeModal(false)
            }
          />
        )}

        {/* Cancel confirmation */}
        {showCancelDialog && (
          <DialogNotification
            type="warning"
            title="אישור ביטול מנוי"
            message="האם אתה בטוח שברצונך לבטל את המנוי? פעולה זו תנתק אותך ותסיים את ההרשאות."
            onConfirm={() => {
              if (isCancelling) return;

              handleCancelSubscription();
            }}
            onCancel={() => {
              if (isCancelling) return;

              setShowCancelDialog(false);
            }}
            confirmText={
              isCancelling
                ? 'מבטל מנוי...'
                : 'כן, בטל מנוי'
            }
            cancelText="חזרה"
          />
        )}
      </div>
    </div>
  );
};