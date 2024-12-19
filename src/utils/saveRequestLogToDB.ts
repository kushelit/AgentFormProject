import { db } from "@/lib/firebase/firebase";
import { collection, addDoc } from "firebase/firestore";

export type RequestLog = {
  id: string;
  status: "success" | "failure" | "partial-success";
  message: string;
  payload?: Record<string, any>;
  timestamp: string;
};

export const saveRequestLogToDB = async (log: RequestLog) => {
  try {
    console.log("Saving log to Firestore:", log); // בדקי מה נכנס
    await addDoc(collection(db, "requestLogs"), log);
    console.log("Log saved successfully");
  } catch (error) {
    console.error("Error saving log to Firestore:", error);
  }
};
