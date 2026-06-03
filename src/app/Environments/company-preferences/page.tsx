"use client";

import React, { useCallback, useEffect, useState } from "react";
import { collection, getDocs, doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase";
import { useAuth } from "@/lib/firebase/AuthContext";
import { Button } from "@/components/Button/Button";

type CompanyRow = {
  id: string;
  companyName: string;
};

export default function CompanyPreferencesPage() {
  const { user, detail } = useAuth();

  const [allCompanies, setAllCompanies] = useState<CompanyRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const agentId = user?.uid || "";

  // ─── Fetch all companies + agent's current preferences ───────────────────
  const fetchData = useCallback(async () => {
    if (!agentId) return;
    setLoading(true);
    try {
      const [companiesSnap, agentDoc] = await Promise.all([
        getDocs(collection(db, "company")),
        getDoc(doc(db, "users", agentId)),
      ]);

      const companies: CompanyRow[] = companiesSnap.docs
        .map(d => ({ id: d.id, companyName: String(d.data().companyName || "").trim() }))
        .filter(c => c.companyName)
        .sort((a, b) => a.companyName.localeCompare(b.companyName, "he"));

      setAllCompanies(companies);

      // load saved preferences
      const savedIds: string[] = agentDoc.data()?.preferredCompanyIds;
if (!savedIds || savedIds.length === 0) {
  // פעם ראשונה — מסמן הכל
  setSelectedIds(new Set(companies.map(c => c.id)));
} else {
  setSelectedIds(new Set(savedIds));
}
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Toggle ───────────────────────────────────────────────────────────────
  const toggle = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setSaved(false);
  };

  const selectAll = () => {
    setSelectedIds(new Set(allCompanies.map(c => c.id)));
    setSaved(false);
  };

  const clearAll = () => {
    setSelectedIds(new Set());
    setSaved(false);
  };

  // ─── Save ─────────────────────────────────────────────────────────────────
  const save = async () => {
    if (!agentId) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "users", agentId), {
        preferredCompanyIds: [...selectedIds],
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="p-6 max-w-3xl mx-auto text-right">
        <h1 className="text-2xl font-bold">בחירת חברות</h1>
        <p className="mt-2 text-gray-600">יש להתחבר כדי לשמור העדפות.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto text-right">
      <h1 className="text-2xl font-bold">🏢 בחירת חברות</h1>
      <p className="mt-2 text-gray-600">
        בחרו את החברות איתן אתם עובדים. הבחירה תשפיע על הרשימות בכל המערכת.
      </p>

      <div className="mt-2 text-sm text-gray-700">
        סוכן: <b>{detail?.name || user.email}</b>
      </div>

      {loading ? (
        <div className="mt-6 text-gray-500">טוען...</div>
      ) : (
        <>
          {/* Actions */}
          <div className="mt-4 flex gap-3 justify-end items-center">
            <span className="text-sm text-gray-500">
              {selectedIds.size} מתוך {allCompanies.length} נבחרו
            </span>
            <button
              onClick={selectAll}
              className="text-sm text-blue-600 underline cursor-pointer bg-transparent border-none"
            >
              בחר הכל
            </button>
            <button
              onClick={clearAll}
              className="text-sm text-gray-500 underline cursor-pointer bg-transparent border-none"
            >
              נקה הכל
            </button>
          </div>

          {/* Companies grid */}
          <div className="mt-3 border rounded p-4 bg-white">
            <div className="grid grid-cols-2 gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
              {allCompanies.map(company => {
                const isSelected = selectedIds.has(company.id);
                return (
                  <div
                    key={company.id}
                    onClick={() => toggle(company.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1px solid ${isSelected ? '#185FA5' : '#E5E5E5'}`,
                      background: isSelected ? '#E6F1FB' : 'white',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      userSelect: 'none',
                    }}
                  >
                    <div style={{
                      width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                      border: `2px solid ${isSelected ? '#185FA5' : '#B4B2A9'}`,
                      background: isSelected ? '#185FA5' : 'white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {isSelected && (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <span style={{
                      fontSize: 13,
                      fontWeight: isSelected ? 500 : 400,
                      color: isSelected ? '#0C447C' : '#1A1A2E',
                    }}>
                      {company.companyName}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Save */}
          <div className="mt-4 flex justify-end items-center gap-3">
            {saved && (
              <span className="text-sm text-green-600">✅ נשמר בהצלחה</span>
            )}
            <Button
              text={saving ? "⏳ שומר..." : "שמור בחירה"}
              type="primary"
              onClick={save}
              disabled={saving}
            />
          </div>
        </>
      )}
    </div>
  );
}
