'use client';
// components/Sharon/SharonPage.tsx

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from '@/lib/firebase/AuthContext';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import { usePermission } from '@/hooks/usePermission';
import ElementaryTab from './tabs/ElementaryTab';
import TaxReturnsTab from './tabs/TaxReturnsTab';
import PensionTab from './tabs/PensionTab';
import './SharonPage.css';

type TabKey = 'elementary' | 'tax' | 'pension';

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

  const { canAccess: canAccessTax } = usePermission(
    user ? 'access_sharon_tax_returns' : null
  );

  const [activeTab, setActiveTab] = useState<TabKey>('elementary');
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
      // חיפוש לפי ת"ז (מתחיל ב...)
      const byId = await getDocs(query(
        collection(db, 'customer'),
        where('AgentId', '==', effectiveAgentId),
        where('IDCustomer', '>=', q),
        where('IDCustomer', '<=', q + '\uf8ff'),
        limit(5)
      ));

      // חיפוש לפי שם משפחה
      const byLastName = await getDocs(query(
        collection(db, 'customer'),
        where('AgentId', '==', effectiveAgentId),
        where('lastNameCustomer', '>=', q),
        where('lastNameCustomer', '<=', q + '\uf8ff'),
        limit(5)
      ));

      // חיפוש לפי שם פרטי
      const byFirstName = await getDocs(query(
        collection(db, 'customer'),
        where('AgentId', '==', effectiveAgentId),
        where('firstNameCustomer', '>=', q),
        where('firstNameCustomer', '<=', q + '\uf8ff'),
        limit(5)
      ));

      // מיזוג ללא כפילויות
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
        </div>
      )}

      {/* ── TABS ── */}
      <div className="sharon-tabs">
        <div
          className={`sharon-tab ${activeTab === 'elementary' ? 'active' : ''}`}
          onClick={() => setActiveTab('elementary')}
        >
          אלמנטרי
        </div>
        {canAccessTax && (
          <div
            className={`sharon-tab ${activeTab === 'tax' ? 'active' : ''}`}
            onClick={() => setActiveTab('tax')}
          >
            החזרי מס
          </div>
        )}
        <div
          className={`sharon-tab ${activeTab === 'pension' ? 'active' : ''}`}
          onClick={() => setActiveTab('pension')}
        >
          פנסיוני
        </div>
      </div>

      {/* ── TAB CONTENT ── */}
      <div className="sharon-tab-content">
        {activeTab === 'elementary' && (
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
        {activeTab === 'pension' && (
          <PensionTab
            agentId={effectiveAgentId}
            customer={selectedCustomer}
          />
        )}
      </div>
    </div>
  );
};

export default SharonPage;
