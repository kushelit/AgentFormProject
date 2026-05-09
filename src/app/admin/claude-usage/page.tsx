'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, query, orderBy, Timestamp } from 'firebase/firestore';
import AdminGuard from '@/app/admin/_components/AdminGuard';

// ─── Types ────────────────────────────────────────────────────

interface PolicyUsageLog {
  id: string;
  agentUid: string;
  agentEmail: string;
  insuredName: string | null;
  policyNumber: string | null;
  companyName: string | null;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  model: string;
  fileName: string;
  parseConfidence: 'high' | 'medium' | 'low';
  timestamp: Timestamp | null;
}

interface AgentStats {
  email: string;
  uid: string;
  policies: number;
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  highConfidenceCount: number;
  lastActivity: Date | null;
  logs: PolicyUsageLog[];
}

// ─── Helpers ──────────────────────────────────────────────────

function confidenceBadge(c: string) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    high:   { bg: '#EAF3DE', color: '#3B6D11', label: 'גבוה' },
    medium: { bg: '#FAEEDA', color: '#854F0B', label: 'בינוני' },
    low:    { bg: '#FCEBEB', color: '#A32D2D', label: 'נמוך' },
  };
  const s = map[c] || map['medium'];
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
      {s.label}
    </span>
  );
}

function formatDate(d: Date | null) {
  if (!d) return '—';
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatDateShort(d: Date | null) {
  if (!d) return '—';
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// ─── Main Page ────────────────────────────────────────────────

export default function ClaudeUsageAdminPage() {
  const [logs, setLogs] = useState<PolicyUsageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  // פילטרים
  const [monthFilter, setMonthFilter] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [confidenceFilter, setConfidenceFilter] = useState('');

  // ─── Fetch ────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'policy_usage_logs'), orderBy('timestamp', 'desc'))
        );
        const data: PolicyUsageLog[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<PolicyUsageLog, 'id'>),
        }));
        setLogs(data);
      } catch (e) {
        console.error('ClaudeUsage fetch error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ─── Filter ───────────────────────────────────────────────

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (agentFilter && !log.agentEmail.toLowerCase().includes(agentFilter.toLowerCase())) return false;
      if (confidenceFilter && log.parseConfidence !== confidenceFilter) return false;
      if (monthFilter && log.timestamp) {
        const d = log.timestamp.toDate();
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (ym !== monthFilter) return false;
      }
      return true;
    });
  }, [logs, agentFilter, monthFilter, confidenceFilter]);

  // ─── Aggregate by agent ───────────────────────────────────

  const agentStats = useMemo(() => {
    const map = new Map<string, AgentStats>();
    for (const log of filteredLogs) {
      const key = log.agentEmail;
      if (!map.has(key)) {
        map.set(key, {
          email: key,
          uid: log.agentUid,
          policies: 0,
          totalCost: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          highConfidenceCount: 0,
          lastActivity: null,
          logs: [],
        });
      }
      const s = map.get(key)!;
      s.policies++;
      s.totalCost += log.estimatedCostUsd;
      s.totalInputTokens += log.inputTokens;
      s.totalOutputTokens += log.outputTokens;
      if (log.parseConfidence === 'high') s.highConfidenceCount++;
      const ts = log.timestamp ? log.timestamp.toDate() : null;
      if (ts && (!s.lastActivity || ts > s.lastActivity)) s.lastActivity = ts;
      s.logs.push(log);
    }
    return Array.from(map.values()).sort((a, b) => b.totalCost - a.totalCost);
  }, [filteredLogs]);

  // ─── Totals ───────────────────────────────────────────────

  const totals = useMemo(() => ({
    agents: agentStats.length,
    policies: filteredLogs.length,
    cost: filteredLogs.reduce((s, r) => s + r.estimatedCostUsd, 0),
    avgCost: filteredLogs.length ? filteredLogs.reduce((s, r) => s + r.estimatedCostUsd, 0) / filteredLogs.length : 0,
    lowConfidence: filteredLogs.filter(r => r.parseConfidence === 'low'),
  }), [filteredLogs, agentStats]);

  // ─── Unique months for filter ─────────────────────────────

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    logs.forEach(log => {
      if (log.timestamp) {
        const d = log.timestamp.toDate();
        months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      }
    });
    return Array.from(months).sort().reverse();
  }, [logs]);

  // ─── Render ───────────────────────────────────────────────

  return (
    <AdminGuard>
      <div dir="rtl" style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto', fontFamily: 'inherit' }}>

        {/* כותרת */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, color: '#0f172a' }}>
            ניטור שימוש Claude API
          </h1>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
            עלויות ניתוח פוליסות PDF לפי סוכן
          </p>
        </div>

        {/* כרטיסי סיכום */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'סוכנים פעילים', value: totals.agents },
            { label: 'פוליסות נותחו', value: totals.policies },
            { label: 'עלות כוללת', value: `$${totals.cost.toFixed(3)}` },
            { label: 'ממוצע לפוליסה', value: `$${totals.avgCost.toFixed(4)}` },
            { label: 'Confidence נמוך', value: totals.lowConfidence.length, warn: totals.lowConfidence.length > 0 },
          ].map((c) => (
            <div key={c.label} style={{
              background: c.warn ? '#FAEEDA' : '#f8fafc',
              border: `1px solid ${c.warn ? '#fcd34d' : '#e2e8f0'}`,
              borderRadius: 10, padding: '14px 16px',
            }}>
              <p style={{ fontSize: 12, color: c.warn ? '#92400e' : '#64748b', margin: '0 0 6px', fontWeight: 500 }}>{c.label}</p>
              <p style={{ fontSize: 22, fontWeight: 600, margin: 0, color: c.warn ? '#92400e' : '#0f172a' }}>{c.value}</p>
            </div>
          ))}
        </div>

        {/* התראה confidence נמוך */}
        {totals.lowConfidence.length > 0 && (
          <div style={{
            background: '#FAEEDA', border: '1px solid #fcd34d', borderRadius: 10,
            padding: '10px 16px', marginBottom: 20, fontSize: 13, color: '#92400e',
          }}>
            <span style={{ fontWeight: 600 }}>⚠️ {totals.lowConfidence.length} פוליסות עם confidence נמוך — מומלץ לבדוק ידנית: </span>
            {totals.lowConfidence.map(r => r.policyNumber).join(', ')}
          </div>
        )}

        {/* פילטרים */}
        <div style={{
          background: 'white', border: '1px solid #e2e8f0', borderRadius: 12,
          padding: '16px 20px', marginBottom: 20,
          display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end',
        }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: '#64748b', display: 'block', marginBottom: 4 }}>חודש</label>
            <select
              value={monthFilter}
              onChange={e => setMonthFilter(e.target.value)}
              style={{ fontSize: 13, padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', minWidth: 140 }}
            >
              <option value="">כל התקופה</option>
              {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: '#64748b', display: 'block', marginBottom: 4 }}>סוכן</label>
            <input
              value={agentFilter}
              onChange={e => setAgentFilter(e.target.value)}
              placeholder="חיפוש לפי אימייל..."
              style={{ fontSize: 13, padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', minWidth: 200 }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: '#64748b', display: 'block', marginBottom: 4 }}>Confidence</label>
            <select
              value={confidenceFilter}
              onChange={e => setConfidenceFilter(e.target.value)}
              style={{ fontSize: 13, padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0' }}
            >
              <option value="">הכל</option>
              <option value="high">גבוה</option>
              <option value="medium">בינוני</option>
              <option value="low">נמוך</option>
            </select>
          </div>
          {(monthFilter || agentFilter || confidenceFilter) && (
            <button
              onClick={() => { setMonthFilter(''); setAgentFilter(''); setConfidenceFilter(''); }}
              style={{ fontSize: 13, padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', color: '#64748b' }}
            >
              נקה פילטרים
            </button>
          )}
        </div>

        {/* טבלת סוכנים */}
        {loading ? (
          <p style={{ color: '#64748b', textAlign: 'center', padding: 40 }}>טוען נתונים...</p>
        ) : agentStats.length === 0 ? (
          <p style={{ color: '#64748b', textAlign: 'center', padding: 40 }}>לא נמצאו רשומות</p>
        ) : (
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>פירוט לפי סוכן</p>
              <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>{agentStats.length} סוכנים, {filteredLogs.length} פוליסות</p>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['סוכן', 'פוליסות', 'טוקנים input', 'עלות כוללת', 'ממוצע לפוליסה', 'Confidence גבוה', 'פעילות אחרונה', ''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 500, color: '#64748b', whiteSpace: 'nowrap', borderBottom: '1px solid #e2e8f0' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {agentStats.map((agent, i) => {
                  const isExpanded = expandedAgent === agent.email;
                  const highPct = Math.round((agent.highConfidenceCount / agent.policies) * 100);
                  return (
                    <React.Fragment key={agent.email}>
                      <tr style={{ borderTop: '1px solid #f1f5f9', background: i === 0 ? '#f8fafc' : 'white' }}>
                        <td style={{ padding: '12px 14px' }}>
                          <p style={{ margin: 0, fontWeight: 500 }}>{agent.email}</p>
                          {i === 0 && <p style={{ margin: '2px 0 0', fontSize: 11, color: '#0ea5e9' }}>הכי פעיל</p>}
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: 600 }}>{agent.policies}</td>
                        <td style={{ padding: '12px 14px', color: '#64748b' }}>{agent.totalInputTokens.toLocaleString()}</td>
                        <td style={{ padding: '12px 14px', fontWeight: 600 }}>${agent.totalCost.toFixed(3)}</td>
                        <td style={{ padding: '12px 14px' }}>${(agent.totalCost / agent.policies).toFixed(4)}</td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{
                            color: highPct >= 80 ? '#16a34a' : highPct >= 50 ? '#854f0b' : '#a32d2d',
                            fontWeight: 600,
                          }}>{highPct}%</span>
                        </td>
                        <td style={{ padding: '12px 14px', color: '#64748b', fontSize: 12 }}>{formatDate(agent.lastActivity)}</td>
                        <td style={{ padding: '12px 14px' }}>
                          <button
                            onClick={() => setExpandedAgent(isExpanded ? null : agent.email)}
                            style={{ fontSize: 12, color: '#0ea5e9', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}
                          >
                            {isExpanded ? 'סגור ▲' : 'פרטים ▼'}
                          </button>
                        </td>
                      </tr>

                      {/* שורות פוליסה מפורטות */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={8} style={{ padding: 0, background: '#f8fafc' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                              <thead>
                                <tr style={{ background: '#f1f5f9' }}>
                                  {['תאריך', 'מבוטח', 'פוליסה', 'חברה', 'קובץ', 'Input tokens', 'Output tokens', 'עלות', 'Confidence'].map(h => (
                                    <th key={h} style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 500, color: '#64748b', whiteSpace: 'nowrap' }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {agent.logs.map(log => (
                                  <tr key={log.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                                    <td style={{ padding: '8px 14px', color: '#64748b' }}>
                                      {log.timestamp ? formatDateShort(log.timestamp.toDate()) : '—'}
                                    </td>
                                    <td style={{ padding: '8px 14px', fontWeight: 500 }}>{log.insuredName || '—'}</td>
                                    <td style={{ padding: '8px 14px', fontFamily: 'monospace' }}>{log.policyNumber || '—'}</td>
                                    <td style={{ padding: '8px 14px' }}>{log.companyName || '—'}</td>
                                    <td style={{ padding: '8px 14px', color: '#64748b', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.fileName}</td>
                                    <td style={{ padding: '8px 14px' }}>{log.inputTokens.toLocaleString()}</td>
                                    <td style={{ padding: '8px 14px' }}>{log.outputTokens.toLocaleString()}</td>
                                    <td style={{ padding: '8px 14px', fontWeight: 500 }}>${log.estimatedCostUsd.toFixed(4)}</td>
                                    <td style={{ padding: '8px 14px' }}>{confidenceBadge(log.parseConfidence)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminGuard>
  );
}
