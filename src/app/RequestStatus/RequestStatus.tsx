import React from "react";
import { useRequestStatus } from "@/hooks/useRequestStatus";

const RequestStatusPage = () => {
  const { requests, logRequest } = useRequestStatus();

  // Example of logging a new request
  const handleLogRequest = () => {
    logRequest({
      id: "123",
      status: "success",
      message: "Request completed successfully!",
    });
  };

  return (
    <div>
      <h1>Request Status</h1>
      <button onClick={handleLogRequest}>Log a Request</button>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Status</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((req) => (
            <tr key={req.id}>
              <td>{req.id}</td>
              <td>{req.status}</td>
              <td>{req.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default RequestStatusPage;
