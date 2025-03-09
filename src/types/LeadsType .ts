// "@/types/Goal"

import { Timestamp } from "firebase/firestore";

export interface LeadsType {
  id: string;
  firstNameCustomer: string;
  lastNameCustomer: string;
  IDCustomer: string;
  returnDate: string;
  lastContactDate: string;
  phone: string;
  mail: string;
  address: string;
  sourceValue: string;
  selectedStatusLead: string;
  workerId: string;
  notes: string;
  workerName: string;
  birthday: string;
  availableFunds: string;
  retirementFunds: string;
  consentForInformationRequest: boolean;
  createDate: Timestamp;
  campaign: string;
  AgentId: string;
  agentName?: string;
}
