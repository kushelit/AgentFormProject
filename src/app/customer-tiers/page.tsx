'use client';

import { useEffect, useState, useMemo } from 'react';
import { httpsCallable } from 'firebase/functions';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db, functions } from '@/lib/firebase/firebase';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import { useAuth } from '@/lib/firebase/AuthContext';
import { useToast } from '@/hooks/useToast';
import { ToastNotification } from '@/components/ToastNotification';
import TableFooter from '@/components/TableFooter/TableFooter';
import './CustomerTiers.css';

type Tier = 'gold' | 'silver' | 'standard';
type SortColumn = 'customerName' | 'IDCustomer' | 'nifraimAmount' | 'currentTier' | 'proposedTier';
type SortOrder = 'asc' | 'desc';

interface TierRow {
  customerId: string;
  customerName: string;
  IDCustomer: string;
  parentID?: string;
  familySize: number;
  nifraimAmount: number;
  currentTier: Tier;
  proposedTier: Tier;
  changed: boolean;
}

interface CalcResult {
  month: string;
  thresholds: { gold: number; silver: number };
  totalCustomers: number;
  changedCount: number;
  rows: TierRow[];
}

const TIER_LABEL: Record<Tier, string> = {
  gold: 'זהב',
  silver: 'כסף',
  standard: 'רגיל',
};

const TIER_CLASS: Record<Tier, string> = {
  gold: 'ct-tier-gold',
  silver: 'ct-tier-silver',
  standard: 'ct-tier-standard',
};

function prevMonth() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

export default function CustomerTiersPage() {
  const { agents, selectedAgentId, handleAgentChange } = useFetchAgentData();
  const { detail } = useAuth();
  const { toasts, addToast, setToasts } = useToast();

  const [month, setMonth] = useState(prevMonth());
  const [lastCalculated, setLastCalculated] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CalcResult | null>(null);

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [showAll, setShowAll] = useState(false);
  const [applying, setApplying] = useState(false);

  // ── סינון ──
  const [nameFilter, setNameFilter] = useState('');
  const [idFilter, setIdFilter] = useState('');
  const [currentTierFilter, setCurrentTierFilter] = useState('');
  const [proposedTierFilter, setProposedTierFilter] = useState('');

  // ── מיון ──
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  // ── pagination ──
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  useEffect(() => {
    if (!selectedAgentId) return;

    const load = async () => {
      try {
        const q = query(
          collection(db, 'tierCalcRuns'),
          where('agentId', '==', selectedAgentId),
          orderBy('runAt', 'desc'),
          limit(1)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const last = snap.docs[0].data() as any;
          setLastCalculated(last.month);
          setMonth(last.month);
        } else {
          setLastCalculated(null);
        }
      } catch (err) {
        // אם אין index עדיין, ממשיכים עם ברירת המחדל
      }
    };

    load();
  }, [selectedAgentId]);

  const runCalculation = async () => {
    if (!selectedAgentId) {
      addToast('error', 'בחר סוכן');
      return;
    }
    if (!month) {
      addToast('error', 'בחר חודש לחישוב');
      return;
    }

    setLoading(true);
    setResult(null);
    setSelected({});
    setCurrentPage(1);
    setNameFilter('');
    setIdFilter('');
    setCurrentTierFilter('');
    setProposedTierFilter('');

    try {
      const fn = httpsCallable(functions, 'calculateCustomerTiers');
      const res: any = await fn({ agentId: selectedAgentId, month: month });
      const data = res.data as CalcResult;
      setResult(data);

      const initialSelected: Record<string, boolean> = {};
      data.rows.forEach(function (r) {
        if (r.changed) initialSelected[r.customerId] = true;
      });
      setSelected(initialSelected);
      setShowAll(false);

      if (data.changedCount === 0) {
        addToast('success', 'החישוב בוצע — אין שינויים מהדירוג הקיים');
      }
    } catch (e: any) {
      addToast('error', (e && e.message) || 'כשל בחישוב הדירוג');
    } finally {
      setLoading(false);
    }
  };

  const applyChanges = async () => {
    if (!result || !selectedAgentId) return;

    const approvedRows = result.rows
      .filter(function (r) { return selected[r.customerId]; })
      .map(function (r) {
        return {
          customerId: r.customerId,
          proposedTier: r.proposedTier,
          nifraimAmount: r.nifraimAmount,
        };
      });

    if (approvedRows.length === 0) {
      addToast('error', 'לא נבחרו שורות לאישור');
      return;
    }

    setApplying(true);

    try {
      const fn = httpsCallable(functions, 'applyCustomerTiers');
      const res: any = await fn({
        agentId: selectedAgentId,
        month: result.month,
        approvedRows: approvedRows,
      });
      addToast('success', 'עודכנו ' + res.data.updated + ' לקוחות בהצלחה');
      setLastCalculated(result.month);
      setResult(null);
      setSelected({});
    } catch (e: any) {
      addToast('error', (e && e.message) || 'כשל בעדכון הדירוג');
    } finally {
      setApplying(false);
    }
  };

  // ── שורות אחרי "שינויים בלבד / הכל" ──
  const baseRows = useMemo(() => {
    if (!result) return [];
    return showAll ? result.rows : result.rows.filter(function (r) { return r.changed; });
  }, [result, showAll]);

  // ── שורות אחרי סינון ──
  const filteredRows = useMemo(() => {
    return baseRows.filter((r) => {
      const nameOk = !nameFilter || r.customerName.toLowerCase().includes(nameFilter.toLowerCase().trim());
      const idOk = !idFilter || r.IDCustomer.includes(idFilter.trim());
      const currOk = !currentTierFilter || r.currentTier === currentTierFilter;
      const propOk = !proposedTierFilter || r.proposedTier === proposedTierFilter;
      return nameOk && idOk && currOk && propOk;
    });
  }, [baseRows, nameFilter, idFilter, currentTierFilter, proposedTierFilter]);

  // ── מיון ──
  const sortedRows = useMemo(() => {
    if (!sortColumn) return filteredRows;
    const arr = [...filteredRows];
    arr.sort((a, b) => {
      let av: string | number = a[sortColumn];
      let bv: string | number = b[sortColumn];
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av < bv) return sortOrder === 'asc' ? -1 : 1;
      if (av > bv) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filteredRows, sortColumn, sortOrder]);

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortOrder('asc');
    }
  };

  // ── reset לעמוד 1 כשמסננים ──
  useEffect(() => {
    setCurrentPage(1);
  }, [nameFilter, idFilter, currentTierFilter, proposedTierFilter, showAll]);

  // ── pagination בפועל ──
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / rowsPerPage));
  const indexOfLastRow = currentPage * rowsPerPage;
  const indexOfFirstRow = indexOfLastRow - rowsPerPage;
  const currentRows = sortedRows.slice(indexOfFirstRow, indexOfLastRow);

  const toggleRow = (id: string) => {
    setSelected(function (prev) {
      const next = { ...prev };
      next[id] = !prev[id];
      return next;
    });
  };

  // "בחר הכל" פועל על כל השורות המסוננות (לא רק העמוד הנוכחי)
  const toggleAllFiltered = (checked: boolean) => {
    setSelected(function (prev) {
      const upd = { ...prev };
      sortedRows.forEach(function (r) {
        upd[r.customerId] = checked;
      });
      return upd;
    });
  };

  const selectedCount = Object.keys(selected).filter(function (k) { return selected[k]; }).length;
  const allFilteredSelected = sortedRows.length > 0 && sortedRows.every((r) => selected[r.customerId]);

  const sortArrow = (col: SortColumn) => {
    if (sortColumn !== col) return '';
    return sortOrder === 'asc' ? ' ▲' : ' ▼';
  };

  return (
    <div className="ct-page" dir="rtl">
      <div className="ct-header">
        <div>
          <div className="ct-title">חישוב דירוג לקוחות</div>
          <div className="ct-subtitle">
            {lastCalculated ? ('חודש אחרון שחושב: ' + lastCalculated) : 'לא בוצע חישוב עדיין לסוכן זה'}
          </div>
        </div>
      </div>

      <div className="ct-controls">
        {detail && detail.role === 'admin' ? (
          <div className="ct-field">
            <label className="ct-label">סוכן</label>
            <select className="select-input" value={selectedAgentId} onChange={handleAgentChange}>
              <option value="">בחר סוכן</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="ct-field">
          <label className="ct-label">חודש לחישוב</label>
          <input
            type="month"
            className="input"
            value={month}
            onChange={function (e) { setMonth(e.target.value); }}
          />
        </div>

        <button className="ct-btn-calc" onClick={runCalculation} disabled={loading || !selectedAgentId}>
          {loading ? 'מחשב...' : 'חשב דירוג מטעינה'}
        </button>
      </div>

      {result ? (
        <div className="ct-results">
          <div className="ct-results-bar">
            <div className="ct-results-summary">
              <span>{result.totalCustomers} לקוחות נבדקו</span>
              <span className="ct-dot">·</span>
              <span className={result.changedCount > 0 ? 'ct-changed-count' : ''}>
                {result.changedCount} שינויים מהדירוג הקיים
              </span>
              <span className="ct-dot">·</span>
              <span>{sortedRows.length} מוצגים</span>
            </div>
            <label className="ct-show-all-toggle">
              <input
                type="checkbox"
                checked={showAll}
                onChange={function (e) { setShowAll(e.target.checked); }}
              />
              הצג את כל הלקוחות (גם ללא שינוי)
            </label>
          </div>

          {/* ── שורת סינון ── */}
          <div className="filter-inputs-container">
            <div className="filter-select-container">
              <input
                className="filter-input"
                type="text"
                placeholder="שם לקוח"
                value={nameFilter}
                onChange={(e) => setNameFilter(e.target.value)}
              />
            </div>
            <div className="filter-select-container">
              <input
                className="filter-input"
                type="text"
                placeholder="תז לקוח"
                value={idFilter}
                onChange={(e) => setIdFilter(e.target.value)}
              />
            </div>
            <div className="filter-select-container">
              <select
                className="select-input"
                value={currentTierFilter}
                onChange={(e) => setCurrentTierFilter(e.target.value)}
              >
                <option value="">דירוג קיים — הכל</option>
                <option value="gold">זהב</option>
                <option value="silver">כסף</option>
                <option value="standard">רגיל</option>
              </select>
            </div>
            <div className="filter-select-container">
              <select
                className="select-input"
                value={proposedTierFilter}
                onChange={(e) => setProposedTierFilter(e.target.value)}
              >
                <option value="">דירוג מוצע — הכל</option>
                <option value="gold">זהב</option>
                <option value="silver">כסף</option>
                <option value="standard">רגיל</option>
              </select>
            </div>
          </div>

          {sortedRows.length === 0 ? (
            <div className="ct-empty">
              {showAll ? 'לא נמצאו לקוחות התואמים לסינון' : 'אין שינויים להצגה — לחצי על "הצג את כל הלקוחות" לראות את כולם'}
            </div>
          ) : (
            <div>
              <table>
                <thead>
                  <tr>
                    <th className="ct-th-check">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={function (e) { toggleAllFiltered(e.target.checked); }}
                        title="בחר/בטל הכל (לפי הסינון הנוכחי)"
                      />
                    </th>
                    <th onClick={() => handleSort('customerName')} style={{ cursor: 'pointer' }}>
                      לקוח{sortArrow('customerName')}
                    </th>
                    <th onClick={() => handleSort('IDCustomer')} style={{ cursor: 'pointer' }}>
                      תז{sortArrow('IDCustomer')}
                    </th>
                    <th onClick={() => handleSort('nifraimAmount')} style={{ cursor: 'pointer' }}>
                      נפרעים (משוקלל){sortArrow('nifraimAmount')}
                    </th>
                    <th onClick={() => handleSort('currentTier')} style={{ cursor: 'pointer' }}>
                      דירוג קיים{sortArrow('currentTier')}
                    </th>
                    <th onClick={() => handleSort('proposedTier')} style={{ cursor: 'pointer' }}>
                      דירוג מוצע{sortArrow('proposedTier')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {currentRows.map((r) => (
                    <tr key={r.customerId} className={r.changed ? 'ct-row-changed' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          checked={!!selected[r.customerId]}
                          onChange={function () { toggleRow(r.customerId); }}
                        />
                      </td>
                      <td>{r.customerName}</td>
                      <td>{r.IDCustomer}</td>
                      <td>{r.nifraimAmount.toLocaleString()} ₪</td>
                      <td>
                        <span className={'ct-tier-badge ' + TIER_CLASS[r.currentTier]}>
                          {TIER_LABEL[r.currentTier]}
                        </span>
                      </td>
                      <td>
                        <span className={'ct-tier-badge ' + TIER_CLASS[r.proposedTier]}>
                          {TIER_LABEL[r.proposedTier]}
                        </span>
                        {r.changed ? <span className="ct-change-arrow"> ← שינוי</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <TableFooter
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={setRowsPerPage}
              />

              <div className="ct-apply-bar">
                <span>{selectedCount} שורות מסומנות לאישור</span>
                <button className="ct-btn-apply" onClick={applyChanges} disabled={applying || selectedCount === 0}>
                  {applying ? 'מעדכן...' : ('אשר ועדכן ' + selectedCount + ' לקוחות')}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {toasts.map((t) => (
        <ToastNotification
          key={t.id}
          type={t.type}
          message={t.message}
          className={t.isHiding ? 'hide' : ''}
          onClose={function () {
            setToasts(function (prev) { return prev.filter(function (x) { return x.id !== t.id; }); });
          }}
        />
      ))}
    </div>
  );
}
