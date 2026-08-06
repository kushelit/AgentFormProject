'use client';

import Link from 'next/link';

import { useAuth } from '@/lib/firebase/AuthContext';
import { useMagicTouchAgent } from '@/components/MagicTouch/MagicTouchAgentContext';

export default function MagicTouchTopBar() {
  const { detail, logOut } = useAuth();
  const {
    agents,
    selectedAgentId,
    canSelectAgent,
    isLoadingAgent,
    handleAgentChange,
  } = useMagicTouchAgent();

  return (
    <header
      dir="rtl"
      className="fixed right-0 top-0 z-40 flex h-16 w-full items-center justify-between border-b border-slate-800 bg-slate-950 px-5 text-white shadow-md"
    >
      <div className="flex items-center gap-4">
        <Link href="/MagicTouch" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold">
            M
          </div>
          <div>
            <div className="text-lg font-bold">Magic Touch</div>
            <div className="text-xs text-slate-400">
              תקשורת, קמפיינים ואוטומציות
            </div>
          </div>
        </Link>

        {canSelectAgent && (
          <div className="mr-4 flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2">
            <div className="text-xs text-slate-400">סוכן פעיל</div>
            <select
              value={selectedAgentId}
              onChange={handleAgentChange}
              disabled={isLoadingAgent}
              className="min-w-52 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-white outline-none focus:border-blue-500 disabled:opacity-60"
            >
              <option value="">-- בחר סוכן --</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>
        )}

      </div>

      <div className="flex items-center gap-4 text-sm">
        <Link href="/MagicTouch/Integrations" className="rounded-lg px-3 py-2 hover:bg-slate-800">
          חיבורים
        </Link>
        <Link href="/MagicTouch/Settings" className="rounded-lg px-3 py-2 hover:bg-slate-800">
          הגדרות
        </Link>
        <div className="h-6 w-px bg-slate-700" />
        <span className="text-slate-300">{detail?.name || ''}</span>
        <button
          type="button"
          onClick={() => {
            void logOut().then(() => {
              window.location.href = '/auth/log-in';
            });
          }}
          className="rounded-lg border border-slate-700 px-3 py-2 hover:bg-slate-800"
        >
          התנתקות
        </button>
      </div>
    </header>
  );
}
