'use client';
// components/ReferrerField/ReferrerField.tsx

import React, { useCallback, useEffect, useState } from 'react';
import { collection, query, where, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';

type Referrer = { id: string; name: string; active: boolean };

type Props = {
  agentId: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** אם קיים — עוטף את השדה ב-.dfm-group עם תווית (לשימוש בתוך DealFormModal) */
  label?: string;
  /** לשימוש בתוך טבלה (כמו ElementaryTab) — קלאס לבחירה שמתאים לעיצוב הטבלה */
  selectClassName?: string;
};

const ReferrerField: React.FC<Props> = ({ agentId, value, onChange, disabled, label, selectClassName }) => {
  const [referrers, setReferrers] = useState<Referrer[]>([]);
  const [showManage, setShowManage] = useState(false);
  const [newName, setNewName] = useState('');
  const [savingNew, setSavingNew] = useState(false);

  const fetchReferrers = useCallback(async () => {
    if (!agentId) { setReferrers([]); return; }
    const snap = await getDocs(query(collection(db, 'agentReferrers'), where('agentId', '==', agentId)));
    setReferrers(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Referrer, 'id'>) })));
  }, [agentId]);

  useEffect(() => { fetchReferrers(); }, [fetchReferrers]);

  // ברשימת הבחירה: מציגים נציגים פעילים, ותמיד גם את הנבחר הנוכחי (גם אם הפך ללא-פעיל בינתיים)
  const visibleReferrers = referrers.filter((r) => r.active || r.name === value);

  const addReferrer = async () => {
    const trimmed = newName.trim();
    if (!trimmed || !agentId) return;
    setSavingNew(true);
    try {
      await addDoc(collection(db, 'agentReferrers'), { agentId, name: trimmed, active: true });
      setNewName('');
      await fetchReferrers();
    } finally {
      setSavingNew(false);
    }
  };

  const toggleActive = async (referrer: Referrer) => {
    await updateDoc(doc(db, 'agentReferrers', referrer.id), { active: !referrer.active });
    await fetchReferrers();
  };

  const selectEl = (
    <select
      className={selectClassName}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      style={{ flex: 1 }}
    >
      <option value="">בחר נציג</option>
      {visibleReferrers.map((r) => (
        <option key={r.id} value={r.name}>{r.name}{!r.active ? ' (לא פעיל)' : ''}</option>
      ))}
    </select>
  );

  const gearBtn = (
    <button
      type="button"
      onClick={() => setShowManage(true)}
      title="ניהול נציגים מפנים"
      style={{
        background: 'transparent', border: '1px solid #B4B2A9', borderRadius: 4,
        width: 30, height: 30, cursor: 'pointer', flexShrink: 0, fontSize: 14,
      }}
    >
      ⚙️
    </button>
  );

  const fieldRow = (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      {selectEl}
      {gearBtn}
    </div>
  );

  return (
    <>
      {label ? (
        <div className="dfm-group">
          <label className="dfm-label">{label}</label>
          {fieldRow}
        </div>
      ) : (
        fieldRow
      )}

      {showManage && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100 }}
          onClick={() => setShowManage(false)}
        >
          <div
            style={{ width: 360, maxWidth: '95vw', background: '#F1F5F7', borderRadius: 8, padding: 20, position: 'relative', direction: 'rtl' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowManage(false)}
              style={{ position: 'absolute', top: 12, left: 12, background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14, color: 'rgba(0,0,0,0.4)' }}
            >
              ✖
            </button>

            <div style={{ fontWeight: 700, color: '#3B6A95', marginBottom: 16, borderBottom: '1px solid #ddd', paddingBottom: 8 }}>
              ניהול נציגים מפנים
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              <input
                type="text"
                placeholder="שם נציג חדש"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                style={{ flex: 1, height: 32, padding: '6px 8px', border: '1px solid #B4B2A9', borderRadius: 4, background: '#fff' }}
              />
              <button
                type="button"
                onClick={addReferrer}
                disabled={savingNew || !newName.trim()}
                style={{
                  padding: '0 14px', borderRadius: 4, border: 'none',
                  background: savingNew || !newName.trim() ? '#B4B2A9' : '#3B6A95',
                  color: '#fff', cursor: savingNew || !newName.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                הוסף
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
              {referrers.length === 0 && (
                <div style={{ fontSize: 12, color: '#888' }}>אין עדיין נציגים מפנים לסוכן הזה</div>
              )}
              {referrers.map((r) => (
                <div
                  key={r.id}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '6px 2px', borderBottom: '1px solid #E8E6DF' }}
                >
                  <span style={{ color: r.active ? '#111' : '#999' }}>{r.name}</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <span style={{ fontSize: 11, color: '#5F5E5A' }}>{r.active ? 'פעיל' : 'לא פעיל'}</span>
                    <input type="checkbox" checked={r.active} onChange={() => toggleActive(r)} />
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ReferrerField;
