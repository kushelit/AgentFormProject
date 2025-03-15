export interface Customer {
  id: string;
  AgentId?: string; // אופציונלי
  firstNameCustomer?: string;
  lastNameCustomer?: string;
  IDCustomer?: string;
}


export interface Sale {
  id: string;
  AgentId: string;
  IDCustomer: string;
  company?: string;
  product?: string;
  insPremia?: number;
  pensiaPremia?: number;
  pensiaZvira?: number;
  finansimPremia?: number;
  finansimZvira?: number;
  mounth: string;
  statusPolicy?: string;
  minuySochen?: boolean;
  workerName?: string;
  workerId?: string;
  notes?: string;
}
  
  export interface CombinedData extends Sale {
    firstNameCustomer: string;
    lastNameCustomer: string;
    phone?: string;
    mail?: string; // אולי חסר?
    address?: string; // אולי חסר?
  }

  export type AgentDataType = {
    id: string;
    AgentId: string;
    firstNameCustomer: string;
    lastNameCustomer: string;
    IDCustomer: string;
    company: string;
    product: string;
    insPremia?: number; // שדה אופציונלי
    pensiaPremia?: number;
    pensiaZvira?: number;
    finansimPremia?: number;
    finansimZvira?: number;
    mounth: string;
    statusPolicy: string;
    minuySochen?: boolean;
    workerName?: string;
    workerId?: string;
    notes?: string; // גם notes אופציונלי
  };
  