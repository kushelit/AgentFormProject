'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
} from 'react';

import { useAuth } from '@/lib/firebase/AuthContext';
import useFetchAgentData from '@/hooks/useFetchAgentData';

type MagicTouchAgent = {
  id: string;
  name: string;
  agentCodes?: string[];
};

type MagicTouchAgentContextValue = {
  agents: MagicTouchAgent[];
  selectedAgentId: string;
  selectedAgentName: string;
  effectiveAgentId: string;
  canSelectAgent: boolean;
  isSystemUser: boolean;
  isAgencyAdmin: boolean;
  isLoadingAgent: boolean;
  setSelectedAgentId: (agentId: string) => void;
  handleAgentChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
};

const STORAGE_KEY = 'magicTouch.selectedAgentId';

const MagicTouchAgentContext =
  createContext<MagicTouchAgentContextValue | null>(null);

export function MagicTouchAgentProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { detail } = useAuth();

  const {
    agents,
    selectedAgentId,
    selectedAgentName,
    setSelectedAgentId,
    handleAgentChange,
    isLoadingAgent,
  } = useFetchAgentData();

  const isSystemUser = detail?.isSystem === true;
  const isAgencyAdmin =
    detail?.role === 'admin' && !isSystemUser;

  const canSelectAgent =
    isSystemUser || isAgencyAdmin;

  useEffect(() => {
    if (!canSelectAgent || isLoadingAgent || !agents.length) {
      return;
    }

    if (selectedAgentId && agents.some((agent) => agent.id === selectedAgentId)) {
      return;
    }

    const storedAgentId =
      typeof window !== 'undefined'
        ? String(window.sessionStorage.getItem(STORAGE_KEY) || '').trim()
        : '';

    if (storedAgentId && agents.some((agent) => agent.id === storedAgentId)) {
      setSelectedAgentId(storedAgentId);
    }
  }, [
    agents,
    canSelectAgent,
    isLoadingAgent,
    selectedAgentId,
    setSelectedAgentId,
  ]);

  useEffect(() => {
    if (!canSelectAgent || !selectedAgentId || typeof window === 'undefined') {
      return;
    }

    window.sessionStorage.setItem(STORAGE_KEY, selectedAgentId);
  }, [canSelectAgent, selectedAgentId]);

  const effectiveAgentId = canSelectAgent
    ? selectedAgentId
    : String(detail?.agentId || '').trim();

  const effectiveAgentName = useMemo(() => {
    if (selectedAgentName && selectedAgentName !== 'בחר סוכן') {
      return selectedAgentName;
    }

    return (
      agents.find((agent) => agent.id === effectiveAgentId)?.name ||
      detail?.name ||
      ''
    );
  }, [agents, detail?.name, effectiveAgentId, selectedAgentName]);

  const value = useMemo<MagicTouchAgentContextValue>(() => ({
    agents,
    selectedAgentId,
    selectedAgentName: effectiveAgentName,
    effectiveAgentId,
    canSelectAgent,
    isSystemUser,
    isAgencyAdmin,
    isLoadingAgent,
    setSelectedAgentId,
    handleAgentChange,
  }), [
    agents,
    selectedAgentId,
    effectiveAgentName,
    effectiveAgentId,
    canSelectAgent,
    isSystemUser,
    isAgencyAdmin,
    isLoadingAgent,
    setSelectedAgentId,
    handleAgentChange,
  ]);

  return (
    <MagicTouchAgentContext.Provider value={value}>
      {children}
    </MagicTouchAgentContext.Provider>
  );
}

export function useMagicTouchAgent() {
  const context = useContext(MagicTouchAgentContext);

  if (!context) {
    throw new Error(
      'useMagicTouchAgent must be used within MagicTouchAgentProvider'
    );
  }

  return context;
}
