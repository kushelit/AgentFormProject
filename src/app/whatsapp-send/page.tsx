'use client';

import { Suspense, useCallback, useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/firebase";
import { useAuth } from "@/lib/firebase/AuthContext";
import AccessDenied from "@/components/AccessDenied";
import { usePermission } from "@/hooks/usePermission";
import { Button } from "@/components/Button/Button";
import { ToastNotification } from "@/components/ToastNotification";
import { useToast } from "@/hooks/useToast";

type LeadStatus = "pending" | "sent" | "booked" | "declined" | "no_response";

interface Lead {
  surenseId: string;
  fullName: string;
  phone: string;
  lastActivityDate: string;
  status: LeadStatus;
  waSentAt: number | null;
  updatedAt: number | null;
}

type Tab = "pending" | "sent" | "resolved" | "all";

const STATUS_LABELS: Record<LeadStatus, string> = {
  pending: "ממתין לשליחה",
  sent: "נשלח - ממתין לתגובה",
  booked: "נקבעה פגישה",
  declined: "סירב",
  no_response: "לא ענה",
};

const STATUS_COLORS: Record<LeadStatus, string> = {
  pending: "bg-gray-100 text-gray-700",
  sent: "bg-amber-100 text-amber-800",
  booked: "bg-green-100 text-green-800",
  declined: "bg-red-100 text-red-700",
  no_response: "bg-gray-200 text-gray-600",
};

// "972526582656" / "0526582656" -> "052-6582656"
const formatPhoneNumber = (phone: string): string => {
  if (!phone) return "-";
  const digits = phone.replace(/\D/g, "");
  let local = digits;
  if (local.startsWith("972")) local = "0" + local.slice(3);
  else if (!local.startsWith("0")) local = "0" + local;
  return local.replace(/(\d{3})(\d+)/, "$1-$2");
};

// "2025-04-29T05:11:48Z" -> "29/04/2025"
const formatDateOnly = (iso: string): string => {
  if (!iso) return "-";
  const datePart = iso.split("T")[0];
  const [y, m, d] = datePart.split("-");
  if (y && m && d) return `${d}/${m}/${y}`;
  return datePart;
};

// timestamp (ms) -> "29/04/2025"
const formatMsDateOnly = (ms: number | null): string => {
  if (!ms) return "-";
  const date = new Date(ms);
  return date.toLocaleDateString("he-IL");
};

const WhatsAppSendPage = () => {
  const { user, isLoading, detail } = useAuth();
  const [ready, setReady] = useState(false);
  const [isClient, setIsClient] = useState(false);

  const { canAccess, isChecking } = usePermission(
    user ? "access_send_whatsapp_template" : null
  );

  const { toasts, addToast, setToasts } = useToast();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [autoPickCount, setAutoPickCount] = useState<number>(10);
  const [sending, setSending] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("pending");

  useEffect(() => {
    setIsClient(true);
    const timer = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(timer);
  }, []);

  const loadLeads = useCallback(async () => {
    setLoadingLeads(true);
    setLoadError(null);
    try {
      const fn = httpsCallable(functions, "getReengagementLeads");
      const result: any = await fn({});
      setLeads(result.data.leads ?? []);
      setStats(result.data.stats ?? {});
    } catch (e: any) {
      setLoadError(e.message ?? "שגיאה בטעינת הלידים");
    } finally {
      setLoadingLeads(false);
    }
  }, []);

  useEffect(() => {
    if (isClient && ready && user && detail && canAccess) {
      loadLeads();
    }
  }, [isClient, ready, user, detail, canAccess, loadLeads]);

  if (!isClient) return null;

  if (isLoading || isChecking || !ready || !user || !detail) {
    return <div className="p-4 text-gray-600">⏳ טוען מידע...</div>;
  }

  if (!user) {
    return (
      <div className="text-custom-white px-4 py-2 rounded-lg">
        נדרש להתחבר למערכת כדי לגשת לדף זה.
      </div>
    );
  }

  if (!canAccess) {
    return <AccessDenied />;
  }

  const pendingLeads = leads.filter((l) => l.status === "pending");
  const sentLeads = leads.filter((l) => l.status === "sent");
  const resolvedLeads = leads.filter((l) =>
    l.status === "booked" || l.status === "declined" || l.status === "no_response"
  );

  const visibleLeads =
    activeTab === "pending" ? pendingLeads :
    activeTab === "sent" ? sentLeads :
    activeTab === "resolved" ? resolvedLeads :
    leads;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const autoSelect = () => {
    const n = Math.max(0, Math.min(autoPickCount, pendingLeads.length));
    const ids = pendingLeads.slice(0, n).map((l) => l.surenseId);
    setSelectedIds(new Set(ids));
    setActiveTab("pending");
  };

  const clearSelection = () => setSelectedIds(new Set());

  const onSendSelected = async () => {
    if (sending || selectedIds.size === 0) return;
    setSending(true);
    try {
      const fn = httpsCallable(functions, "sendReengagementBatch");
      const result: any = await fn({ leadIds: Array.from(selectedIds) });
      const { sent, failed } = result.data ?? {};
      if (failed > 0) {
        addToast("error", `נשלח בהצלחה: ${sent ?? 0} | נכשל: ${failed}`);
      } else {
        addToast("success", `נשלח בהצלחה ל-${sent ?? 0} לקוחות`);
      }
      clearSelection();
      await loadLeads();
    } catch (e: any) {
      addToast("error", `שגיאה בשליחה: ${e.message}`);
    } finally {
      setSending(false);
    }
  };

  const onUpdateStatus = async (surenseId: string, status: LeadStatus) => {
    if (updatingId) return;
    setUpdatingId(surenseId);
    try {
      const fn = httpsCallable(functions, "updateReengagementLeadStatus");
      await fn({ surenseId, status });
      setLeads((prev) =>
        prev.map((l) => (l.surenseId === surenseId ? { ...l, status } : l))
      );
      addToast("success", `הסטטוס עודכן ל"${STATUS_LABELS[status]}"`);
    } catch (e: any) {
      addToast("error", `שגיאה בעדכון סטטוס: ${e.message}`);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div className="p-6 max-w-6xl mx-auto text-right">
        <h1 className="text-2xl font-bold mb-4">ניהול קמפיין יצירת קשר חוזר</h1>

        {loadError && (
          <div className="bg-red-50 text-red-700 border border-red-200 rounded p-3 mb-4">
            {loadError}
          </div>
        )}

        {/* כרטיסי סטטיסטיקה */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <StatCard label="ממתינים לשליחה" value={stats.pending ?? 0} color="bg-gray-50 text-gray-800" />
          <StatCard label="בטיפול (ממתין לתגובה)" value={stats.sent ?? 0} color="bg-amber-50 text-amber-800" />
          <StatCard label="נקבעו פגישות" value={stats.booked ?? 0} color="bg-green-50 text-green-800" />
          <StatCard label="לא ענו" value={stats.no_response ?? 0} color="bg-gray-50 text-gray-600" />
          <StatCard label="סירבו" value={stats.declined ?? 0} color="bg-red-50 text-red-700" />
        </div>

        {/* בקרת בחירה ושליחה */}
        <div className="border rounded p-4 bg-white mb-4 flex flex-wrap items-center gap-3">
          <label className="text-sm text-gray-700">
            בחר אוטומטית
            <input
              type="number"
              min={1}
              max={pendingLeads.length || 1}
              value={autoPickCount}
              onChange={(e) => setAutoPickCount(Number(e.target.value))}
              className="w-16 mx-2 border rounded px-2 py-1 text-center"
            />
            מתוך {pendingLeads.length} ממתינים
          </label>

          <Button text="בחר" type="secondary" onClick={autoSelect} disabled={pendingLeads.length === 0} />

          <span className="text-sm text-gray-500">נבחרו: {selectedIds.size}</span>

          {selectedIds.size > 0 && (
            <Button text="נקה בחירה" type="secondary" onClick={clearSelection} />
          )}

          <div className="flex-1" />

          <Button
            text={sending ? "⏳ שולח..." : `שלח לנבחרים (${selectedIds.size})`}
            type="primary"
            onClick={onSendSelected}
            disabled={sending || selectedIds.size === 0}
          />

          <Button text="🔄 רענן" type="secondary" onClick={loadLeads} disabled={loadingLeads} />
        </div>

        {/* טאבים */}
        <div className="flex gap-2 mb-3 border-b">
          <TabButton label={`ממתינים (${pendingLeads.length})`} active={activeTab === "pending"} onClick={() => setActiveTab("pending")} />
          <TabButton label={`נשלח - ממתין לתגובה (${sentLeads.length})`} active={activeTab === "sent"} onClick={() => setActiveTab("sent")} />
          <TabButton label={`נסגר (${resolvedLeads.length})`} active={activeTab === "resolved"} onClick={() => setActiveTab("resolved")} />
          <TabButton label={`הכל (${leads.length})`} active={activeTab === "all"} onClick={() => setActiveTab("all")} />
        </div>

        {/* טבלה */}
        <div className="border rounded bg-white overflow-x-auto">
          {loadingLeads ? (
            <div className="p-6 text-center text-gray-500">⏳ טוען לידים...</div>
          ) : visibleLeads.length === 0 ? (
            <div className="p-6 text-center text-gray-500">אין לידים להצגה בטאב הזה</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="p-2 w-8"></th>
                  <th className="p-2 text-right">שם</th>
                  <th className="p-2 text-right">טלפון</th>
                  <th className="p-2 text-right">פנייה אחרונה</th>
                  <th className="p-2 text-right">סטטוס</th>
                  <th className="p-2 text-right">נשלח בתאריך</th>
                  <th className="p-2 text-right">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {visibleLeads.map((lead) => (
                  <tr key={lead.surenseId} className="border-t hover:bg-gray-50">
                    <td className="p-2">
                      {lead.status === "pending" && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(lead.surenseId)}
                          onChange={() => toggleSelect(lead.surenseId)}
                        />
                      )}
                    </td>
                    <td className="p-2">{lead.fullName || "-"}</td>
                    <td className="p-2" dir="ltr">{formatPhoneNumber(lead.phone)}</td>
                    <td className="p-2">{formatDateOnly(lead.lastActivityDate)}</td>
                    <td className="p-2">
                      <span className={`px-2 py-1 rounded text-xs ${STATUS_COLORS[lead.status]}`}>
                        {STATUS_LABELS[lead.status]}
                      </span>
                    </td>
                    <td className="p-2">{formatMsDateOnly(lead.waSentAt)}</td>
                    <td className="p-2">
                      {lead.status === "sent" && (
                        <div className="flex gap-1 flex-wrap">
                          <button
                            className="text-xs px-2 py-1 rounded bg-green-100 text-green-800 hover:bg-green-200 disabled:opacity-50"
                            disabled={updatingId === lead.surenseId}
                            onClick={() => onUpdateStatus(lead.surenseId, "booked")}
                          >
                            נקבעה פגישה
                          </button>
                          <button
                            className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50"
                            disabled={updatingId === lead.surenseId}
                            onClick={() => onUpdateStatus(lead.surenseId, "no_response")}
                          >
                            לא ענה
                          </button>
                          <button
                            className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
                            disabled={updatingId === lead.surenseId}
                            onClick={() => onUpdateStatus(lead.surenseId, "declined")}
                          >
                            סירב
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {toasts.length > 0 && toasts.map((toast) => (
        <ToastNotification
          key={toast.id}
          type={toast.type}
          className={toast.isHiding ? "hide" : ""}
          message={toast.message}
          onClose={() => setToasts((prevToasts) => prevToasts.filter((t) => t.id !== toast.id))}
        />
      ))}
    </Suspense>
  );
};

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded p-3 ${color}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs mt-1">{label}</div>
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-sm border-b-2 ${
        active ? "border-blue-600 text-blue-600 font-medium" : "border-transparent text-gray-500 hover:text-gray-700"
      }`}
    >
      {label}
    </button>
  );
}

export default WhatsAppSendPage;