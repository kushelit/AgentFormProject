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
  status?:
    | 'connected'
    | 'needs_business_selection'
    | 'no_booking_business'
    | 'disconnected'
    | string;

  connected?: boolean;

  microsoftUserId?: string | null;
  microsoftUserName?: string | null;
  microsoftUserEmail?: string | null;

  bookingBusinessId?: string | null;
  bookingBusinessName?: string | null;
  bookingBusinessEmail?: string | null;
  bookingBusinessPhone?: string | null;
  bookingBusinessPublicUrl?: string | null;

  availableBusinesses?: MicrosoftBusiness[];

  scope?: string | null;

  lastSyncAt?: {
    toDate?: () => Date;
  } | null;

  lastSyncStatus?: string | null;
  lastSyncError?: string | null;
  lastSyncAppointmentCount?: number | null;

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
  const [testingConnection, setTestingConnection] = useState(false);

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
          setLoadingConfig(false);
          return;
        }

        const data = snapshot.data();

        setConfig({
          status: String(data.status || ''),
          connected: data.connected === true,

          microsoftUserId:
            data.microsoftUserId || null,

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

          availableBusinesses:
            Array.isArray(data.availableBusinesses)
              ? data.availableBusinesses.map(
                  (business: Record<string, unknown>) => ({
                    id: String(business.id || ''),
                    displayName: String(
                      business.displayName || business.id || ''
                    ),
                  })
                )
              : [],

          scope:
            data.scope || null,

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

          connectedAt:
            data.connectedAt || null,
        });

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
          'החשבון חובר, אך נמצאו מספר עסקי Bookings. בהמשך נוסיף בחירה מתוך המסך.',
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
    if (!agentId) {
      setDialog({
        type: 'warning',
        title: 'נדרשת התחברות',
        message:
          'יש להתחבר למערכת לפני חיבור Microsoft Bookings.',
      });
      return;
    }

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
      console.error(
        '[MicrosoftBookingsSettings] connect failed',
        error
      );

      setDialog({
        type: 'error',
        title: 'החיבור נכשל',
        message:
          error?.message ||
          'לא ניתן להתחיל את החיבור ל־Microsoft.',
      });

      setConnecting(false);
    }
  };

  const handleTestMicrosoftConnection = async () => {
    if (!agentId) {
      setDialog({
        type: 'warning',
        title: 'נדרשת התחברות',
        message:
          'יש להתחבר למערכת לפני בדיקת חיבור Microsoft.',
      });
      return;
    }

    setTestingConnection(true);

    try {
      const fn = httpsCallable(
        functions,
        'testMicrosoftBookingsConnection'
      );

      const result = await fn({});
      const data = result.data as {
        ok?: boolean;
        microsoftUserEmail?: string | null;
        microsoftUserName?: string | null;
        bookingBusinessId?: string | null;
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
      console.error(
        '[MicrosoftBookingsSettings] connection test failed',
        error
      );

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
          חיבור חשבון Microsoft 365 מאפשר ל־MagicSale
          לזהות פגישות שנקבעו ולעדכן אוטומטית את סטטוס הליד.
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

        {!config?.connected && (
          <div className="rounded border bg-slate-50 p-4 space-y-4">
            <div className="text-sm text-gray-700">
              לאחר הלחיצה תועברי למסך הכניסה של Microsoft.
              יש להתחבר עם חשבון Microsoft 365 שמחזיק בגישה
              ל־Microsoft Bookings של הסוכן.
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
              label="שם המשתמש"
              value={config.microsoftUserName || '-'}
            />

            <InfoCard
              label="עסק Bookings"
              value={config.bookingBusinessName || '-'}
            />

            <InfoCard
              label="מזהה עסק Bookings"
              value={config.bookingBusinessId || '-'}
            />

            <InfoCard
              label="מייל העסק"
              value={config.bookingBusinessEmail || '-'}
            />

            <InfoCard
              label="טלפון העסק"
              value={config.bookingBusinessPhone || '-'}
            />

            <InfoCard
              label="חובר בתאריך"
              value={formatTimestamp(config.connectedAt)}
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
              label="פגישות בסנכרון האחרון"
              value={
                config.lastSyncAppointmentCount != null
                  ? String(config.lastSyncAppointmentCount)
                  : '-'
              }
            />
          </div>
        )}

        {config?.bookingBusinessPublicUrl && (
          <a
            href={config.bookingBusinessPublicUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex text-blue-700 underline"
          >
            פתיחת עמוד Bookings
          </a>
        )}

        {connectionStatus === 'needs_business_selection' && (
          <div className="rounded border border-yellow-300 bg-yellow-50 p-4 space-y-3">
            <div className="font-bold">
              נמצאו מספר עסקי Bookings
            </div>

            <div className="text-sm text-gray-700">
              כרגע מוצגת הרשימה לצורך בדיקה. בשלב הבא נוסיף
              פונקציה לשמירת הבחירה.
            </div>

            <div className="space-y-2">
              {(config?.availableBusinesses || []).map(
                (business) => (
                  <div
                    key={business.id}
                    className="rounded border bg-white px-3 py-2"
                  >
                    <div className="font-semibold">
                      {business.displayName}
                    </div>

                    <div className="text-xs text-gray-500">
                      {business.id}
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {connectionStatus === 'no_booking_business' && (
          <div className="rounded border border-orange-300 bg-orange-50 p-4 text-sm">
            החיבור ל־Microsoft הצליח, אך לא נמצא בחשבון עסק
            Microsoft Bookings. יש לוודא שהמשתמש המחובר מורשה
            לגשת ל־Bookings של הסוכן.
          </div>
        )}

        {config?.lastSyncError && (
          <div className="rounded border border-red-300 bg-red-50 p-4">
            <div className="font-bold text-red-800">
              שגיאת סנכרון אחרונה
            </div>

            <div className="mt-1 text-sm text-red-700 break-words">
              {config.lastSyncError}
            </div>
          </div>
        )}

        {config?.connected && (
          <div className="rounded border bg-blue-50 p-4 space-y-4 text-sm text-blue-900">
            <div>
              הסנכרון האוטומטי מתבצע כל עשר דקות.
              בשלב הבא נוסיף גם כפתור סנכרון ידני וניתוק חשבון.
            </div>

            <Button
              text={
                testingConnection
                  ? 'בודק חיבור...'
                  : 'בדוק חיבור Microsoft'
              }
              onClick={handleTestMicrosoftConnection}
              disabled={testingConnection}
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