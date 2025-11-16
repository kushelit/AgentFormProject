import React, { useEffect, useState } from "react";
import { db } from "@/lib/firebase/firebase";
import { collection, getDocs } from "firebase/firestore";

interface RequestLog {
  id: string;
  status: "success" | "failure" | "partial-success"; 
  message: string;
  payload?: Record<string, any>;
  timestamp: string;
}

const RequestStatusPage = () => {
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "requestLogs"));
        const fetchedLogs = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as RequestLog[];
        setLogs(fetchedLogs);
      } catch (error) {
        // console.error("Error fetching logs:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLogs();
  }, []);

  return (
    <div>
      <h1>Request Status</h1>
      {isLoading ? (
        <p>Loading...</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Status</th>
              <th>Message</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{log.id}</td>
                <td>{log.status}</td>
                <td>{log.message}</td>
                <td>{log.timestamp}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default RequestStatusPage;
