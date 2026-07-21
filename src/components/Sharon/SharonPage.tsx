'use client';
// components/Sharon/SharonPage.tsx

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { collection, query, where, getDocs, limit, updateDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from '@/lib/firebase/AuthContext';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import { usePermission } from '@/hooks/usePermission';
import ElementaryTab from './tabs/ElementaryTab';
import TaxReturnsTab from './tabs/TaxReturnsTab';
import PensionTab from './tabs/PensionTab';
import './SharonPage.css';
import DocumentsModal from '@/components/DocumentsModal/DocumentsModal';
import { useToast } from '@/hooks/useToast';
import { ToastNotification } from '@/components/ToastNotification';

type TabKey = 'elementary' | 'tax' | 'pension_finance' | 'risk';

type CustomerResult = {
  id: string;
  IDCustomer: string;
  firstNameCustomer: string;
  lastNameCustomer: string;
  phone?: string;
};

const SharonPage: React.FC = () => {
  const { detail, user } = useAuth();
  const { agents, selectedAgentId, handleAgentChange } = useFetchAgentData();
  const { toasts, addToast, setToasts } = useToast();

  const { canAccess: canAccessTax } = usePermission(
    user ? 'access_sharon_tax_returns' : null
  );
  const { canAccess: canAccessElementary } = usePermission(
    user ? 'access_sharon_elementary' : null
  );
  const { canAccess: canAccessPension } = usePermission(
    user ? 'access_sharon_pension' : null
  );

  const [activeTab, setActiveTab] = useState<TabKey>(
    canAccessElementary ? 'elementary'
    : canAccessTax ? 'tax'
    : canAccessPension ? 'pension_finance'
    : 'elementary'
  );

  const [selectedCustomer, setSelectedCustomer] = useState<CustomerResult | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CustomerResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimeout = useRef<NodeJS.Timeout>();

  const effectiveAgentId = detail?.role === 'admin'
    ? selectedAgentId
    : detail?.agentId || '';

  // ─── Close dropdown on outside click ─────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ─── Search customers ─────────────────────────────────────────────────────
  const searchCustomers = useCallback(async (q: string) => {
    if (!effectiveAgentId || q.length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    setIsSearching(true);
    try {
      const byId = await getDocs(query(
        collection(db, 'customer'),
        where('AgentId', '==', effectiveAgentId),
        where('IDCustomer', '>=', q),
        where('IDCustomer', '<=', q + '\uf8ff'),
        limit(5)
      ));

      const byLastName = await getDocs(query(
        collection(db, 'customer'),
        where('AgentId', '==', effectiveAgentId),
        where('lastNameCustomer', '>=', q),
        where('lastNameCustomer', '<=', q + '\uf8ff'),
        limit(5)
      ));

      const byFirstName = await getDocs(query(
        collection(db, 'customer'),
        where('AgentId', '==', effectiveAgentId),
        where('firstNameCustomer', '>=', q),
        where('firstNameCustomer', '<=', q + '\uf8ff'),
        limit(5)
      ));

      const seen = new Set<string>();
      const results: CustomerResult[] = [];

      [...byId.docs, ...byLastName.docs, ...byFirstName.docs].forEach(d => {
        if (!seen.has(d.id)) {
          seen.add(d.id);
          const data = d.data();
          results.push({
            id: d.id,
            IDCustomer: data.IDCustomer,
            firstNameCustomer: data.firstNameCustomer,
            lastNameCustomer: data.lastNameCustomer,
            phone: data.phone,
          });
        }
      });

      setSearchResults(results.slice(0, 8));
      setShowDropdown(results.length > 0);
    } finally {
      setIsSearching(false);
    }
  }, [effectiveAgentId]);

  // ─── Debounced search ─────────────────────────────────────────────────────
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setSelectedCustomer(null);

    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      searchCustomers(value);
    }, 300);
  };

  const selectCustomer = (customer: CustomerResult) => {
    setSelectedCustomer(customer);
    setSearchQuery(`${customer.firstNameCustomer} ${customer.lastNameCustomer}`);
    setShowDropdown(false);
    setSearchResults([]);
  };

  const clearCustomer = () => {
    setSelectedCustomer(null);
    setSearchQuery('');
    setSearchResults([]);
    setShowDropdown(false);
  };

  // ─── מסמכי לקוח ─────────────────────────────────────────────────────────
  const [customerDocs, setCustomerDocs] = useState<any[]>([]);
  const [docsModalOpen, setDocsModalOpen] = useState(false);
  const [docsLoading, setDocsLoading] = useState(false);

  const openCustomerDocuments = async (customer: CustomerResult) => {
    setDocsModalOpen(true);
    setDocsLoading(true);
    setCustomerDocs([]);
    try {
      const snap = await getDocs(query(
        collection(db, 'customerDocuments'),
        where('customerId', '==', customer.id)
      ));
      const rows = await Promise.all(snap.docs.map(async d => {
        const data = d.data();
        let url = '';
        try {
          const { firebaseApp } = await import('@/lib/firebase/firebase');
          const { getStorage, ref, getDownloadURL } = await import('firebase/storage');
          const storage = getStorage(firebaseApp, `gs://${data.bucket}`);
          url = await getDownloadURL(ref(storage, data.storagePath));
        } catch {}
        return {
          id: d.id,
          fileName: data.fileName || 'מסמך',
          mimeType: data.mimeType || '',
          size: data.size || 0,
          url,
        };
      }));
      setCustomerDocs(rows);
    } catch (error) {
      console.error('שגיאה בטעינת מסמכי לקוח:', error);
      addToast('error', 'שגיאה בטעינת מסמכי הלקוח');
    } finally {
      setDocsLoading(false);
    }
  };

  const handleRenameCustomerDocument = async (docId: string, newName: string) => {
    try {
      await updateDoc(doc(db, 'customerDocuments', docId), { fileName: newName });
      setCustomerDocs(prev => prev.map(d => d.id === docId ? { ...d, fileName: newName } : d));
      addToast('success', 'שם המסמך עודכן');
    } catch (error) {
      console.error('שגיאה בשינוי שם המסמך:', error);
      addToast('error', 'שגיאה בשינוי שם המסמך');
    }
  };

  const handleUploadCustomerDocument = async (file: File) => {
    if (!selectedCustomer) return;

    try {
      const formData = new FormData();
      formData.append('customerId', selectedCustomer.id);
      formData.append('file', file);

      const res = await fetch('/api/customerDocuments/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await res.json();

      if (!result.ok) {
        addToast('error', result.error || 'שגיאה בהעלאת המסמך');
        return;
      }

      if (result.skipped) {
        addToast('warning', 'קובץ זהה כבר קיים ולא הועלה שוב');
        return;
      }

      const { firebaseApp } = await import('@/lib/firebase/firebase');
      const { getStorage, ref, getDownloadURL } = await import('firebase/storage');
      let url = '';
      try {
        const storage = getStorage(firebaseApp, `gs://${result.bucket}`);
        const storageRef = ref(storage, result.storagePath);
        url = await getDownloadURL(storageRef);
      } catch {}

      setCustomerDocs(prev => [...prev, {
        id: result.documentId,
        fileName: result.fileName,
        mimeType: file.type,
        size: file.size,
        url,
      }]);

      addToast('success', 'המסמך הועלה בהצלחה');
    } catch (error) {
      console.error('Failed to upload customer document', error);
      addToast('error', 'שגיאה בהעלאת המסמך');
    }
  };

const handleDeleteCustomerDocument = async (docId: string) => {
  try {
    const res = await fetch('/api/customerDocuments/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: docId }),
    });
    const result = await res.json();
    if (!result.ok) {
      addToast('error', result.error || 'שגיאה במחיקת המסמך');
      return;
    }
    setCustomerDocs(prev => prev.filter(d => d.id !== docId));
    addToast('success', 'המסמך נמחק');
  } catch (error) {
    console.error('Failed to delete customer document', error);
    addToast('error', 'שגיאה במחיקת המסמך');
  }
};


  return (
    <div className="sharon-page" dir="rtl">

      {/* ── TOPBAR ── */}
      <div className="sharon-topbar">
        <span className="sharon-topbar-title">עסקאות</span>

        {detail?.role === 'admin' && (
          <select value={selectedAgentId} onChange={handleAgentChange} className="select-input">
            <option value="">בחר סוכן</option>
            {agents.map((agent: any) => (
              <option key={agent.id} value={agent.id}>{agent.name}</option>
            ))}
          </select>
        )}

        {/* Search */}
        <div className="sharon-search-wrap" ref={searchRef}>
          <input
            type="text"
            placeholder="חיפוש לקוח לפי שם / ת&quot;ז..."
            value={searchQuery}
            onChange={e => handleSearchChange(e.target.value)}
            className={selectedCustomer ? 'sharon-search-input sharon-search-active' : 'sharon-search-input'}
          />
          {isSearching && (
            <span style={{ position: 'absolute', left: 28, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#888' }}>
              מחפש...
            </span>
          )}
          {(selectedCustomer || searchQuery) && (
            <button className="sharon-search-clear" onClick={clearCustomer}>✕</button>
          )}

          {/* Dropdown results */}
          {showDropdown && searchResults.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, left: 0,
              background: 'white', border: '1px solid #D3D1C7',
              borderRadius: '0 0 6px 6px', zIndex: 100,
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              maxHeight: 240, overflowY: 'auto',
            }}>
              {searchResults.map(c => (
                <div
                  key={c.id}
                  onClick={() => selectCustomer(c)}
                  style={{
                    padding: '8px 12px', cursor: 'pointer',
                    borderBottom: '1px solid #E8E6DF',
                    fontSize: 13,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F5F7FA')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'white')}
                >
                  <div style={{ fontWeight: 500 }}>
                    {c.firstNameCustomer} {c.lastNameCustomer}
                  </div>
                  <div style={{ fontSize: 11, color: '#888' }}>
                    ת&quot;ז: {c.IDCustomer}{c.phone ? ` · ${c.phone}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── CUSTOMER CARD ── */}
      {selectedCustomer && (
        <div className="sharon-customer-card">
          <div className="sharon-avatar">
            {selectedCustomer.firstNameCustomer[0]}{selectedCustomer.lastNameCustomer[0]}
          </div>
          <div>
            <div className="sharon-customer-name">
              {selectedCustomer.firstNameCustomer} {selectedCustomer.lastNameCustomer}
            </div>
            <div className="sharon-customer-sub">
              ת&quot;ז: {selectedCustomer.IDCustomer}
              {selectedCustomer.phone && ` · ${selectedCustomer.phone}`}
            </div>
          </div>
          <span className="sharon-customer-note">כל הטאבים מסוננים ללקוח זה</span>

          {/* ── כפתור מסמכים ── */}
          <button
            onClick={() => openCustomerDocuments(selectedCustomer)}
            style={{
              marginRight: 'auto', background: 'none', border: '1px solid #D3D1C7',
              borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
              fontSize: 13, color: '#185FA5', display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            📎 מסמכים
          </button>
        </div>
      )}

      {/* ── TABS ── */}
      <div className="sharon-tabs">
        {canAccessElementary && (
          <div
            className={`sharon-tab ${activeTab === 'elementary' ? 'active' : ''}`}
            onClick={() => setActiveTab('elementary')}
          >
            אלמנטרי
          </div>
        )}
        {canAccessTax && (
          <div
            className={`sharon-tab ${activeTab === 'tax' ? 'active' : ''}`}
            onClick={() => setActiveTab('tax')}
          >
            החזרי מס
          </div>
        )}
        {canAccessPension && (
          <div
            className={`sharon-tab ${activeTab === 'pension_finance' ? 'active' : ''}`}
            onClick={() => setActiveTab('pension_finance')}
          >
            פנסיה ופיננסים
          </div>
        )}
        {canAccessPension && (
          <div
            className={`sharon-tab ${activeTab === 'risk' ? 'active' : ''}`}
            onClick={() => setActiveTab('risk')}
          >
            סיכונים
          </div>
        )}
      </div>

      {/* ── TAB CONTENT ── */}
      <div className="sharon-tab-content">
        {activeTab === 'elementary' && canAccessElementary && (
          <ElementaryTab
            agentId={effectiveAgentId}
            customer={selectedCustomer}
            onSelectCustomer={selectCustomer}
            searchQuery={searchQuery}
          />
        )}
        {activeTab === 'tax' && canAccessTax && (
          <TaxReturnsTab
            agentId={effectiveAgentId}
            customer={selectedCustomer}
            onSelectCustomer={selectCustomer}
            searchQuery={searchQuery}
          />
        )}
        {activeTab === 'pension_finance' && canAccessPension && (
          <PensionTab
            agentId={effectiveAgentId}
            customer={selectedCustomer}
            onSelectCustomer={selectCustomer}
            includeGroupIds={['1', '4', '6']}
            dealFormContext="pension_finance"
          />
        )}
        {activeTab === 'risk' && canAccessPension && (
          <PensionTab
            agentId={effectiveAgentId}
            customer={selectedCustomer}
            onSelectCustomer={selectCustomer}
            excludeGroupIds={['1', '4', '6']}
            dealFormContext="risk"
          />
        )}
      </div>

      {/* ── מודל מסמכי לקוח ── */}
    <DocumentsModal
  open={docsModalOpen}
  title={selectedCustomer ? `${selectedCustomer.firstNameCustomer} ${selectedCustomer.lastNameCustomer}` : ''}
  documents={customerDocs}
  loading={docsLoading}
  onClose={() => setDocsModalOpen(false)}
  onRename={handleRenameCustomerDocument}
  onUpload={handleUploadCustomerDocument}
  onDelete={handleDeleteCustomerDocument}
/>
      {/* ── Toasts ── */}
      {toasts.length > 0 && toasts.map((toast) => (
        <ToastNotification
          key={toast.id}
          type={toast.type}
          className={toast.isHiding ? 'hide' : ''}
          message={toast.message}
          onClose={() => setToasts((prevToasts) => prevToasts.filter((t) => t.id !== toast.id))}
        />
      ))}
    </div>
  );
};

export default SharonPage;
