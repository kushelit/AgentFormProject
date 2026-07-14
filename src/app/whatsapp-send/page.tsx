'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { db, functions } from "@/lib/firebase/firebase";
import { useAuth } from "@/lib/firebase/AuthContext";
import AccessDenied from "@/components/AccessDenied";
import { usePermission } from "@/hooks/usePermission";
import { Button } from "@/components/Button/Button";
import { ToastNotification } from "@/components/ToastNotification";
import { useToast } from "@/hooks/useToast";

type LeadStatus =
  | "pending"
  | "sent"
  | "accepted"
  | "delivered"
  | "read"
  | "booked"
  | "declined"
  | "interested"
  | "failed"
  | "no_response";

interface Lead {
  surenseId: string;
  fullName: string;
  phone: string;
  email?: string | null;
  lastActivityDate: string;
  status: LeadStatus;

  waSentAt: number | null;
  updatedAt: number | null;

  surenseStatusName: string | null;
  surenseStatusActive: boolean | null;

  interestStatus?: string;
  bookingStatus?: string;

  bookingLink?: string | null;
  bookingAppointmentId?: string | null;

  bookingCustomerName?: string | null;
  bookingCustomerEmail?: string | null;
  bookingCustomerPhone?: string | null;

  bookingServiceId?: string | null;
  bookingServiceName?: string | null;

  bookingStartAt?:
    | {
        dateTime?: string;
        timeZone?: string;
      }
    | string
    | null;

  bookingEndAt?:
    | {
        dateTime?: string;
        timeZone?: string;
      }
    | string
    | null;

  bookedAt?: number | null;
  bookingCancelledAt?: number | null;
  bookingLinkSentAt?: number | null;
  interestRespondedAt?: number | null;
}

type LeadsTab = "pending" | "sent" | "resolved" | "all";
type MainTab = "leads" | "inbox";

interface Conversation {
  id: string;
  agentId: string;
  customerName: string | null;
  customerPhone: string;
  lastMessageText: string;
  lastMessageDirection: "inbound" | "outbound";
  lastMessageType: string;
  lastMessageAt: any;
  unreadCount?: number;
  leadId?: string | null;
  status?: string;
  needsReply?: boolean;
  lastInboundAt?: any;
}

interface ConversationMessage {
  id: string;
  direction: "inbound" | "outbound";
  text?: string | null;
  type?: string;
  templateName?: string;
  createdAt: any;
  status?: string;
}

interface WhatsAppTemplate {
  id: string;
  name: string;
  category?: string;
  language?: string;
  bodyText?: string;
  status?: string;
  bodyVariableCount?: number;
  bodyExamples?: string[];
  quickReplyButtons?: string[];
}

const STATUS_LABELS: Record<LeadStatus, string> = {
  pending: "ממתין לשליחה",
  sent: "נשלח",
  accepted: "התקבל ב־WhatsApp",
  delivered: "נמסר",
  read: "נקרא",
  interested: "מעוניין – טרם נקבעה פגישה",
  booked: "נקבעה פגישה",
  declined: "לא מעוניין",
  no_response: "לא התקבלה תשובה",
  failed: "השליחה נכשלה",
};

const STATUS_COLORS: Record<LeadStatus, string> = {
  pending: "bg-gray-100 text-gray-800",
  sent: "bg-blue-100 text-blue-800",
  accepted: "bg-blue-100 text-blue-800",
  delivered: "bg-cyan-100 text-cyan-800",
  read: "bg-indigo-100 text-indigo-800",
  interested: "bg-purple-100 text-purple-800",
  booked: "bg-green-100 text-green-800",
  declined: "bg-red-100 text-red-800",
  no_response: "bg-orange-100 text-orange-800",
  failed: "bg-red-100 text-red-800",
};

const formatPhoneNumber = (phone: string): string => {
  if (!phone) return "-";
  const digits = phone.replace(/\D/g, "");
  let local = digits;
  if (local.startsWith("972")) local = "0" + local.slice(3);
  else if (!local.startsWith("0")) local = "0" + local;
  return local.replace(/(\d{3})(\d+)/, "$1-$2");
};


const BOOKING_STATUS_LABELS: Record<string, string> = {
  not_sent: "קישור טרם נשלח",
  link_sent: "קישור זימון נשלח",
  booked: "נקבעה פגישה",
  cancelled: "הפגישה בוטלה",
  no_booking: "לא נקבעה פגישה",
  send_failed: "שליחת הקישור נכשלה",
  missing_booking_url: "חסר קישור זימון",
};

const BOOKING_STATUS_COLORS: Record<string, string> = {
  not_sent: "bg-gray-100 text-gray-700",
  link_sent: "bg-blue-100 text-blue-800",
  booked: "bg-green-100 text-green-800",
  cancelled: "bg-orange-100 text-orange-800",
  no_booking: "bg-gray-100 text-gray-700",
  send_failed: "bg-red-100 text-red-800",
  missing_booking_url: "bg-red-100 text-red-800",
};

const formatDateOnly = (iso: string): string => {
  if (!iso) return "-";
  const datePart = iso.split("T")[0];
  const [y, m, d] = datePart.split("-");
  if (y && m && d) return `${d}/${m}/${y}`;
  return datePart;
};

const formatMsDateOnly = (ms: number | null): string => {
  if (!ms) return "-";
  return new Date(ms).toLocaleDateString("he-IL");
};

const formatBookingDate = (
  value:
    | {
        dateTime?: string;
        timeZone?: string;
      }
    | string
    | null
    | undefined
): string => {
  if (!value) return "-";

  const rawValue =
    typeof value === "string"
      ? value
      : value.dateTime;

  if (!rawValue) return "-";

  const parsed = new Date(rawValue);

  if (Number.isNaN(parsed.getTime())) {
    return rawValue;
  }

  return parsed.toLocaleString("he-IL", {
    dateStyle: "short",
    timeStyle: "short",
  });
};

const formatFirestoreTime = (value: any): string => {
  if (!value) return "";
  const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  return date.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
};

const formatConversationDate = (value: any): string => {
  if (!value) return "";
  const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  const now = new Date();

  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) {
    return date.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  }

  return date.toLocaleDateString("he-IL");
};

const getMessageText = (msg: ConversationMessage): string => {
  if (msg.text) return msg.text;
  if (msg.type === "template") return `נשלחה תבנית WhatsApp${msg.templateName ? `: ${msg.templateName}` : ""}`;
  return `[${msg.type || "message"}]`;
};

const WhatsAppSendPage = () => {
  const { user, isLoading, detail } = useAuth();
  const [ready, setReady] = useState(false);
  const [isClient, setIsClient] = useState(false);

  const { canAccess, isChecking } = usePermission(
    user ? "access_whatsapp_send" : null
  );

  const { toasts, addToast, setToasts } = useToast();

  const [mainTab, setMainTab] = useState<MainTab>("inbox");

  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [autoPickCount, setAutoPickCount] = useState<number>(10);
  const [sending, setSending] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<LeadsTab>("pending");

  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplateName, setSelectedTemplateName] = useState("");

  const agentId = useMemo(() => {
    const d: any = detail;
    return d?.agentId || user?.uid || "";
  }, [detail, user]);

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

  useEffect(() => {
    if (!isClient || !ready || !user || !detail || !canAccess || !agentId) {
      setTemplates([]);
      setSelectedTemplateName("");
      return;
    }

    setLoadingTemplates(true);

    const templatesRef = collection(
      db,
      "agents",
      agentId,
      "whatsapp_templates"
    );

    const templatesQuery = query(
      templatesRef,
      where("status", "==", "APPROVED")
    );

    const unsub = onSnapshot(
      templatesQuery,
      (snap) => {
        const list: WhatsAppTemplate[] = snap.docs.map((d) => {
          const data: any = d.data();

          return {
            id: d.id,
            name: String(data.name || d.id),
            category: data.category,
            language: data.language,
            bodyText: data.bodyText,
            status: data.status,
            bodyVariableCount: Number(data.bodyVariableCount || 0),
            bodyExamples: Array.isArray(data.bodyExamples)
              ? data.bodyExamples.map((value: unknown) => String(value))
              : [],
            quickReplyButtons: Array.isArray(data.quickReplyButtons)
              ? data.quickReplyButtons.map((value: unknown) => String(value))
              : [],
          };
        });

        list.sort((a, b) => a.name.localeCompare(b.name));

        setTemplates(list);
        setLoadingTemplates(false);

        setSelectedTemplateName((current) => {
          if (current && list.some((t) => t.name === current)) return current;
          return list[0]?.name || "";
        });
      },
      (err) => {
        console.error("[whatsapp_templates]", err);
        setTemplates([]);
        setSelectedTemplateName("");
        setLoadingTemplates(false);
        addToast("error", `שגיאה בטעינת תבניות: ${err.message}`);
      }
    );

    return () => unsub();
  }, [isClient, ready, user, detail, canAccess, agentId]);

  if (!isClient) return null;

  if (isLoading || isChecking || !ready || !user || !detail) {
    return <div className="p-4 text-gray-600">⏳ טוען מידע...</div>;
  }

  if (!canAccess) {
    return <AccessDenied />;
  }

  const pendingLeads = leads.filter(
    (lead) => lead.status === "pending"
  );

  const sentLeads = leads.filter((lead) =>
    [
      "sent",
      "accepted",
      "delivered",
      "read",
      "interested",
    ].includes(lead.status)
  );

  const resolvedLeads = leads.filter((lead) =>
    [
      "booked",
      "declined",
      "no_response",
    ].includes(lead.status)
  );

  const visibleLeads =
    activeTab === "pending" ? pendingLeads :
    activeTab === "sent" ? sentLeads :
    activeTab === "resolved" ? resolvedLeads :
    leads;

  const selectedTemplate = templates.find(
    (t) => t.name === selectedTemplateName
  );

  const previewLead = leads.find((lead) =>
    selectedIds.has(lead.surenseId)
  );

  const previewCustomerName =
    previewLead?.fullName?.trim().split(/\s+/)[0] ||
    selectedTemplate?.bodyExamples?.[0] ||
    "שם הלקוח";

  const selectedTemplatePreview = selectedTemplate?.bodyText
    ? selectedTemplate.bodyText.replace(/\{\{1\}\}/g, previewCustomerName)
    : "";

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

    if (!selectedTemplateName) {
      addToast("error", "יש לבחור תבנית WhatsApp מאושרת לשליחה");
      return;
    }

    setSending(true);
    try {
      const fn = httpsCallable(functions, "sendReengagementBatch");
      const result: any = await fn({
        leadIds: Array.from(selectedIds),
        templateName: selectedTemplateName,
      });
      const { sent, failed } = result.data ?? {};
      if (failed > 0) addToast("error", `נשלח בהצלחה: ${sent ?? 0} | נכשל: ${failed}`);
      else addToast("success", `נשלח בהצלחה ל-${sent ?? 0} לקוחות`);
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

  const onCloseLead = async (surenseId: string) => {
    if (closingId) return;

    const confirmed = window.confirm(
      "לסגור את המעקב אחרי הלקוח הזה? הוא לא ייכנס יותר למשיכות עתידיות."
    );
    if (!confirmed) return;

    setClosingId(surenseId);
    try {
      const fn = httpsCallable(functions, "closeReengagementLead");
      await fn({ surenseId });
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(surenseId);
        return next;
      });
      addToast("success", "המעקב נסגר בהצלחה");
      await loadLeads();
    } catch (e: any) {
      addToast("error", `שגיאה בסגירת מעקב: ${e.message}`);
    } finally {
      setClosingId(null);
    }
  };

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div className="p-6 max-w-7xl mx-auto text-right" dir="rtl">
        <h1 className="text-2xl font-bold mb-4">ניהול קמפיין יצירת קשר חוזר</h1>

        <div className="flex gap-2 mb-5 border-b">
        <MainTabButton
  label="💬 שיחות WhatsApp"
  active={mainTab === "inbox"}
  onClick={() => setMainTab("inbox")}
/>

<MainTabButton
  label="📋 לידים ושליחה"
  active={mainTab === "leads"}
  onClick={() => setMainTab("leads")}
/>
        </div>

        {mainTab === "leads" && (
          <>
            {loadError && (
              <div className="bg-red-50 text-red-700 border border-red-200 rounded p-3 mb-4">
                {loadError}
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              <StatCard label="ממתינים לשליחה" value={stats.pending ?? 0} color="bg-gray-50 text-gray-800" />
              <StatCard label="בטיפול" value={
  (stats.sent ?? 0) +
  (stats.accepted ?? 0) +
  (stats.delivered ?? 0) +
  (stats.read ?? 0) +
  (stats.interested ?? 0)
} color="bg-amber-50 text-amber-800" />
              <StatCard label="נקבעו פגישות" value={stats.booked ?? 0} color="bg-green-50 text-green-800" />
              <StatCard label="לא ענו" value={stats.no_response ?? 0} color="bg-gray-50 text-gray-600" />
              <StatCard label="סירבו" value={stats.declined ?? 0} color="bg-red-50 text-red-700" />
            </div>

            <div className="border rounded p-4 bg-white mb-4 flex flex-wrap items-center gap-3">
              <div className="w-full border-b pb-3 mb-1">
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  תבנית WhatsApp לשליחה
                </label>

                <div className="flex flex-wrap items-center gap-3">
                  <select
                    className="border rounded px-3 py-2 min-w-[280px]"
                    value={selectedTemplateName}
                    onChange={(e) => setSelectedTemplateName(e.target.value)}
                    disabled={loadingTemplates || templates.length === 0}
                  >
                    {templates.length === 0 ? (
                      <option value="">
                        אין תבניות מאושרות
                      </option>
                    ) : (
                      templates.map((template) => (
                        <option
                          key={template.id}
                          value={template.name}
                        >
                          {template.name}
                        </option>
                      ))
                    )}
                  </select>

                  {loadingTemplates && (
                    <span className="text-sm text-gray-500">
                      טוען תבניות...
                    </span>
                  )}

                  {selectedTemplate && (
                    <span className="text-xs text-gray-500">
                      {selectedTemplate.category || "-"} · {selectedTemplate.language || "he"}
                    </span>
                  )}
                </div>

                {selectedTemplate?.bodyText && (
                  <div className="mt-2 rounded bg-gray-50 border p-3 text-sm text-gray-700 space-y-2">
                    <div>
                      <span className="font-semibold">תצוגה מקדימה: </span>
                      <span className="whitespace-pre-wrap">
                        {selectedTemplatePreview}
                      </span>
                    </div>

                    {!!selectedTemplate.quickReplyButtons?.length && (
                      <div className="flex flex-wrap gap-2">
                        {selectedTemplate.quickReplyButtons.map((buttonText) => (
                          <span
                            key={buttonText}
                            className="inline-flex rounded border bg-white px-3 py-1 text-xs font-semibold text-blue-700"
                          >
                            {buttonText}
                          </span>
                        ))}
                      </div>
                    )}

                    {(selectedTemplate.bodyVariableCount ?? 0) > 0 && !previewLead && (
                      <div className="text-xs text-gray-500">
                        לאחר בחירת ליד, התצוגה תציג את שמו הפרטי במקום {'{{1}}'}.
                      </div>
                    )}
                  </div>
                )}
              </div>

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
                disabled={
                  sending ||
                  selectedIds.size === 0 ||
                  !selectedTemplateName ||
                  loadingTemplates
                }
              />

              <Button text="🔄 רענן" type="secondary" onClick={loadLeads} disabled={loadingLeads} />
            </div>

            <div className="flex gap-2 mb-3 border-b">
              <TabButton label={`ממתינים (${pendingLeads.length})`} active={activeTab === "pending"} onClick={() => setActiveTab("pending")} />
              <TabButton label={`בטיפול (${sentLeads.length})`} active={activeTab === "sent"} onClick={() => setActiveTab("sent")} />
              <TabButton label={`הסתיימו (${resolvedLeads.length})`} active={activeTab === "resolved"} onClick={() => setActiveTab("resolved")} />
              <TabButton label={`הכל (${leads.length})`} active={activeTab === "all"} onClick={() => setActiveTab("all")} />
            </div>

            <div className="mb-3 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              סטטוס הטיפול מציג את שלב הליד בקמפיין. סטטוס הזימון
              מתעדכן אוטומטית לאחר סנכרון Microsoft Bookings.
              פגישה שבוטלה מחזירה את הליד ל״מעוניין״ כדי לאפשר המשך טיפול.
            </div>

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
                      <th className="p-2 text-right">סטטוס בשורנס</th>
                      <th className="p-2 text-right">סטטוס טיפול</th>
                      <th className="p-2 text-right">סטטוס זימון</th>
                      <th className="p-2 text-right">מועד פגישה</th>
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
  {lead.surenseStatusName ? (
    <span
      className={`px-2 py-1 rounded text-xs ${
        lead.surenseStatusActive
          ? "bg-red-50 text-red-700"
          : "bg-gray-100 text-gray-600"
      }`}
      title="סטטוס הלקוח כפי שמתקבל משורנס - לא בהכרח מעודכן ב-100%"
    >
      {lead.surenseStatusName}
    </span>
  ) : (
    <span className="text-gray-400 text-xs">-</span>
  )}
</td>
                        <td className="p-2">
                          <span
                            className={`inline-flex rounded px-2 py-1 text-xs ${
                              STATUS_COLORS[lead.status] ??
                              "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {STATUS_LABELS[lead.status] ?? lead.status}
                          </span>
                        </td>

                        <td className="p-2">
                          {lead.bookingStatus ? (
                            <span
                              className={`inline-flex rounded px-2 py-1 text-xs font-semibold ${
                                BOOKING_STATUS_COLORS[lead.bookingStatus] ??
                                "bg-gray-100 text-gray-700"
                              }`}
                            >
                              {BOOKING_STATUS_LABELS[lead.bookingStatus] ??
                                lead.bookingStatus}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>

                        <td className="p-2 min-w-[180px]">
                          {lead.bookingStatus === "booked" ? (
                            <div className="space-y-1">
                              <div className="font-semibold text-green-800">
                                {formatBookingDate(lead.bookingStartAt)}
                              </div>

                              {lead.bookingServiceName && (
                                <div className="text-xs text-gray-500">
                                  {lead.bookingServiceName}
                                </div>
                              )}
                            </div>
                          ) : lead.bookingStatus === "cancelled" ? (
                            <div className="space-y-1">
                              <div className="font-semibold text-orange-700">
                                הפגישה בוטלה
                              </div>

                              {lead.bookingStartAt && (
                                <div className="text-xs text-gray-500">
                                  המועד שבוטל:{" "}
                                  {formatBookingDate(lead.bookingStartAt)}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>

                        <td className="p-2">{formatMsDateOnly(lead.waSentAt)}</td>
                      <td className="p-2">
  <div className="flex gap-1 flex-wrap">
    {["sent", "accepted", "delivered", "read", "interested"].includes(lead.status) && (
      <>
        <button className="text-xs px-2 py-1 rounded bg-green-100 text-green-800 hover:bg-green-200 disabled:opacity-50" disabled={updatingId === lead.surenseId} onClick={() => onUpdateStatus(lead.surenseId, "booked")}>
          סמן ידנית: נקבעה פגישה
        </button>
        <button className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50" disabled={updatingId === lead.surenseId} onClick={() => onUpdateStatus(lead.surenseId, "no_response")}>
          לא ענה
        </button>
        <button className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50" disabled={updatingId === lead.surenseId} onClick={() => onUpdateStatus(lead.surenseId, "declined")}>
          סירב
        </button>
      </>
    )}
    {lead.status !== "declined" && (
      <button
        className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50"
        disabled={closingId === lead.surenseId}
        onClick={() => onCloseLead(lead.surenseId)}
        title="לא להמשיך בטיפול מול הלקוח הזה - יסגר גם התהליך בשורנס"
      >
        {closingId === lead.surenseId ? "⏳ סוגר..." : "לא להמשיך טיפול"}
      </button>
    )}
  </div>
</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {mainTab === "inbox" && (
          <WhatsAppInbox agentId={agentId} />
        )}
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

function WhatsAppInbox({ agentId }: { agentId: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string>("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [search, setSearch] = useState("");
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
const waitingForReplyCount = conversations.filter((c) => c.needsReply).length;

const sendReply = async () => {
  const text = replyText.trim();
  if (!selectedConversationId || !text || sendingReply) return;

  setSendingReply(true);

  try {
    const fn = httpsCallable(functions, "sendWhatsAppConversationMessage");
    await fn({
      conversationId: selectedConversationId,
      text,
    });

    setReplyText("");
  } catch (e: any) {
    alert(e.message || "שגיאה בשליחת הודעה");
  } finally {
    setSendingReply(false);
  }
};

const markConversationRead = async (conversationId: string) => {
  await setDoc(
    doc(db, "whatsapp_conversations", conversationId),
    { unreadCount: 0 },
    { merge: true }
  );
};

  useEffect(() => {
    if (!agentId) return;

    const q = query(
      collection(db, "whatsapp_conversations"),
      where("agentId", "==", agentId),
    );

    const unsub = onSnapshot(q, (snap) => {
     const rows = snap.docs.map((d) => ({
  id: d.id,
  ...(d.data() as any),
})) as Conversation[];

rows.sort((a, b) => {
  const ad = a.lastMessageAt?.toDate?.()?.getTime?.() ?? 0;
  const bd = b.lastMessageAt?.toDate?.()?.getTime?.() ?? 0;
  return bd - ad;
});

setConversations(rows);

      if (!selectedConversationId && rows.length > 0) {
        setSelectedConversationId(rows[0].id);
      }
    });

    return () => unsub();
  }, [agentId, selectedConversationId]);

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      return;
    }

    const q = query(
      collection(doc(db, "whatsapp_conversations", selectedConversationId), "messages"),
      orderBy("createdAt", "asc")
    );

    const unsub = onSnapshot(q, (snap) => {
      setMessages(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })) as ConversationMessage[]
      );
    });

    return () => unsub();
  }, [selectedConversationId]);

  const filtered = conversations.filter((c) => {
    const term = search.trim();
    if (!term) return true;
    return `${c.customerName ?? ""} ${c.customerPhone ?? ""} ${c.lastMessageText ?? ""}`.includes(term);
  });

  const selected = conversations.find((c) => c.id === selectedConversationId) ?? null;

  const isServiceWindowOpen = (conversation: Conversation | null): boolean => {
  if (!conversation?.lastInboundAt) return false;

  const inboundDate =
    typeof conversation.lastInboundAt?.toDate === "function"
      ? conversation.lastInboundAt.toDate()
      : new Date(conversation.lastInboundAt);

  const diffMs = Date.now() - inboundDate.getTime();
  return diffMs < 24 * 60 * 60 * 1000;
};

const serviceWindowOpen = isServiceWindowOpen(selected);
  return (
    <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
    <div className="p-4 border-b flex items-center justify-between">
  <div>
    <h2 className="text-xl font-bold">
      💬 שיחות WhatsApp
    </h2>

    <p className="text-sm text-gray-500 mt-1">
      שיחות נכנסות מלידים שחזרו בוואטסאפ
    </p>
  </div>

  <div className="flex items-center gap-3">
    {waitingForReplyCount > 0 && (
      <span className="bg-green-100 text-green-700 rounded-full px-3 py-1 text-sm font-bold">
        {waitingForReplyCount} שיחות ממתינות למענה
      </span>
    )}

    <div className="text-sm text-gray-500">
      {conversations.length} שיחות
    </div>
  </div>
</div>
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] min-h-[620px]">
        <aside className="border-l bg-gray-50">
          <div className="p-3 border-b">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש לפי שם / טלפון / הודעה"
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div className="max-h-[560px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-gray-500 text-sm">אין שיחות להצגה</div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                 onClick={() => {
  setSelectedConversationId(c.id);
  markConversationRead(c.id);
}}
                  className={`w-full text-right p-3 border-b hover:bg-white transition ${
                    selectedConversationId === c.id ? "bg-white" : ""
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className="w-10 h-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-bold shrink-0">
                      {(c.customerName || c.customerPhone || "?").slice(0, 1)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-2">
                  <div className={`truncate ${(c.unreadCount ?? 0) > 0 ? "font-bold" : "font-semibold"}`}>
  {c.customerName || formatPhoneNumber(c.customerPhone)}
</div>
                        <div className="text-xs text-gray-400 shrink-0">
                          {formatConversationDate(c.lastMessageAt)}
                        </div>
                      </div>

                      <div className="text-xs text-gray-500 mt-0.5" dir="ltr">
                        {formatPhoneNumber(c.customerPhone)}
                      </div>

                      <div className="text-sm text-gray-600 truncate mt-1">
                        {c.lastMessageDirection === "outbound" ? "אתם: " : ""}
                        {c.lastMessageText || "-"}
                      </div>
                    </div>

                   {!!c.needsReply && !!c.unreadCount && c.unreadCount > 0 && (
  <div className="bg-green-500 text-white text-xs rounded-full min-w-5 h-5 px-1 flex items-center justify-center">
    {c.unreadCount}
  </div>
)}
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <main className="bg-[#e9f3ef] flex justify-center p-4">
          {!selected ? (
            <div className="text-gray-500 self-center">בחרי שיחה להצגה</div>
          ) : (
            <div className="w-full max-w-[520px] bg-[#efeae2] rounded-[28px] shadow-xl overflow-hidden border">
              <div className="bg-[#075e54] text-white px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center font-bold">
                  {(selected.customerName || selected.customerPhone || "?").slice(0, 1)}
                </div>
                <div>
                  <div className="font-bold">{selected.customerName || formatPhoneNumber(selected.customerPhone)}</div>
                  <div className="text-xs opacity-80" dir="ltr">{formatPhoneNumber(selected.customerPhone)}</div>
                </div>
              </div>
              <div className="h-[500px] overflow-y-auto p-4 space-y-2">
                {messages.length === 0 ? (
                  <div className="text-center text-gray-500 text-sm mt-10">אין הודעות בשיחה</div>
                ) : (
                  messages.map((msg) => {
                    const isOutbound = msg.direction === "outbound";

                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                            isOutbound
                              ? "bg-[#dcf8c6] rounded-br-sm"
                              : "bg-white rounded-bl-sm"
                          }`}
                        >
                          <div className="whitespace-pre-wrap">{getMessageText(msg)}</div>
                          <div className="text-[10px] text-gray-500 mt-1 text-left">
                            {formatFirestoreTime(msg.createdAt)}
                            {isOutbound && msg.status ? ` · ${msg.status}` : ""}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
        <div className="bg-gray-100 p-3">
  {selected && !serviceWindowOpen && (
    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-2">
      חלפו יותר מ־24 שעות מהודעת הלקוח האחרונה. כדי לחדש שיחה צריך לשלוח תבנית WhatsApp מאושרת.
    </div>
  )}

  <div className="flex gap-2">
    <input
      value={replyText}
      onChange={(e) => setReplyText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();

          if (serviceWindowOpen) {
            sendReply();
          }
        }
      }}
      disabled={!serviceWindowOpen}
      placeholder={
        serviceWindowOpen
          ? "כתבי תשובה ללקוח..."
          : "חלון השיחה הסתיים"
      }
      className="flex-1 rounded-full border px-4 py-2 text-sm bg-white disabled:text-gray-400"
    />

    <button
      onClick={sendReply}
      disabled={
        !serviceWindowOpen ||
        !replyText.trim() ||
        sendingReply
      }
      className="rounded-full bg-green-600 text-white px-4 py-2 disabled:opacity-50"
    >
      {sendingReply ? "שולח..." : "שלח"}
    </button>
  </div>
</div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded p-3 ${color}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs mt-1">{label}</div>
    </div>
  );
}

function MainTabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-5 py-3 text-sm border-b-2 ${
        active ? "border-green-600 text-green-700 font-bold" : "border-transparent text-gray-500 hover:text-gray-700"
      }`}
    >
      {label}
    </button>
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