export type SourceLead  = {
  id: string; // מזהה ה־Firestore
  AgentId: string;
  sourceLead: string;
  statusLead: boolean;
  [key: string]: any; // אופציונלי – אם יש שדות נוספים דינאמיים
};


