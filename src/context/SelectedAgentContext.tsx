'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface SelectedAgentContextType {
  selectedAgent: string;
  setSelectedAgent: (agent: string) => void;
  selectedAgentId: string;
  setSelectedAgentId: (id: string) => void;
}

const SelectedAgentContext = createContext<SelectedAgentContextType | undefined>(undefined);

export const SelectedAgentProvider = ({ children }: { children: ReactNode }) => {
  const [selectedAgent, setSelectedAgent] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState('');

  return (
    <SelectedAgentContext.Provider value={{ selectedAgent, setSelectedAgent, selectedAgentId, setSelectedAgentId }}>
      {children}
    </SelectedAgentContext.Provider>
  );
};

export const useSelectedAgent = () => {
  const context = useContext(SelectedAgentContext);
  if (context === undefined) {
    throw new Error('useSelectedAgent must be used within a SelectedAgentProvider');
  }
  return context;
};