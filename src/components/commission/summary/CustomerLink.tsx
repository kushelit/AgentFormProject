'use client';
// src/components/commission/summary/CustomerLink.tsx
// שם / ת"ז לקוח כקישור לכרטיס הלקוח (בדרילים)
import React from 'react';

interface Props {
  customerId: string;
  label: React.ReactNode;
  /** שם הלקוח — להודעה אם הלקוח לא קיים */
  name?: string;
  pending: boolean;
  onOpen: (customerId: string, name: string) => void;
  className?: string;
}

const CustomerLink: React.FC<Props> = ({ customerId, label, name = '', pending, onOpen, className = '' }) => {
  if (!customerId) return <span className={className}>{label || '-'}</span>;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen(customerId, name);
      }}
      disabled={pending}
      title="פתיחת כרטיס הלקוח"
      className={`text-right text-indigo-700 hover:underline disabled:opacity-60 ${className}`}
    >
      {label || '-'}
      {pending && <span className="inline-block mr-1.5 animate-spin">⏳</span>}
    </button>
  );
};

export default CustomerLink;