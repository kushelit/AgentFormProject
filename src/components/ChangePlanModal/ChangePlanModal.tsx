'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {ToastNotification} from '@/components/ToastNotification';
import { useToast } from "@/hooks/useToast";

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
  onClose: () => void;
}

export const ChangePlanModal: React.FC<ChangePlanModalProps> = ({
  userId,
  transactionToken,
  transactionId,
  asmachta,
  currentPlan,
  onClose,
}) => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { toasts, addToast, setToasts } = useToast();

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const res = await axios.get('/api/subscription-plans');
        setPlans(res.data);
      } catch (err) {
        console.error('שגיאה בטעינת מסלולים', err);
      }
    };
    fetchPlans();
  }, []);

  const handleUpgrade = async () => {
    if (!selectedPlan || !transactionToken || !transactionId || !asmachta || !userId) return;
    setLoading(true);

    try {
      const res = await axios.post('/api/upgrade-plan', {
        id: userId,
        transactionToken,
        transactionId,
        asmachta,
        newPlanId: selectedPlan,
      });

      if (res.data.success) {
        addToast("success", "המנוי עודכן בהצלחה");
        onClose();
        window.location.reload();
      } else {
        addToast("error", "שגיאה בעדכון התוכנית");
      }
    } catch (err) {
      console.error('שגיאה בעת ניסיון לשדרג את התוכנית:', err);
      addToast("error", "שגיאה בעדכון התוכנית");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3 className="modal-title">בחר/י תוכנית חדשה</h3>
        <div className="plans-grid">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`plan-card ${selectedPlan === plan.id ? 'selected' : ''}`}
              onClick={() => setSelectedPlan(plan.id)}
            >
              <h4>{plan.name}</h4>
              <p>{plan.description}</p>
              <strong>₪{plan.price}</strong>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button onClick={onClose}>ביטול</button>
          <button
  onClick={() => {
    console.log("📤 נשלחת בקשת החלפת תוכנית עם:", {
      selectedPlan,
      userId,
      transactionToken,
      transactionId,
      asmachta,
    });
    handleUpgrade();
  }}
  disabled={!selectedPlan || loading}
>
  {loading ? 'טוען...' : 'החלף תוכנית'}
</button>
        </div>
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
  );
};
