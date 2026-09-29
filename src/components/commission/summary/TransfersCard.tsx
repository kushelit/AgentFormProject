'use client';
// src/components/commission/summary/TransfersCard.tsx
// ניודים אפשריים בפנסיה — סימון בלבד. הסוכן יודע אם זה ניוד; המערכת רק מפנה את תשומת הלב.
import React, { useState } from 'react';
import type { TransferSummary } from '@/types/agentInsights';
import { transferReasonText } from '@/lib/insights/transfers';
import CustomerLink from './CustomerLink';
import CustomerIssueBar from './CustomerIssueBar';
import useOpenCustomer from '@/hooks/useOpenCustomer';
import { fmtInt } from './ui';
import t from './table.module.css';

interface Props {
  agentId: string;
  transfers: TransferSummary;
}

const PAGE = 15;

const TransfersCard: React.FC<Props> = ({ agentId, transfers }) => {
  const { openCustomer, isPending, issue, clearIssue } = useOpenCustomer(agentId);
  const [visible, setVisible] = useState(PAGE);
  const items = transfers.items;
  if (!items.length) return null;

  const range =
    transfers.recentYms.length > 1
      ? `${transfers.recentYms[0]} – ${transfers.recentYms[transfers.recentYms.length - 1]}`
      : transfers.recentYms[0] ?? '';

  return (
    <section className="bg-white border border-amber-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 bg-amber-50/70 border-b border-amber-100">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-black text-amber-900">🔄 ניודים אפשריים בפנסיה · {fmtInt(items.length)}</h3>
          <span className="text-sm text-amber-800/80">חודשי פרסום {range}</span>
        </div>
        <p className="text-sm text-amber-900/80 mt-1 leading-relaxed">
          פוליסות שבהן כנראה הועברה צבירה, והיא הגיעה בדוח כפרמיה פנסיה. זה מקפיץ את הפרמיה באותו חודש ומוריד את אחוז העמלה (על הניוד אין
          עמלה). זו הערכה בלבד — אתה יודע אם אלה ניודים.
        </p>
      </div>

      <CustomerIssueBar agentId={agentId} issue={issue} onClose={clearIssue} />

      <div className="overflow-x-auto">
        <table className={`${t.cleanTable} text-sm`}>
          <thead>
            <tr>
              <th className="px-3 py-2 whitespace-nowrap">לקוח</th>
              <th className={`px-3 py-2 whitespace-nowrap ${t.center}`}>חברה</th>
              <th className={`px-3 py-2 whitespace-nowrap ${t.center}`}>מוצר</th>
              <th className={`px-3 py-2 whitespace-nowrap ${t.center}`}>חודש פרסום</th>
              <th className={`px-3 py-2 whitespace-nowrap ${t.center}`}>פרמיה</th>
              <th className={`px-3 py-2 whitespace-nowrap ${t.center}`}>עמלה</th>
              <th className="px-3 py-2">למה זה נראה כמו ניוד</th>
            </tr>
          </thead>
          <tbody>
            {items.slice(0, visible).map((x, i) => (
              <tr key={`${x.templateId}_${x.policyNumberKey}_${x.customerId}_${x.ym}_${i}`}>
                <td className="px-3 py-1.5 font-semibold whitespace-nowrap">
                  <CustomerLink customerId={x.customerId} label={x.fullName || x.customerId || '-'} name={x.fullName} pending={isPending(x.customerId)} onOpen={openCustomer} />
                  <div className="text-xs font-normal text-slate-500 tabular-nums">פוליסה {x.policyNumberKey}</div>
                </td>
                <td className={`px-3 py-1.5 text-slate-600 whitespace-nowrap ${t.center}`}>{x.company}</td>
                <td className={`px-3 py-1.5 text-slate-600 whitespace-nowrap ${t.center}`}>{x.product}</td>
                <td className={`px-3 py-1.5 tabular-nums whitespace-nowrap ${t.center}`}>{x.ym}</td>
                <td className={`px-3 py-1.5 tabular-nums font-bold whitespace-nowrap ${t.center}`}>{fmtInt(x.premium)} ₪</td>
                <td className={`px-3 py-1.5 tabular-nums whitespace-nowrap ${t.center}`}>{fmtInt(x.commission)} ₪</td>
                <td className="px-3 py-1.5 text-[13px] text-slate-700">
                  {transferReasonText(x).map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {items.length > visible && (
        <div className="px-4 py-2 border-t text-sm">
          <button type="button" onClick={() => setVisible((v) => v + PAGE)} className="text-amber-800 hover:underline">
            הצג עוד ({fmtInt(items.length - visible)})
          </button>
        </div>
      )}
    </section>
  );
};

export default TransfersCard;