'use client';
// src/components/commission/summary/CustomerIssueBar.tsx
// הודעה בתוך הדריל כשלא ניתן לפתוח את כרטיס הלקוח —
// לקוח שלא קיים עדיין בניהול לקוחות → הפניה לייבוא לקוחות מטעינות.
import React from 'react';
import CustomerImportFromCommissions from '@/components/customers/CustomerImportFromCommissions';
import type { CustomerIssue } from '@/hooks/useOpenCustomer';

interface Props {
  agentId: string;
  issue: CustomerIssue | null;
  onClose: () => void;
}

const CustomerIssueBar: React.FC<Props> = ({ agentId, issue, onClose }) => {
  if (!issue) return null;
  const who = issue.name ? `${issue.name} (${issue.customerId})` : `ת״ז ${issue.customerId}`;

  return (
    <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 flex flex-wrap items-center gap-3 text-sm text-amber-900">
      {issue.reason === 'not_found' ? (
        <>
          <span className="flex-1 min-w-[240px]">
            <b>{who}</b> לא קיים/ת עדיין בניהול לקוחות. ייבאי את הלקוחות מהטעינות כדי לפתוח את כרטיס הלקוח.
          </span>
          <CustomerImportFromCommissions agentId={agentId} onChanged={onClose} />
        </>
      ) : (
        <span className="flex-1">אין לך הרשאה לכרטיס לקוח (מודול CRM).</span>
      )}
      <button type="button" onClick={onClose} className="text-amber-700 hover:text-amber-900" aria-label="סגור">
        ✕
      </button>
    </div>
  );
};

export default CustomerIssueBar;