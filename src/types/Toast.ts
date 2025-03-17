// "@/types/Goal"

export interface Toast  {
  id: number;
  type: "success" | "error" | "warning";
  message: string;
  isHiding?: boolean;  // ✅ הוספת שדה אופציונלי
}
