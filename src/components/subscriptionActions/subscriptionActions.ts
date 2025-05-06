// File: /lib/subscriptions/subscriptionActions.ts
import axios from 'axios';

export interface CancelSubscriptionParams {
  id: string;
  subscriptionId?: string;
  updates?: Record<string, any>;
}

// File: /components/subscriptionActions.ts
export async function cancelSubscription(id: string, subscriptionId?: string) {
  try {
    const res = await fetch('/api/cancelSubscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, subscriptionId }),
    });

    const data = await res.json();

    if (!res.ok) {
      const message =
        typeof data.error === 'string'
          ? data.error
          : JSON.stringify(data.error || 'כשל בביטול המנוי');
      throw new Error(message);
    }

    return data;
  } catch (error) {
    console.error('❌ cancelSubscription error:', error);
    throw error;
  }
}

export const getAllSubscriptions = async () => {
  const res = await fetch('/api/subscriptions');
  if (!res.ok) {
    const errorText = await res.text();
    console.error('❌ שגיאת API:', res.status, errorText);
    throw new Error(`שגיאה בשליפת מנויים: ${res.status}`);
  }
  return res.json();
};


export const sendFailureEmail = async (email: string, fullName: string) => {
  const response = await axios.post('/api/sendEmail', {
    to: email,
    subject: 'הודעה על כישלון בתשלום למערכת MagicSale',
    html: `
      שלום ${fullName},<br><br>
      ניסינו לגבות את התשלום שלך למערכת MagicSale אך הוא נכשל.<br>
      אנא הסדיר/י את התשלום על מנת למנוע השעיה של החשבון שלך.<br><br>
      במידה ונתקלת בקושי או שיש לך שאלה, אנו כאן לעזרתך.<br><br>
      בברכה,<br>
      צוות MagicSale
    `,
  });
  return response.data;
};

export const sendCancelEmail = async (email: string, fullName: string) => {
  const response = await axios.post('/api/sendEmail', {
    to: email,
    subject: 'ביטול מנוי במערכת MagicSale',
    html: `
      שלום ${fullName},<br><br>
      המנוי שלך במערכת MagicSale בוטל.<br>
      אם זה נעשה בטעות או יש צורך בחידוש, נשמח לעזור בכל עת.<br><br>
      תודה על השימוש במערכת,<br>
      צוות MagicSale
    `,
  });
  return response.data;
};
