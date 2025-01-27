// "@/types/Goal"

export interface Lead {
  id: string; // מזהה ייחודי של הליד
  sourceLead: string; // מקור הליד
  isAPILead: boolean; // האם הליד נוצר מ-API
  statusLead: boolean; // סטטוס האם הליד פעיל
  agentId?: string; // מזהה הסוכן שאליו שייך הליד (אופציונלי)
  creationDate?: string; // תאריך יצירת הליד (אופציונלי)
  lastUpdateDate?: string; // תאריך עדכון אחרון (אופציונלי)
}

export interface StatusLead {
  id: string;
  statusLeadName: string;
  defaultStatusLead: boolean;
  statusLeadList: boolean;
}
