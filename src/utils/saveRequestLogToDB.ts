import { db } from "@/lib/firebase/firebase";
import { collection, addDoc } from "firebase/firestore";

export type RequestLog = {
  id: string;
  status: "failure" | "success";
  message: string;
  payload?: Record<string, any>;
  timestamp: string;
};

export const saveRequestLogToDB = async (log: RequestLog) => {
  try {
    await addDoc(collection(db, "requestLogs"), log);
  } catch (error) {
    console.error("Error saving log to Firestore:", error);
  }
};
