export type CustomersTypeForFetching = {
  id: string; // הוסף את השדה 'id'
  AgentId: string;
  parentID: string;
  parentFullName?: string;
  firstNameCustomer: string;
  lastNameCustomer: string;
  fullNameCustomer: string;
  IDCustomer: string;
  notes?: string;
  issueDay?: string;
  birthday: string;
  gender?: 'זכר' | 'נקבה' | '';
  phone?: string;
  mail?: string;
  address?: string;
  sourceValue?: string;
};


 