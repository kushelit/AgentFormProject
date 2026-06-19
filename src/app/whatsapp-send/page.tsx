'use client';

import { Suspense, useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/firebase";
import { useAuth } from "@/lib/firebase/AuthContext";
import AccessDenied from "@/components/AccessDenied";
import { usePermission } from "@/hooks/usePermission";
import { Button } from "@/components/Button/Button";

const WhatsAppSendPage = () => {
  const { user, isLoading, detail } = useAuth();
  const [ready, setReady] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [sending, setSending] = useState(false);

  const { canAccess, isChecking } = usePermission(
    user ? "access_send_whatsapp_template" : null
  );

  useEffect(() => {
    setIsClient(true);
    const timer = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(timer);
  }, []);

  // מניעת hydration error
  if (!isClient) return null;

  // שלבי טעינה
  if (isLoading || isChecking || !ready || !user || !detail) {
    return <div className="p-4 text-gray-600">⏳ טוען מידע...</div>;
  }

  // לא מחובר
  if (!user) {
    return (
      <div className="text-custom-white px-4 py-2 rounded-lg">
        נדרש להתחבר למערכת כדי לגשת לדף זה.
      </div>
    );
  }

  // אין הרשאה לדף
  if (!canAccess) {
    return <AccessDenied />;
  }

  const onSendBatch = async () => {
    if (sending) return;
    setSending(true);
    try {
      const fn = httpsCallable(functions, "sendReengagementBatch");
      const result: any = await fn({});
      alert(JSON.stringify(result.data, null, 2));
    } catch (e: any) {
      alert(`שגיאה: ${e.message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div className="p-6 max-w-2xl mx-auto text-right">
        <h1 className="text-2xl font-bold mb-4">שליחת תבנית וואטסאפ ללקוחות</h1>

        <div className="border rounded p-3 bg-white">
          <Button
            text={sending ? "⏳ שולח..." : "שלח מנה"}
            type="primary"
            onClick={onSendBatch}
            disabled={sending}
          />
        </div>
      </div>
    </Suspense>
  );
};

export default WhatsAppSendPage;