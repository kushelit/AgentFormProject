import { useState } from "react";
import { Toast } from '@/types/Toast';



export const useToast = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (type: "success" | "error" | "warning", message: string, delay = 0) => {
    const id = Date.now() + Math.random();

    setTimeout(() => {
      setToasts((prevToasts) => [...prevToasts, { id, type, message, isHiding: false }]);

      setTimeout(() => {
        setToasts((prevToasts) =>
          prevToasts.map((toast) =>
            toast.id === id ? { ...toast, isHiding: true } : toast
          )
        );
      }, 4000);

      setTimeout(() => {
        setToasts((prevToasts) => prevToasts.filter((toast) => toast.id !== id));
      }, 5000);
    }, delay);
  };

  return { toasts, addToast, setToasts };
};
