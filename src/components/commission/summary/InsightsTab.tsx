'use client';
// src/components/commission/summary/InsightsTab.tsx
// "תובנות": סקירת AI (למעלה) + ניודים אפשריים בפנסיה + יעילות תיק — נפרעים למשק בית, עומק תיק, פוטנציאל, רשימת עבודה.
import React from 'react';
import type { AgentInsights, AiSummary } from '@/types/agentInsights';
import AiSummaryCard from './AiSummaryCard';
import EfficiencySection from './EfficiencySection';
import TransfersCard from './TransfersCard';
import SlowLoadHint from './SlowLoadHint';

interface Props {
  agentId: string;
  insights: AgentInsights | null;
  loading: boolean;
  error: string | null;
  ai: AiSummary | null;
  aiLoading: boolean;
  aiError: string | null;
  onRefreshAi: () => void;
}

const InsightsTab: React.FC<Props> = ({ agentId, insights, loading, error, ai, aiLoading, aiError, onRefreshAi }) => {
  if (loading) {
    return (
      <div className="space-y-6">
        <SlowLoadHint />
        <div className="h-40 bg-slate-100 rounded-2xl animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[118px] bg-slate-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }
  if (error) return <div className="p-4 text-sm text-red-600 bg-red-50 rounded-xl">{error}</div>;
  if (!insights) return null;

  return (
    <div className="space-y-8">
      <AiSummaryCard ai={ai} loading={aiLoading} error={aiError} onRefresh={onRefreshAi} />
      {insights.transfers && <TransfersCard agentId={agentId} transfers={insights.transfers} />}
      {insights.efficiency && <EfficiencySection agentId={agentId} efficiency={insights.efficiency} />}
    </div>
  );
};

export default InsightsTab;