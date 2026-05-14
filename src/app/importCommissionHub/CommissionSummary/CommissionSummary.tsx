'use client';

import React, { useState } from 'react';
import { useAuth } from '@/lib/firebase/AuthContext';
import CommissionSummaryAgentTab from '@/components/commission/CommissionSummaryAgentTab';
import CommissionSummaryAgencyMatrixTab from '@/components/commission/CommissionSummaryAgencyMatrixTab';
import CommissionSummaryHekefTab from '@/components/commission/CommissionSummaryHekefTab';


type TabKey = 'agent' | 'agency' | 'hekef';

export default function CommissionSummaryTabsPage() {
  const { detail } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>('agent');

  // מי רואה את לשונית הסוכנות (וגם את פס הלשוניות בכלל)
  // const canSeeAgencyTab =
  //   detail && ['admin', 'manager'].includes(detail.role);

  const canSeeAgencyTab = false;


  const changeTab = (tab: TabKey) => {
    if (tab === 'agency' && !canSeeAgencyTab) return;
    setActiveTab(tab);
  };

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="max-w-6xl mx-auto px-4 py-6">
       <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">
            {activeTab === 'hekef' ? 'דף עמלות – תפוקות' : 'דף עמלות – נפרעים'}
          </h1>
          <div className="flex bg-blue-100 rounded-full p-1 gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('agent')}
              className={`px-4 py-1 rounded-full text-sm font-semibold transition-all ${
                activeTab === 'agent' ? 'bg-white text-blue-800' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              נפרעים
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('hekef')}
              className={`px-4 py-1 rounded-full text-sm font-semibold transition-all ${
                activeTab === 'hekef' ? 'bg-white text-blue-800' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              תפוקות
            </button>
          </div>
        </div>
        {/* 🔹 תוכן הלשוניות */}
        <div className="bg-white rounded-xl shadow-sm border">
          {/* סוכן – תמיד זמין (וברירת מחדל) */}
          {activeTab === 'agent' && <CommissionSummaryAgentTab />}
          {/* סוכנות – רק אם יש הרשאה */}
          {activeTab === 'agency' && canSeeAgencyTab && (
            <CommissionSummaryAgencyMatrixTab />
          )}
        {activeTab === 'hekef' && <CommissionSummaryHekefTab />}
        </div>
      </div>
    </div>
  );
}