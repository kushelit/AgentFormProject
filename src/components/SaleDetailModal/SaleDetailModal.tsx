'use client';

import React from 'react';
import { SaleDetailRow } from '@/hooks/useSalesCalculateData';
import './SaleDetailModal.css';

type Props = {
  title: string;
  rows: SaleDetailRow[];
  onClose: () => void;
};

const SaleDetailModal: React.FC<Props> = ({ title, rows, onClose }) => {
  const total = rows.reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="sale-detail-overlay" onClick={onClose}>
      <div className="sale-detail-modal" dir="rtl" onClick={(e) => e.stopPropagation()}>
        <div className="sale-detail-header">
          <h3>{title}</h3>
          <button type="button" onClick={onClose} className="sale-detail-close">
            ✕
          </button>
        </div>

        <div className="sale-detail-body">
          {rows.length === 0 ? (
            <p className="sale-detail-empty">אין נתונים להצגה עבור תא זה</p>
          ) : (
            <table className="sale-detail-table">
              <thead>
                <tr>
                  <th>לקוח</th>
                  <th>חברה</th>
                  <th>מוצר</th>
                  <th>סכום</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.saleId}>
                    <td>{row.customerName || row.customerId || '—'}</td>
                    <td>{row.company}</td>
                    <td>{row.product}</td>
                    <td>{row.amount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>
                    <strong>סה&quot;כ</strong>
                  </td>
                  <td>
                    <strong>{total.toLocaleString()}</strong>
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default SaleDetailModal;