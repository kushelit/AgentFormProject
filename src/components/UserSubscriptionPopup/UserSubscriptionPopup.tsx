'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import "./UserSubscriptionPopup.css";

interface Plan {
  id: string;
  name: string;
  price: number;
  description: string;
}

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
}) => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [showChangeModal, setShowChangeModal] = useState(false);

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
    if (!selectedPlan) return;
  
    try {
      const res = await fetch('/api/update-subscription-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPlanId: selectedPlan }),
      });
  
      const result = await res.json();
  
      if (res.ok) {
        alert('המסלול עודכן בהצלחה');
        setShowChangeModal(false);
        window.location.reload(); // רענון להצגת המסלול החדש
      } else {
        alert(result.error || 'שגיאה בעדכון המסלול');
      }
    } catch (err) {
      console.error('שגיאה בעת ניסיון לשדרג את התוכנית:', err);
      alert('שגיאה כללית בעדכון התוכנית');
    }
  };
  
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
        <h2 className="popup-title">
          פרטי המנוי שלך
        </h2>

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
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="modal-title">בחר/י תוכנית חדשה</h3>
            <div className="plans-grid">
              {plans.map(plan => (
                <div
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan.id)}
                  className={`plan-card ${selectedPlan === plan.id ? 'selected' : ''}`}
                >
                  <h4>{plan.name}</h4>
                  <p>{plan.description}</p>
                  <strong>₪{plan.price}</strong>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button onClick={() => setShowChangeModal(false)}>ביטול</button>
              <button onClick={handleUpgrade} disabled={!selectedPlan}>החלף תוכנית</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
