export interface ReportRequest {
  reportType: string;
  fromDate?: string;
  toDate?: string;
  emailTo: string;
  uid?: string;
  agentId?: string;
  agentName?: string;
  company?: string[]; // ← במקום string
  product?: string[]; // ← במקום string
}
