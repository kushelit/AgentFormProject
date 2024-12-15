import { useState } from "react";

export type RequestLog = {
  id: string;
  status: "failure" | "success";
  message: string;
  payload?: Record<string, any>;
  timestamp: string;
};

export const useRequestLogger = () => {
  const [logs, setLogs] = useState<RequestLog[]>([]);

  const logRequest = (log: RequestLog) => {
    setLogs((prevLogs) => [...prevLogs, log]);
  };

  return { logs, logRequest };
};
