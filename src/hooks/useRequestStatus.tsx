import { useState } from "react";

// Define the RequestStatus interface
interface RequestStatus {
  id: string; // Unique identifier for the request
  status: string; // Status of the request (e.g., "success" or "error")
  message: string; // Additional information about the request
}

// Define the useRequestStatus hook
export const useRequestStatus = () => {
  const [requests, setRequests] = useState<RequestStatus[]>([]);

  // Add a function to log a new request
  const logRequest = (request: RequestStatus) => {
    setRequests((prevRequests) => [...prevRequests, request]);
  };

  // Return the requests and a function to log new requests
  return { requests, logRequest };
};
