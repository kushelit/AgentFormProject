'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/firebase/AuthContext';
import { apiFetch } from '@/lib/apiFetch';
import CommissionSummaryAgentTab from '@/components/commission/CommissionSummaryAgentTab';
import CommissionSummaryAgencyMatrixTab from '@/components/commission/CommissionSummaryAgencyMatrixTab';
import CommissionSummaryHekefTab from '@/components/commission/CommissionSummaryHekefTab';
import HekefCommissionTab from '@/components/commission/hekef/HekefCommissionTab';


type TabKey = 'agent' | 'agency' | 'hekef' | 'hekefCommission';

export default function CommissionSummaryTabsPage() {
  const { detail } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>('agent');

  // טאב "היקף" מוצג רק כשקיימת תבנית hekef_commission (בייצור לפני העלייה — לא מופיע)
  const [hekefEnabled, setHekefEnabled] = useState(false);
  useEffect(() => {
    apiFetch('/api/hekef-commission/available')
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => setHekefEnabled(!!d?.enabled))
      .catch(() => setHekefEnabled(false));
  }, []);

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
      {/* רוחב: max-w-[1800px] (במקום max-w-6xl) — הטבלאות רחבות, ניצול מלא של המסך */}
      <div className="w-full max-w-[1800px] mx-auto px-4 lg:px-6 py-6">
       <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">
            {activeTab === 'hekef' ? 'דף עמלות – תפוקות' : activeTab === 'hekefCommission' ? 'דף עמלות – היקף' : 'דף עמלות – נפרעים'}
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
            {hekefEnabled && (
              <button
                type="button"
                onClick={() => setActiveTab('hekefCommission')}
                className={`px-4 py-1 rounded-full text-sm font-semibold transition-all ${
                  activeTab === 'hekefCommission' ? 'bg-white text-blue-800' : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                היקף
              </button>
            )}
          {/* <button
              type="button"
              onClick={() => setActiveTab('hekef')}
              className={`px-4 py-1 rounded-full text-sm font-semibold transition-all ${
                activeTab === 'hekef' ? 'bg-white text-blue-800' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              תפוקות
            </button> */}
          </div>
        </div>
        {/* 🔹 תוכן הלשוניות */}
        <div className="bg-white rounded-xl shadow-sm border min-w-0">
          {/* סוכן – תמיד זמין (וברירת מחדל) */}
          {activeTab === 'agent' && <CommissionSummaryAgentTab />}
          {/* סוכנות – רק אם יש הרשאה */}
          {activeTab === 'agency' && canSeeAgencyTab && (
            <CommissionSummaryAgencyMatrixTab />
          )}
{/* {activeTab === 'hekef' && <CommissionSummaryHekefTab />} */}
          {activeTab === 'hekefCommission' && hekefEnabled && <HekefCommissionTab />}
        </div>
      </div>
    </div>
  );
}