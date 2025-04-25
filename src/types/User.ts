// "@/types/Goal"

export interface UserData   {
  id: string;
  agentId: string;
  email: string;
  name: string;
  role: 'worker' | 'agent' | 'manager' | 'admin';
  managerId?: string;
  agentGroupId?: string;
}

export interface ManagerData    {
  id: string;
  name: string;
  email: string;
  role: 'manager';
  agentGroupId: string;
}
