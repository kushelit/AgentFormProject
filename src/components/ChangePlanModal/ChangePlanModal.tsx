'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useToast } from '@/hooks/useToast';
import { ToastNotification } from '@/components/ToastNotification';
import DialogNotification from '@/components/DialogNotification';

interface Plan {
  id: string;
  name: string;
  price: number;
  description: string;
}

interface ChangePlanModalProps {
  userId: string;
  transactionToken: string;
  transactionId: string;
  asmachta: string;
  currentPlan?: string;
  currentAddOns?: {
    leadsModule?: boolean;
    extraWorkers?: number;
  };
  onClose: () => void;
}

export const ChangePlanModal: React.FC<ChangePlanModalProps> = ({
  userId,
  transactionToken,
  transactionId,
  asmachta,
  currentPlan,
  currentAddOns,
  onClose,
}) => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(currentPlan || null);
  const [withLeadsModule, setWithLeadsModule] = useState(currentAddOns?.leadsModule ?? false);
  const [extraWorkers, setExtraWorkers] = useState(currentAddOns?.extraWorkers ?? 0);
  const [loading, setLoading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const { toasts, addToast, setToasts } = useToast();


  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const res = await axios.get('/api/subscription-plans');
        setPlans(res.data);

        if (currentPlan && res.data.find((plan: Plan) => plan.id === currentPlan)) {
          setSelectedPlan(currentPlan);
        } else if (res.data.length > 0) {
          setSelectedPlan(res.data[0].id);
        }
      } catch (err) {
        console.error('שגיאה בטעינת מסלולים', err);
      }
    };

    fetchPlans();
  }, [currentPlan]);

  useEffect(() => {
    if (selectedPlan !== 'pro') {
      setExtraWorkers(0);
    }
  }, [selectedPlan]);

  const calculateTotal = () => {
    const base = plans.find(p => p.id === selectedPlan)?.price || 0;
    const leadsPrice = withLeadsModule ? 29 : 0;
    const workersPrice = selectedPlan === 'pro' ? extraWorkers * 49 : 0;
    return base + leadsPrice + workersPrice;
  };

  const handleConfirmUpgrade = async () => {
    if (!selectedPlan || !transactionToken || !transactionId || !asmachta || !userId) return;
    setLoading(true);
    try {
      const res = await axios.post('/api/upgrade-plan', {
        id: userId,
        transactionToken,
        transactionId,
        asmachta,
        newPlanId: selectedPlan,
        addOns: {
          leadsModule: withLeadsModule,
          extraWorkers: selectedPlan === 'pro' ? extraWorkers : 0,
        },
      });

      if (res.data.success) {
        addToast('success', 'המנוי עודכן בהצלחה');
        setTimeout(() => {
          onClose();
          window.location.reload();
        }, 2000);
      } else {
        addToast('error', 'שגיאה בעדכון התוכנית');
      }
    } catch (err) {
      console.error('שגיאה בעת ניסיון לשדרג את התוכנית:', err);
      addToast('error', 'שגיאה בעדכון התוכנית');
    } finally {
      setLoading(false);
      setShowConfirmDialog(false);
    }
  };

  const selectedPlanName = plans.find(p => p.id === selectedPlan)?.name;

  if (!plans.length) {
    return <div className="p-6 text-center text-gray-500">⏳ טוען מסלולים...</div>;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full text-right p-6 overflow-y-auto max-h-[90vh]">
        <h2 className="text-2xl font-bold mb-6">שינוי תוכנית</h2>

        <div className="mb-6 bg-blue-50 border border-blue-200 p-3 rounded text-sm text-blue-800">
          <p className="font-semibold mb-1">מה יהיה כלול לאחר השינוי:</p>
          {selectedPlanName && <p>✔ תוכנית: {selectedPlanName}</p>}
          {/* {withLeadsModule && <p>✔ מודול לידים</p>} */}
          {selectedPlan === 'pro' && extraWorkers > 0 && <p>✔ {extraWorkers} עובדים נוספים</p>}
          {!withLeadsModule && (selectedPlan !== 'pro' || extraWorkers === 0) && <p>אין תוספים נוספים</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {plans.map((plan) => (
            <div
              key={plan.id}
              onClick={() => setSelectedPlan(plan.id)}
              className={`cursor-pointer rounded-lg border p-4 shadow-md transition hover:shadow-xl text-right ${
                selectedPlan === plan.id ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
              }`}
            >
              <h3 className="text-lg font-bold mb-2">{plan.name}</h3>
              <p className="text-sm text-gray-600 mb-3">{plan.description}</p>
              <p className="text-xl font-bold">₪{plan.price}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 space-y-2">
          {/* <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={withLeadsModule}
              onChange={(e) => setWithLeadsModule(e.target.checked)}
            />
            מודול לידים (₪29)
          </label> */}

          <label className={`flex items-center gap-2 ${selectedPlan !== 'pro' ? 'opacity-50' : ''}`}>
            עובדים נוספים (₪49 לעובד):
            <input
              type="number"
              value={extraWorkers}
              min={0}
              disabled={selectedPlan !== 'pro'}
              onChange={(e) => setExtraWorkers(Number(e.target.value))}
              className="w-20 border rounded px-2 py-1 text-right"
            />
          </label>
        </div>
        <p className="font-bold text-lg mt-4">סה&quot;כ לתשלום : ₪{calculateTotal()}</p>
        <div className="flex justify-end gap-4 mt-6">
          <button
            onClick={() => setShowConfirmDialog(true)}
            disabled={!selectedPlan || loading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
          >
            {loading ? 'טוען...' : 'החלף תוכנית'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 transition"
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

        {showConfirmDialog && (
          <DialogNotification
            type="warning"
            title="אישור שינוי תוכנית"
            message="האם את בטוחה שברצונך להחיל את שינוי התוכנית?"
            onConfirm={handleConfirmUpgrade}
            onCancel={() => setShowConfirmDialog(false)}
            confirmText="אישור"
            cancelText="ביטול"
          />
        )}
      </div>
    </div>
  );
};
