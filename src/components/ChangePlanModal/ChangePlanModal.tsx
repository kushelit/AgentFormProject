'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';

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
        alert('המנוי עודכן בהצלחה');
        onClose();
        window.location.reload();
      } else {
        alert('שגיאה: ' + (res.data.message || res.data.error));
      }
    } catch (err) {
      console.error('שגיאה בעת ניסיון לשדרג את התוכנית:', err);
      alert('שגיאה כללית בעדכון התוכנית');
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
          <button onClick={handleUpgrade} disabled={!selectedPlan || loading}>
            {loading ? 'טוען...' : 'החלף תוכנית'}
          </button>
        </div>
      </div>
    </div>
  );
};
