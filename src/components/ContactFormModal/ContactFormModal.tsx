import React, { useState } from "react";
import "./ContactFormModal.css";
import { useToast } from "@/hooks/useToast";
import { ToastNotification } from '@/components/ToastNotification';



interface ContactFormModalProps {
  onClose: () => void;
  userEmail?: string;
  userName?: string;
}

const ContactFormModal: React.FC<ContactFormModalProps> = ({ onClose, userEmail = "", userName = "משתמש אנונימי" }) => {
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  const { toasts, addToast, setToasts } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userEmail,
          userName,
          message,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "שגיאה בשליחת הפנייה");

      addToast("success", "הפנייה נשלחה בהצלחה!");

      // ✅ נסגור את המודל אחרי חצי שנייה כדי שמשתמש יראה את ההודעה
      setTimeout(() => {
        onClose();
      }, 500);

    } catch (err) {
      addToast("error", "שגיאה בשליחת הבקשה, נסה שוב.");
    } finally {
      setIsSending(false);
    }
  };


  return (
    <div className="modal-overlay">
      <div className="modal-card" role="dialog" aria-modal="true">
        <button className="modal-close" onClick={onClose} aria-label="סגור">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>

        <div className="modal-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M4 4H20C21.1 4 22 4.9 22 6V16C22 17.1 21.1 18 20 18H8L4 22V6C4 4.9 4.9 4 4 4Z"
              stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          </svg>
        </div>

        <h2 className="modal-title">פניות לשירות התמיכה</h2>
        <p className="modal-subtitle">נשמח לעזור — ספרו לנו במה מדובר ונחזור אליכם בהקדם</p>

        <form onSubmit={handleSubmit} className="modal-body">
          <textarea
            className="modal-textarea"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="פרט את הבקשה או התקלה..."
            required
          />

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              ביטול
            </button>
            <button type="submit" className="btn-primary" disabled={isSending}>
              {isSending ? (
                "שולח..."
              ) : (
                <>
                  שלח פנייה
                  <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
                    <path d="M18 2L9.5 10.5M18 2L12.5 18L9.5 10.5M18 2L2 7.5L9.5 10.5"
                      stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </form>

        {toasts.length > 0 && toasts.map((toast) => (
          <ToastNotification
            key={toast.id}
            type={toast.type}
            className={toast.isHiding ? "hide" : ""}
            message={toast.message}
            onClose={() => setToasts((prevToasts) => prevToasts.filter((t) => t.id !== toast.id))}
          />
        ))}
      </div>
    </div>
  );
};

export default ContactFormModal;
