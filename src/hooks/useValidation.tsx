import { useState } from "react";

export const validationRules: Record<string, (value: string) => string | null> = {
  firstNameCustomer: (value) => {
    const hebrewRegex = /^[\u0590-\u05FF ]+$/;
    if (!value.trim()) return "חובה להזין שם פרטי"; // ✅ חובה לא להשאיר ריק
    return !value || hebrewRegex.test(value.trim())
      ? null
      : "שם פרטי חייב להכיל רק אותיות בעברית ורווחים";
  },
  lastNameCustomer: (value) => {
    const hebrewRegex = /^[\u0590-\u05FF ]+$/;
    if (!value.trim()) return "חובה להזין שם משפחה"; // ✅ חובה לא להשאיר ריק
    return !value || hebrewRegex.test(value.trim())
      ? null
      : "שם משפחה חייב להכיל רק אותיות בעברית ורווחים";
  },
  IDCustomer: (value) => {
    if (/\D/.test(value)) return "תעודת זהות יכולה להכיל רק ספרות";
    if (value.length > 9) return "תעודת זהות לא יכולה להכיל יותר מ-9 ספרות";
    if (!value.trim()) return "חובה להזין תעודת זהות "; // ✅ חובה לא להשאיר ריק
    return null;
  },
};

export const useValidation = () => {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleValidatedEditChange = (field: string, value: string, 
    setEditData: Function ,
    setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>> // ✅ נוסיף פרמטר נוסף
  ) => {
    let newValue = value;

    if (field === "IDCustomer") {
      if (/\D/.test(value)) {
        setErrors((prevErrors) => ({
          ...prevErrors,
          [field]: "תעודת זהות יכולה להכיל רק ספרות",
        }));
        return;
      }
      newValue = value.replace(/\D/g, "").slice(0, 9);
    }

    const errorMessage = validationRules[field]?.(newValue);

    setErrors((prevErrors) => ({
      ...prevErrors,
      [field]: errorMessage || "",
    }));

    if (errorMessage) return;

    setEditData((prev: any) => ({
      ...prev,
      [field]: newValue,
    }));
  };

  return { errors,setErrors, handleValidatedEditChange };
};
