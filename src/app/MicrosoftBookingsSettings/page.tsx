'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import {
  auth,
  db,
  functions,
} from '@/lib/firebase/firebase';

import { Button } from '@/components/Button/Button';
import DialogNotification from '@/components/DialogNotification';

type DialogKind = 'info' | 'warning' | 'success' | 'error';

type DialogState = {
  type: DialogKind;
  title: string;
  message: string;
};

type MicrosoftBusiness = {
  id: string;
  displayName: string;
};

type MicrosoftBookingsConfig = {
  status?: string;
  connected?: boolean;

  microsoftUserName?: string | null;
  microsoftUserEmail?: string | null;

  bookingBusinessId?: string | null;
  bookingBusinessName?: string | null;
  bookingBusinessEmail?: string | null;
  bookingBusinessPhone?: string | null;
  bookingBusinessPublicUrl?: string | null;

  availableBusinesses?: MicrosoftBusiness[];

  lastSyncAt?: {
    toDate?: () => Date;
  } | null;

  lastSyncStatus?: string | null;
  lastSyncError?: string | null;
  lastSyncAppointmentCount?: number | null;
  lastSyncMatchedCount?: number | null;
  lastSyncUnmatchedCount?: number | null;

  connectedAt?: {
    toDate?: () => Date;
  } | null;
};

const CONNECTION_STATUS_LABELS: Record<string, string> = {
  connected: 'מחובר',
  needs_business_selection: 'נדרשת בחירת עסק',
  no_booking_business: 'לא נמצא עסק Bookings',
  disconnected: 'לא מחובר',
};

const SYNC_STATUS_LABELS: Record<string, string> = {
  not_started: 'טרם בוצע סנכרון',
  success: 'הסנכרון הצליח',
  failed: 'הסנכרון נכשל',
};

function formatTimestamp(
  value?: {
    toDate?: () => Date;
  } | null
): string {
  if (!value || typeof value.toDate !== 'function') {
    return '-';
  }

  return value.toDate().toLocaleString('he-IL');
}

export default function MicrosoftBookingsSettingsPage() {
  const searchParams = useSearchParams();

  const [agentId, setAgentId] = useState('');
  const [authReady, setAuthReady] = useState(false);

  const [config, setConfig] =
    useState<MicrosoftBookingsConfig | null>(null);

  const [loadingConfig, setLoadingConfig] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);

  const [selectedBusinessId, setSelectedBusinessId] = useState('');

  const [dialog, setDialog] =
    useState<DialogState | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setAgentId(user?.uid || '');
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (!authReady) {
      return;
    }

    if (!agentId) {
      setConfig(null);
      setLoadingConfig(false);
      return;
    }

    setLoadingConfig(true);

    const configRef = doc(
      db,
      `agents/${agentId}/config/microsoftBookings`
    );

    return onSnapshot(
      configRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setConfig(null);
          setSelectedBusinessId('');
          setLoadingConfig(false);
          return;
        }

        const data = snapshot.data();

        const availableBusinesses =
          Array.isArray(data.availableBusinesses)
            ? data.availableBusinesses.map(
                (business: Record<string, unknown>) => ({
                  id: String(business.id || ''),
                  displayName: String(
                    business.displayName || business.id || ''
                  ),
                })
              )
            : [];

        setConfig({
          status: String(data.status || ''),
          connected: data.connected === true,

          microsoftUserName:
            data.microsoftUserName || null,

          microsoftUserEmail:
            data.microsoftUserEmail || null,

          bookingBusinessId:
            data.bookingBusinessId || null,

          bookingBusinessName:
            data.bookingBusinessName || null,

          bookingBusinessEmail:
            data.bookingBusinessEmail || null,

          bookingBusinessPhone:
            data.bookingBusinessPhone || null,

          bookingBusinessPublicUrl:
            data.bookingBusinessPublicUrl || null,

          availableBusinesses,

          lastSyncAt:
            data.lastSyncAt || null,

          lastSyncStatus:
            data.lastSyncStatus || null,

          lastSyncError:
            data.lastSyncError || null,

          lastSyncAppointmentCount:
            typeof data.lastSyncAppointmentCount === 'number'
              ? data.lastSyncAppointmentCount
              : null,

          lastSyncMatchedCount:
            typeof data.lastSyncMatchedCount === 'number'
              ? data.lastSyncMatchedCount
              : null,

          lastSyncUnmatchedCount:
            typeof data.lastSyncUnmatchedCount === 'number'
              ? data.lastSyncUnmatchedCount
              : null,

          connectedAt:
            data.connectedAt || null,
        });

        setSelectedBusinessId(
          String(
            data.bookingBusinessId ||
            availableBusinesses[0]?.id ||
            ''
          )
        );

        setLoadingConfig(false);
      },
      (error) => {
        console.error(
          '[MicrosoftBookingsSettings] config listener failed',
          error
        );

        setLoadingConfig(false);

        setDialog({
          type: 'error',
          title: 'שגיאה',
          message:
            'לא ניתן לטעון את הגדרות Microsoft Bookings.',
        });
      }
    );
  }, [agentId, authReady]);

  useEffect(() => {
    const result = searchParams.get('microsoftBookings');

    if (!result) {
      return;
    }

    if (result === 'connected') {
      setDialog({
        type: 'success',
        title: 'החיבור הושלם',
        message:
          'חשבון Microsoft Bookings חובר בהצלחה ל־MagicSale.',
      });
      return;
    }

    if (result === 'needs_business_selection') {
      setDialog({
        type: 'warning',
        title: 'נדרשת בחירת עסק',
        message:
          'החשבון חובר. כעת יש לבחור את עסק ה־Bookings הרצוי.',
      });
      return;
    }

    if (result === 'no_booking_business') {
      setDialog({
        type: 'warning',
        title: 'לא נמצא Bookings',
        message:
          'החשבון חובר, אך לא נמצא בו עסק Microsoft Bookings פעיל.',
      });
      return;
    }

    if (result === 'error') {
      setDialog({
        type: 'error',
        title: 'החיבור נכשל',
        message:
          searchParams.get('message') ||
          'החיבור ל־Microsoft נכשל.',
      });
    }
  }, [searchParams]);

  const connectionStatus = useMemo(() => {
    if (!config) {
      return 'disconnected';
    }

    return config.status || (
      config.connected ? 'connected' : 'disconnected'
    );
  }, [config]);

  const statusLabel =
    CONNECTION_STATUS_LABELS[connectionStatus] ||
    connectionStatus ||
    'לא מחובר';

  const syncStatusLabel =
    SYNC_STATUS_LABELS[
      String(config?.lastSyncStatus || 'not_started')
    ] ||
    config?.lastSyncStatus ||
    'טרם בוצע סנכרון';

  const statusClasses =
    connectionStatus === 'connected'
      ? 'bg-green-100 text-green-800'
      : connectionStatus === 'needs_business_selection'
        ? 'bg-yellow-100 text-yellow-800'
        : connectionStatus === 'no_booking_business'
          ? 'bg-orange-100 text-orange-800'
          : 'bg-gray-100 text-gray-700';

  const handleConnectMicrosoft = async () => {
    setConnecting(true);

    try {
      const fn = httpsCallable(
        functions,
        'startMicrosoftBookingsAuth'
      );

      const result = await fn({});
      const data = result.data as {
        authUrl?: string;
      };

      const authUrl = String(data?.authUrl || '').trim();

      if (!authUrl) {
        throw new Error(
          'לא התקבלה כתובת התחברות ל־Microsoft.'
        );
      }

      window.location.assign(authUrl);
    } catch (error: any) {
      setConnecting(false);

      setDialog({
        type: 'error',
        title: 'החיבור נכשל',
        message:
          error?.message ||
          'לא ניתן להתחיל את החיבור ל־Microsoft.',
      });
    }
  };

  const handleSelectBusiness = async () => {
    if (!selectedBusinessId) {
      setDialog({
        type: 'warning',
        title: 'לא נבחר עסק',
        message:
          'יש לבחור עסק Microsoft Bookings.',
      });
      return;
    }

    setSavingBusiness(true);

    try {
      const fn = httpsCallable(
        functions,
        'selectMicrosoftBookingsBusiness'
      );

      const result = await fn({
        businessId: selectedBusinessId,
      });

      const data = result.data as {
        bookingBusinessName?: string | null;
      };

      setDialog({
        type: 'success',
        title: 'העסק נשמר',
        message:
          `עסק ה־Bookings` +
          `${data.bookingBusinessName ? ` ${data.bookingBusinessName}` : ''}` +
          ` נבחר בהצלחה.`,
      });
    } catch (error: any) {
      setDialog({
        type: 'error',
        title: 'שמירת העסק נכשלה',
        message:
          error?.message ||
          'לא ניתן לשמור את עסק ה־Bookings.',
      });
    } finally {
      setSavingBusiness(false);
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);

    try {
      const fn = httpsCallable(
        functions,
        'syncMicrosoftBookingsNow'
      );

      const result = await fn({});
      const data = result.data as {
        appointments?: number;
        matched?: number;
        unmatched?: number;
      };

      setDialog({
        type: 'success',
        title: 'הסנכרון הסתיים',
        message:
          `נמצאו ${data.appointments ?? 0} פגישות. ` +
          `${data.matched ?? 0} שויכו ללידים, ` +
          `${data.unmatched ?? 0} לא שויכו.`,
      });
    } catch (error: any) {
      setDialog({
        type: 'error',
        title: 'הסנכרון נכשל',
        message:
          error?.message ||
          'לא ניתן לסנכרן את פגישות Bookings.',
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleTestMicrosoftConnection = async () => {
    setTestingConnection(true);

    try {
      const fn = httpsCallable(
        functions,
        'testMicrosoftBookingsConnection'
      );

      const result = await fn({});
      const data = result.data as {
        microsoftUserEmail?: string | null;
        bookingBusinessName?: string | null;
      };

      setDialog({
        type: 'success',
        title: 'החיבור תקין',
        message:
          `Microsoft מחובר בהצלחה` +
          `${data.microsoftUserEmail ? ` כ־${data.microsoftUserEmail}` : ''}` +
          `${data.bookingBusinessName ? ` לעסק ${data.bookingBusinessName}` : ''}.`,
      });
    } catch (error: any) {
      setDialog({
        type: 'error',
        title: 'בדיקת החיבור נכשלה',
        message:
          error?.message ||
          'לא ניתן לאמת את החיבור ל־Microsoft.',
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleDisconnect = async () => {
    const approved = window.confirm(
      'האם לנתק את חשבון Microsoft Bookings? הסנכרון האוטומטי יופסק.'
    );

    if (!approved) {
      return;
    }

    setDisconnecting(true);

    try {
      const fn = httpsCallable(
        functions,
        'disconnectMicrosoftBookings'
      );

      await fn({});

      setDialog({
        type: 'success',
        title: 'החשבון נותק',
        message:
          'החיבור ל־Microsoft Bookings נותק והסנכרון הופסק.',
      });
    } catch (error: any) {
      setDialog({
        type: 'error',
        title: 'הניתוק נכשל',
        message:
          error?.message ||
          'לא ניתן לנתק את חשבון Microsoft.',
      });
    } finally {
      setDisconnecting(false);
    }
  };

  if (!authReady || loadingConfig) {
    return (
      <main
        dir="rtl"
        className="max-w-4xl mx-auto p-6"
      >
        <div className="rounded border bg-white p-6">
          טוען הגדרות Microsoft Bookings...
        </div>
      </main>
    );
  }

  return (
    <main
      dir="rtl"
      className="max-w-4xl mx-auto p-6 space-y-6"
    >
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">
          Microsoft Bookings
        </h1>

        <p className="text-gray-600">
          חיבור Microsoft 365 מאפשר ל־MagicSale לזהות
          פגישות שנקבעו ולעדכן אוטומטית את סטטוס הליד.
        </p>
      </header>

      <section className="rounded border bg-white p-5 space-y-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">
              מצב החיבור
            </h2>

            <p className="text-sm text-gray-500 mt-1">
              החיבור מתבצע ישירות מול Microsoft Graph.
            </p>
          </div>

          <span
            className={`inline-flex rounded-full px-3 py-1 text-sm font-bold ${statusClasses}`}
          >
            {statusLabel}
          </span>
        </div>

        {!config?.connected &&
          connectionStatus !== 'needs_business_selection' && (
          <div className="rounded border bg-slate-50 p-4 space-y-4">
            <div className="text-sm text-gray-700">
              יש להתחבר עם חשבון Microsoft 365 שמורשה
              לגשת ל־Bookings של הסוכן.
            </div>

            <Button
              text={
                connecting
                  ? 'מעביר ל־Microsoft...'
                  : 'התחבר ל־Microsoft Bookings'
              }
              onClick={handleConnectMicrosoft}
              disabled={connecting || !agentId}
            />
          </div>
        )}

        {connectionStatus === 'needs_business_selection' && (
          <div className="rounded border border-yellow-300 bg-yellow-50 p-4 space-y-4">
            <div>
              <div className="font-bold">
                בחירת עסק Microsoft Bookings
              </div>

              <div className="text-sm text-gray-700 mt-1">
                נמצאו מספר עסקים בחשבון. יש לבחור את העסק
                שיחובר לסוכן זה.
              </div>
            </div>

            <select
              className="w-full rounded border bg-white px-3 py-2"
              value={selectedBusinessId}
              onChange={(event) =>
                setSelectedBusinessId(event.target.value)
              }
            >
              <option value="">
                בחר עסק
              </option>

              {(config?.availableBusinesses || []).map(
                (business) => (
                  <option
                    key={business.id}
                    value={business.id}
                  >
                    {business.displayName}
                  </option>
                )
              )}
            </select>

            <Button
              text={
                savingBusiness
                  ? 'שומר בחירה...'
                  : 'שמור עסק Bookings'
              }
              onClick={handleSelectBusiness}
              disabled={
                savingBusiness ||
                !selectedBusinessId
              }
            />
          </div>
        )}

        {config && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoCard
              label="חשבון Microsoft"
              value={
                config.microsoftUserEmail ||
                config.microsoftUserName ||
                '-'
              }
            />

            <InfoCard
              label="עסק Bookings"
              value={config.bookingBusinessName || '-'}
            />

            <InfoCard
              label="מזהה העסק"
              value={config.bookingBusinessId || '-'}
            />

            <InfoCard
              label="סנכרון אחרון"
              value={formatTimestamp(config.lastSyncAt)}
            />

            <InfoCard
              label="סטטוס סנכרון"
              value={syncStatusLabel}
            />

            <InfoCard
              label="פגישות שנמצאו"
              value={
                config.lastSyncAppointmentCount != null
                  ? String(config.lastSyncAppointmentCount)
                  : '-'
              }
            />

            <InfoCard
              label="פגישות ששויכו"
              value={
                config.lastSyncMatchedCount != null
                  ? String(config.lastSyncMatchedCount)
                  : '-'
              }
            />

            <InfoCard
              label="פגישות ללא התאמה"
              value={
                config.lastSyncUnmatchedCount != null
                  ? String(config.lastSyncUnmatchedCount)
                  : '-'
              }
            />
          </div>
        )}

        {config?.lastSyncError && (
          <div className="rounded border border-red-300 bg-red-50 p-4 text-red-800">
            {config.lastSyncError}
          </div>
        )}

        {config?.connected && (
          <div className="flex flex-wrap gap-3">
            <Button
              text={
                syncing
                  ? 'מסנכרן...'
                  : 'סנכרן פגישות עכשיו'
              }
              onClick={handleSyncNow}
              disabled={syncing}
            />

            <Button
              text={
                testingConnection
                  ? 'בודק חיבור...'
                  : 'בדוק חיבור Microsoft'
              }
              onClick={handleTestMicrosoftConnection}
              disabled={testingConnection}
            />

            <Button
              text={
                disconnecting
                  ? 'מנתק...'
                  : 'נתק חשבון Microsoft'
              }
              onClick={handleDisconnect}
              disabled={disconnecting}
            />
          </div>
        )}
      </section>

      {dialog && (
        <DialogNotification
          type={dialog.type}
          title={dialog.title}
          message={dialog.message}
          onConfirm={() => setDialog(null)}
          onCancel={() => setDialog(null)}
          confirmText="אישור"
          hideCancel
        />
      )}
    </main>
  );
}

function InfoCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded border bg-slate-50 p-3">
      <div className="text-xs font-semibold text-gray-500">
        {label}
      </div>

      <div className="mt-1 break-words text-sm font-medium">
        {value}
      </div>
    </div>
  );
}