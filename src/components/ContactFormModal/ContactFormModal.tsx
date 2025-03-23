import React, { useState } from "react";
import "./ContactFormModal.css";
import { useToast } from "@/hooks/useToast";
import {ToastNotification} from '@/components/ToastNotification';



interface ContactFormModalProps {
  onClose: () => void;
  userEmail?: string;
  userName?: string;
}

const ContactFormModal: React.FC<ContactFormModalProps> = ({ onClose, userEmail = "", userName = "משתמש אנונימי" }) => {
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const { toasts, addToast, setToasts } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);
    setError("");
    setSuccess("");
  
    console.log("📨 התחלת שליחת המייל..."); // 🔹 Debugging
  
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
  
      console.log("📩 תגובת השרת:", res); // 🔹 הדפסת תגובה
  
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "שגיאה בשליחת הפנייה");
  
      addToast("success", "הפנייה נשלחה בהצלחה!");

      // setSuccess("הפנייה נשלחה בהצלחה!");
      // setMessage("");
 // ✅ נסגור את המודל אחרי חצי שנייה כדי שמשתמש יראה את ההודעה
 setTimeout(() => {
  onClose();
}, 500);

    } catch (err) {
      console.error("❌ שגיאה בשליחת המייל:", err);
      // setError("שגיאה בשליחת הבקשה, נסה שוב.");
      addToast("error", "שגיאה בשליחת הבקשה, נסה שוב.");

    } finally {
      setIsSending(false);
    }
  };
  

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <button className="close-button" onClick={onClose}>✖</button>
        <h2>פניות לשירות התמיכה</h2>
        <form onSubmit={handleSubmit}>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="פרט את הבקשה או התקלה..."
            required
          />
          <button type="submit" disabled={isSending}>
            {isSending ? "שולח..." : "שלח"}
          </button>
        </form>
        {toasts.length > 0  && toasts.map((toast) => (
  <ToastNotification 
    key={toast.id}  
    type={toast.type}
    className={toast.isHiding ? "hide" : ""} 
    message={toast.message}
    onClose={() => setToasts((prevToasts) => prevToasts.filter((t) => t.id !== toast.id))}
  />
))}
        {/* {error && <p className="error-message">{error}</p>}
        {success && <p className="success-message">{success}</p>} */}
      </div>
    </div>
  );
};

export default ContactFormModal;
