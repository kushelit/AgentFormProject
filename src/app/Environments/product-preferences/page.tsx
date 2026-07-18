"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { collection, getDocs, doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase";
import { useAuth } from "@/lib/firebase/AuthContext";
import { Button } from "@/components/Button/Button";

type ProductRow = {
  id: string;
  productName: string;
  productGroup: string; // ID של קבוצת המוצר
};

type GroupRow = {
  id: string;
  name: string;
};

export default function ProductPreferencesPage() {
  const { user, detail } = useAuth();

  const [allProducts, setAllProducts] = useState<ProductRow[]>([]);
  const [groupsMap, setGroupsMap] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const agentId = user?.uid || "";

  // ─── Fetch products + groups + agent's saved preferences ─────────────────
  const fetchData = useCallback(async () => {
    if (!agentId) return;
    setLoading(true);
    try {
      const [productsSnap, groupsSnap, agentDoc] = await Promise.all([
        getDocs(collection(db, "product")),
        getDocs(collection(db, "productsGroup")),
        getDoc(doc(db, "users", agentId)),
      ]);

      const gMap: Record<string, string> = {};
      groupsSnap.docs.forEach(d => {
        gMap[d.id] = String(d.data().productsGroupName || "").trim();
      });
      setGroupsMap(gMap);

      const products: ProductRow[] = productsSnap.docs
        .map(d => ({
          id: d.id,
          productName: String(d.data().productName || "").trim(),
          productGroup: d.data().productGroup || "",
        }))
        .filter(p => p.productName)
        .sort((a, b) => a.productName.localeCompare(b.productName, "he"));

      setAllProducts(products);

      const savedIds: string[] = agentDoc.data()?.preferredProductIds;
      if (!savedIds || savedIds.length === 0) {
        // פעם ראשונה — מסמן הכל
        setSelectedIds(new Set(products.map(p => p.id)));
      } else {
        setSelectedIds(new Set(savedIds));
      }
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── קיבוץ מוצרים לפי קבוצה ────────────────────────────────────────────────
  const groupedProducts = useMemo(() => {
    const map = new Map<string, ProductRow[]>();
    for (const p of allProducts) {
      const key = p.productGroup || "__none__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    // סדר לפי שם קבוצה בעברית
    return Array.from(map.entries())
      .map(([groupId, products]) => ({
        groupId,
        groupName: groupsMap[groupId] || "ללא קבוצה",
        products,
      }))
      .sort((a, b) => a.groupName.localeCompare(b.groupName, "he"));
  }, [allProducts, groupsMap]);

  // ─── Toggle ───────────────────────────────────────────────────────────────
  const toggle = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setSaved(false);
  };

  const toggleGroup = (products: ProductRow[]) => {
    const allSelected = products.every(p => selectedIds.has(p.id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      products.forEach(p => (allSelected ? next.delete(p.id) : next.add(p.id)));
      return next;
    });
    setSaved(false);
  };

  const selectAll = () => {
    setSelectedIds(new Set(allProducts.map(p => p.id)));
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
        preferredProductIds: [...selectedIds],
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="p-6 max-w-3xl mx-auto text-right">
        <h1 className="text-2xl font-bold">בחירת מוצרים</h1>
        <p className="mt-2 text-gray-600">יש להתחבר כדי לשמור העדפות.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto text-right">
      <h1 className="text-2xl font-bold">📦 בחירת מוצרים</h1>
      <p className="mt-2 text-gray-600">
        בחרו את המוצרים איתם אתם עובדים. הבחירה תשפיע על הרשימות בכל המערכת.
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
              {selectedIds.size} מתוך {allProducts.length} נבחרו
            </span>
            <button onClick={selectAll} className="text-sm text-blue-600 underline cursor-pointer bg-transparent border-none">
              בחר הכל
            </button>
            <button onClick={clearAll} className="text-sm text-gray-500 underline cursor-pointer bg-transparent border-none">
              נקה הכל
            </button>
          </div>

          {/* Groups */}
          <div className="mt-3 flex flex-col gap-4">
            {groupedProducts.map(group => {
              const groupAllSelected = group.products.every(p => selectedIds.has(p.id));
              const groupSomeSelected = group.products.some(p => selectedIds.has(p.id));
              return (
                <div key={group.groupId} className="border rounded p-4 bg-white">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-gray-500">
                      {group.products.filter(p => selectedIds.has(p.id)).length} מתוך {group.products.length}
                    </span>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold">{group.groupName}</h2>
                      <div
                        onClick={() => toggleGroup(group.products)}
                        style={{
                          width: 18, height: 18, borderRadius: 4, flexShrink: 0, cursor: 'pointer',
                          border: `2px solid ${groupAllSelected ? '#185FA5' : '#B4B2A9'}`,
                          background: groupAllSelected ? '#185FA5' : groupSomeSelected ? '#E6F1FB' : 'white',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        {groupAllSelected && (
                          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                            <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
                    {group.products.map(product => {
                      const isSelected = selectedIds.has(product.id);
                      return (
                        <div
                          key={product.id}
                          onClick={() => toggle(product.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '10px 14px', borderRadius: 8,
                            border: `1px solid ${isSelected ? '#185FA5' : '#E5E5E5'}`,
                            background: isSelected ? '#E6F1FB' : 'white',
                            cursor: 'pointer', transition: 'all 0.15s', userSelect: 'none',
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
                          <span style={{ fontSize: 13, fontWeight: isSelected ? 500 : 400, color: isSelected ? '#0C447C' : '#1A1A2E' }}>
                            {product.productName}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Save */}
          <div className="mt-4 flex justify-end items-center gap-3">
            {saved && <span className="text-sm text-green-600">✅ נשמר בהצלחה</span>}
            <Button text={saving ? "⏳ שומר..." : "שמור בחירה"} type="primary" onClick={save} disabled={saving} />
          </div>
        </>
      )}
    </div>
  );
}