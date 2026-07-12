'use client';

import React, { useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
} from 'firebase/firestore';

import { db, functions } from '@/lib/firebase/firebase';
import { useAuth } from '@/lib/firebase/AuthContext';
import { usePermission } from '@/hooks/usePermission';
import { Button } from '@/components/Button/Button';
import DialogNotification from '@/components/DialogNotification';
import AccessDenied from '@/components/AccessDenied';

type WhatsAppTemplate = {
  id: string;
  name: string;
  category?: string;
  language?: string;
  bodyText?: string;
  status?: string;
  updatedAt?: any;
  bodyVariableCount?: number;
  bodyExamples?: string[];
  quickReplyButtons?: string[];
};

type DialogKind = 'info' | 'warning' | 'success' | 'error';

type DialogState = {
  type: DialogKind;
  title: string;
  message: string;
};

const META_APP_ID = process.env.NEXT_PUBLIC_META_APP_ID || '';
const EMBEDDED_SIGNUP_CONFIG_ID = '3303093589871398';

declare global {
  interface Window {
    FB?: {
      init: (options: Record<string, any>) => void;
      login: (
        callback: (response: any) => void,
        options: Record<string, any>
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

export default function WhatsAppSettingsPage() {
  const { user, detail, isLoading } = useAuth() as any;

  const { canAccess, isChecking } = usePermission(
    user ? 'access_whatsapp_manage' : null
  );

  const agentId = String(detail?.agentId || '');

  const [activeTab, setActiveTab] = useState<'connect' | 'templates'>('connect');

  const [businessId, setBusinessId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [displayPhoneNumber, setDisplayPhoneNumber] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [templateName, setTemplateName] = useState('');

  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateCategory, setNewTemplateCategory] = useState('MARKETING');
  const [newTemplateLanguage, setNewTemplateLanguage] = useState('he');
  const [newTemplateBody, setNewTemplateBody] = useState('');
  const [newTemplateExample1, setNewTemplateExample1] = useState('');
  const [newTemplateQuickReply1, setNewTemplateQuickReply1] = useState('');
  const [newTemplateQuickReply2, setNewTemplateQuickReply2] = useState('');
  const [creatingTemplate, setCreatingTemplate] = useState(false);

  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [refreshingTemplates, setRefreshingTemplates] = useState(false);

  const [embeddedSignupCode, setEmbeddedSignupCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [connectingMeta, setConnectingMeta] = useState(false);
  const [metaSdkReady, setMetaSdkReady] = useState(false);

  const [dialog, setDialog] = useState<DialogState | null>(null);

  const embeddedSignupSessionRef = useRef<{
    businessId?: string;
    wabaId?: string;
    phoneNumberId?: string;
  }>({});

  const isConnected = !!phoneNumberId && !!wabaId;

  const canSave =
    !!agentId &&
    !!businessId.trim() &&
    !!wabaId.trim() &&
    !!phoneNumberId.trim() &&
    !!embeddedSignupCode.trim() &&
    !saving &&
    !loadingConfig;

  const clearConfigFields = () => {
    setBusinessId('');
    setWabaId('');
    setPhoneNumberId('');
    setDisplayPhoneNumber('');
    setDisplayName('');
    setTemplateName('');
    setEmbeddedSignupCode('');
    setTemplates([]);
  };

  useEffect(() => {
    const handleEmbeddedSignupMessage = (event: MessageEvent) => {
      if (
        event.origin !== 'https://www.facebook.com' &&
        event.origin !== 'https://web.facebook.com'
      ) {
        return;
      }

      let payload: any = event.data;

      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch {
          return;
        }
      }

      if (payload?.type !== 'WA_EMBEDDED_SIGNUP') return;

      const data = payload?.data || {};

      if (payload?.event === 'FINISH') {
        const sessionData = {
          businessId: String(data.business_id || data.businessId || ''),
          wabaId: String(data.waba_id || data.wabaId || ''),
          phoneNumberId: String(data.phone_number_id || data.phoneNumberId || ''),
        };

        embeddedSignupSessionRef.current = sessionData;

        if (sessionData.businessId) setBusinessId(sessionData.businessId);
        if (sessionData.wabaId) setWabaId(sessionData.wabaId);
        if (sessionData.phoneNumberId) setPhoneNumberId(sessionData.phoneNumberId);
      }

      if (payload?.event === 'CANCEL') {
        setConnectingMeta(false);
      }

      if (payload?.event === 'ERROR') {
        setConnectingMeta(false);
        setDialog({
          type: 'error',
          title: 'שגיאה בחיבור Meta',
          message: String(
            data?.error_message ||
              data?.message ||
              'תהליך החיבור מול Meta נכשל.'
          ),
        });
      }
    };

    window.addEventListener('message', handleEmbeddedSignupMessage);

    if (!META_APP_ID) {
      return () => {
        window.removeEventListener('message', handleEmbeddedSignupMessage);
      };
    }

    window.fbAsyncInit = () => {
      window.FB?.init({
        appId: META_APP_ID,
        cookie: true,
        xfbml: false,
        version: 'v24.0',
      });

      setMetaSdkReady(true);
    };

    const existingScript = document.getElementById('facebook-jssdk');

    if (!existingScript) {
      const script = document.createElement('script');
      script.id = 'facebook-jssdk';
      script.src = 'https://connect.facebook.net/en_US/sdk.js';
      script.async = true;
      script.defer = true;
      script.crossOrigin = 'anonymous';
      document.body.appendChild(script);
    } else if (window.FB) {
      window.fbAsyncInit();
    }

    return () => {
      window.removeEventListener('message', handleEmbeddedSignupMessage);
    };
  }, []);

  const loadTemplates = async (currentAgentId: string) => {
    if (!currentAgentId) {
      setTemplates([]);
      return;
    }

    setLoadingTemplates(true);

    try {
      const templatesRef = collection(
        db,
        'agents',
        currentAgentId,
        'whatsapp_templates'
      );

      const q = query(templatesRef, orderBy('updatedAt', 'desc'));
      const snap = await getDocs(q);

      const list: WhatsAppTemplate[] = snap.docs.map((d) => {
        const data: any = d.data();

        return {
          id: d.id,
          name: String(data.name || d.id),
          category: data.category,
          language: data.language,
          bodyText: data.bodyText,
          status: data.status,
          updatedAt: data.updatedAt,
          bodyVariableCount: Number(data.bodyVariableCount || 0),
          bodyExamples: Array.isArray(data.bodyExamples)
            ? data.bodyExamples.map((value: unknown) => String(value))
            : [],
          quickReplyButtons: Array.isArray(data.quickReplyButtons)
            ? data.quickReplyButtons.map((value: unknown) => String(value))
            : [],
        };
      });

      setTemplates(list);
    } catch (e: any) {
      console.error('[loadTemplates]', e);
      setTemplates([]);
      setDialog({
        type: 'error',
        title: 'שגיאה בטעינת תבניות',
        message: String(e?.message || e),
      });
    } finally {
      setLoadingTemplates(false);
    }
  };

  useEffect(() => {
    if (!agentId) {
      clearConfigFields();
      return;
    }

    const loadWhatsAppConfig = async () => {
      setLoadingConfig(true);

      try {
        const configRef = doc(db, 'agents', agentId, 'config', 'whatsapp');
        const configSnap = await getDoc(configRef);

        if (!configSnap.exists()) {
          clearConfigFields();
          return;
        }

        const data: any = configSnap.data();

        setBusinessId(String(data.businessId || ''));
        setWabaId(String(data.wabaId || ''));
        setPhoneNumberId(String(data.phoneNumberId || ''));
        setDisplayPhoneNumber(String(data.displayPhoneNumber || ''));
        setDisplayName(String(data.displayName || ''));
        setTemplateName(String(data.templateName || ''));
        setEmbeddedSignupCode('');
      } catch (e: any) {
        clearConfigFields();
        setDialog({
          type: 'error',
          title: 'שגיאה בטעינת ההגדרות',
          message: String(e?.message || e),
        });
      } finally {
        setLoadingConfig(false);
      }
    };

    loadWhatsAppConfig();
    loadTemplates(agentId);
  }, [agentId]);

  const handleConnectMeta = () => {
    if (!agentId) {
      setDialog({
        type: 'warning',
        title: 'לא נמצא סוכן',
        message: 'לא נמצא agentId למשתמש המחובר.',
      });
      return;
    }

    if (!META_APP_ID) {
      setDialog({
        type: 'error',
        title: 'חסרה הגדרת App ID',
        message: 'יש להגדיר NEXT_PUBLIC_META_APP_ID בסביבת MagicSale.',
      });
      return;
    }

    if (!window.FB || !metaSdkReady) {
      setDialog({
        type: 'warning',
        title: 'Meta עדיין נטען',
        message: 'החיבור ל-Meta עדיין נטען. נסי שוב בעוד מספר שניות.',
      });
      return;
    }

    embeddedSignupSessionRef.current = {};
    setEmbeddedSignupCode('');
    setConnectingMeta(true);

    window.FB.login(
      (response: any) => {
        const code = response?.authResponse?.code;

        if (!code) {
          setConnectingMeta(false);
          setDialog({
            type: 'warning',
            title: 'החיבור לא הושלם',
            message:
              'Meta לא החזירה קוד חיבור. אם החלון נסגר או בוטל, ניתן לנסות שוב.',
          });
          return;
        }

        setEmbeddedSignupCode(String(code));
        setConnectingMeta(false);
        setDialog({
          type: 'success',
          title: 'החיבור ל-Meta הושלם',
          message: 'פרטי החיבור התקבלו מ-Meta. כעת ניתן לשמור את החיבור.',
        });
      },
      {
        config_id: EMBEDDED_SIGNUP_CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: '',
          sessionInfoVersion: '3',
        },
      }
    );
  };

  const handleSave = async () => {
    if (!canSave) return;

    setSaving(true);

    try {
      const fn = httpsCallable(functions, 'saveAgentWhatsAppConfig');

      const redirectUri =
        'https://developers.facebook.com/es/oauth/callback/?product_route=whatsapp-business&business_id=757884344079063&nonce=mrToB6QAKsnjxovBkFVvB1ICSGghamg5';

      await fn({
        agentId,
        businessId: businessId.trim(),
        wabaId: wabaId.trim(),
        phoneNumberId: phoneNumberId.trim(),
        displayPhoneNumber: displayPhoneNumber.trim() || undefined,
        displayName: displayName.trim() || undefined,
        templateName: templateName.trim() || undefined,
        embeddedSignupCode: embeddedSignupCode.trim(),
        redirectUri,
      });

      setDialog({
        type: 'success',
        title: 'החיבור נשמר בהצלחה',
        message: 'חשבון WhatsApp Business חובר ונשמר במערכת.',
      });

      setEmbeddedSignupCode('');
      await loadTemplates(agentId);
    } catch (e: any) {
      console.error('[WhatsAppSettings] Save error:', e);
      setDialog({
        type: 'error',
        title: 'שגיאה בשמירת החיבור',
        message: String(e?.message || e),
      });
    } finally {
      setSaving(false);
    }
  };


  const getTemplateVariableNumbers = (value: string): number[] => {
    const matches = Array.from(value.matchAll(/\{\{(\d+)\}\}/g));

    return Array.from(
      new Set(
        matches
          .map((match) => Number(match[1]))
          .filter((number) => Number.isInteger(number) && number > 0)
      )
    ).sort((a, b) => a - b);
  };

  const handleCreateTemplate = async () => {
    if (!agentId || !newTemplateName.trim() || !newTemplateBody.trim()) {
      setDialog({
        type: 'warning',
        title: 'חסרים נתונים',
        message: 'יש להזין שם תבנית ותוכן הודעה.',
      });
      return;
    }

    const variableNumbers = getTemplateVariableNumbers(newTemplateBody);

    if (
      variableNumbers.length > 0 &&
      (variableNumbers.length !== 1 || variableNumbers[0] !== 1)
    ) {
      setDialog({
        type: 'warning',
        title: 'משתנים לא תקינים',
        message: 'בשלב זה המסך תומך במשתנה אחד בלבד: {{1}} עבור שם הלקוח.',
      });
      return;
    }

    if (variableNumbers.length === 1 && !newTemplateExample1.trim()) {
      setDialog({
        type: 'warning',
        title: 'חסרה דוגמה למשתנה',
        message: 'התבנית כוללת את {{1}}. יש להזין דוגמה, למשל: ישראל.',
      });
      return;
    }

    const quickReplyButtons = [
      newTemplateQuickReply1.trim(),
      newTemplateQuickReply2.trim(),
    ].filter(Boolean);

    if (
      quickReplyButtons.length === 2 &&
      quickReplyButtons[0] === quickReplyButtons[1]
    ) {
      setDialog({
        type: 'warning',
        title: 'כפתורים זהים',
        message: 'יש להזין טקסט שונה לכל כפתור תגובה.',
      });
      return;
    }

    setCreatingTemplate(true);

    try {
      const fn = httpsCallable(functions, 'createWhatsAppTemplate');

   const result = await fn({
  agentId,
  name: newTemplateName.trim(),
  category: newTemplateCategory,
  language: newTemplateLanguage,
  bodyText: newTemplateBody.trim(),

  bodyExamples:
    variableNumbers.length === 1
      ? [newTemplateExample1.trim()]
      : [],

  quickReplyButtons,

  quickReplyActions: {
    ...(newTemplateQuickReply1.trim()
      ? {
          [newTemplateQuickReply1.trim()]:
            "interested",
        }
      : {}),

    ...(newTemplateQuickReply2.trim()
      ? {
          [newTemplateQuickReply2.trim()]:
            "declined",
        }
      : {}),
  },
});

      const data: any = result.data;

      setDialog({
        type: 'success',
        title: 'התבנית נוצרה',
        message:
          `התבנית ${data?.name || newTemplateName.trim()} נשלחה ל-Meta. ` +
          `סטטוס: ${data?.status || 'PENDING'}`,
      });

      setNewTemplateName('');
      setNewTemplateBody('');
      setNewTemplateExample1('');
      setNewTemplateQuickReply1('');
      setNewTemplateQuickReply2('');

      await loadTemplates(agentId);
    } catch (e: any) {
      console.error('[createWhatsAppTemplate]', e);
      setDialog({
        type: 'error',
        title: 'שגיאה ביצירת התבנית',
        message: String(e?.message || e),
      });
    } finally {
      setCreatingTemplate(false);
    }
  };

  const handleRefreshTemplates = async () => {
    if (!agentId) {
      setDialog({
        type: 'warning',
        title: 'לא נמצא סוכן',
        message: 'לא נמצא agentId למשתמש המחובר.',
      });
      return;
    }

    setRefreshingTemplates(true);

    try {
      const fn = httpsCallable(functions, 'refreshWhatsAppTemplates');
      const result = await fn({ agentId });
      const data: any = result.data;

      await loadTemplates(agentId);

      setDialog({
        type: 'success',
        title: 'התבניות עודכנו',
        message: `עודכנו ${data?.count ?? 0} תבניות מ-Meta.`,
      });
    } catch (e: any) {
      console.error('[refreshWhatsAppTemplates]', e);
      setDialog({
        type: 'error',
        title: 'שגיאה ברענון תבניות',
        message: String(e?.message || e),
      });
    } finally {
      setRefreshingTemplates(false);
    }
  };

  if (isLoading || isChecking) {
    return (
      <div className="p-6 text-right" dir="rtl">
        טוען...
      </div>
    );
  }

  if (!canAccess) {
    return <AccessDenied />;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto text-right" dir="rtl">
      <h1 className="text-2xl font-bold mb-2">הגדרות WhatsApp</h1>

      <p className="text-sm text-gray-500 mb-6">
        כאן ניתן לחבר את חשבון WhatsApp Business של הסוכנות ולנהל תבניות הודעה.
      </p>

      {!agentId && (
        <div className="rounded border border-red-200 bg-red-50 p-4 text-red-700 mb-4">
          לא נמצא agentId למשתמש המחובר. יש לפנות למנהל המערכת.
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setActiveTab('connect')}
          className={`rounded px-4 py-2 border ${
            activeTab === 'connect' ? 'bg-blue-600 text-white' : 'bg-white'
          }`}
        >
          חיבור WhatsApp
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('templates')}
          className={`rounded px-4 py-2 border ${
            activeTab === 'templates' ? 'bg-blue-600 text-white' : 'bg-white'
          }`}
        >
          תבניות
        </button>
      </div>

      {activeTab === 'connect' && (
        <div className="border rounded bg-white p-5 space-y-5">
          <div className="rounded-lg border bg-slate-50 p-4">
            <div className="font-bold mb-1">סטטוס חיבור</div>

            {loadingConfig ? (
              <div className="text-sm text-gray-500">טוען הגדרות חיבור...</div>
            ) : isConnected ? (
              <div className="space-y-2">
                <div className="text-green-700 font-bold">
                  ✓ חשבון WhatsApp Business מחובר
                </div>

                <div className="text-sm text-gray-700">
                  <strong>מספר מחובר:</strong>{' '}
                  {displayPhoneNumber || 'לא הוגדר'}
                </div>

                <div className="text-sm text-gray-700">
                  <strong>שם תצוגה:</strong> {displayName || 'לא הוגדר'}
                </div>
              </div>
            ) : (
              <div className="text-orange-700 font-bold">
                חשבון WhatsApp Business עדיין לא מחובר
              </div>
            )}
          </div>

          <div className="rounded-lg border p-4 space-y-3">
            <div>
              <div className="font-bold">חיבור WhatsApp Business דרך Meta</div>

              <div className="text-sm text-gray-500 mt-1">
                לחיצה על הכפתור תפתח את תהליך החיבור המאובטח של Meta.
                בסיום התהליך פרטי חשבון ה-WhatsApp Business יישמרו במערכת.
              </div>
            </div>

            {!META_APP_ID && (
              <div className="text-sm text-red-600">
                חסר NEXT_PUBLIC_META_APP_ID בסביבת הפרויקט.
              </div>
            )}

            {META_APP_ID && !metaSdkReady && (
              <div className="text-sm text-gray-500">טוען את חיבור Meta...</div>
            )}

            {isConnected ? (
              <div className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                ✓ החשבון מחובר בהצלחה. אין צורך לבצע חיבור נוסף.
              </div>
            ) : (
              <>
                <div className="flex justify-end">
                  <Button
                    text={
                      connectingMeta
                        ? '⏳ מתחבר ל-Meta...'
                        : 'חיבור WhatsApp Business'
                    }
                    type="primary"
                    onClick={handleConnectMeta}
                    disabled={!agentId || connectingMeta || !metaSdkReady}
                  />
                </div>

                {!!embeddedSignupCode && (
                  <div className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                    ✓ החיבור מול Meta הושלם. לחצי על שמירה כדי לשמור את החיבור
                    במערכת.
                  </div>
                )}

                <div className="flex justify-end">
                  <Button
                    text={saving ? '⏳ שומר...' : 'שמור חיבור'}
                    type="primary"
                    onClick={handleSave}
                    disabled={!canSave}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === 'templates' && (
        <div className="border rounded bg-white p-5 space-y-6">
          <div className="space-y-3">
            <div>
              <div className="font-bold">יצירת תבנית WhatsApp</div>

              <div className="text-sm text-gray-500 mt-1">
                תבנית חדשה נשלחת לאישור Meta. לאחר האישור ניתן להשתמש בה
                לשליחת הודעות יזומות.
              </div>
            </div>

            <input
              className="border rounded px-2 py-2 w-full font-mono"
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              placeholder="Template Name, לדוגמה: renewal_conversation"
              disabled={!isConnected}
            />

            <select
              className="border rounded px-2 py-2 w-full"
              value={newTemplateCategory}
              onChange={(e) => setNewTemplateCategory(e.target.value)}
              disabled={!isConnected}
            >
              <option value="MARKETING">MARKETING</option>
              <option value="UTILITY">UTILITY</option>
              <option value="AUTHENTICATION">AUTHENTICATION</option>
            </select>

            <select
              className="border rounded px-2 py-2 w-full"
              value={newTemplateLanguage}
              onChange={(e) => setNewTemplateLanguage(e.target.value)}
              disabled={!isConnected}
            >
              <option value="he">עברית (he)</option>
              <option value="en">English (en)</option>
            </select>

            <textarea
              className="border rounded px-2 py-2 w-full"
              rows={6}
              value={newTemplateBody}
              onChange={(e) => setNewTemplateBody(e.target.value)}
              placeholder="תוכן התבנית"
              disabled={!isConnected}
            />

            <div className="rounded border bg-slate-50 p-3 text-sm text-gray-600">
              ניתן לשלב את שם הלקוח באמצעות המשתנה{' '}
              <span className="font-mono font-bold">{'{{1}}'}</span>.
              לדוגמה: שלום {'{{1}}'},
            </div>

            {getTemplateVariableNumbers(newTemplateBody).includes(1) && (
              <div className="space-y-1">
                <label className="block text-sm font-bold">
                  דוגמה למשתנה {'{{1}}'}
                </label>

                <input
                  className="border rounded px-2 py-2 w-full"
                  value={newTemplateExample1}
                  onChange={(e) =>
                    setNewTemplateExample1(e.target.value)
                  }
                  placeholder="לדוגמה: ישראל"
                  disabled={!isConnected}
                />
              </div>
            )}

            <div className="rounded border p-3 space-y-3">
              <div>
                <div className="font-bold">
                  כפתורי תגובה מהירה
                </div>

                <div className="text-sm text-gray-500 mt-1">
                  אופציונלי. עבור תהליך הזימון מומלץ להשתמש בשני הכפתורים המוצעים.
                </div>
              </div>

              <input
                className="border rounded px-2 py-2 w-full"
                value={newTemplateQuickReply1}
                onChange={(e) =>
                  setNewTemplateQuickReply1(e.target.value)
                }
                placeholder="כן, אשמח לקבוע"
                disabled={!isConnected}
              />

              <input
                className="border rounded px-2 py-2 w-full"
                value={newTemplateQuickReply2}
                onChange={(e) =>
                  setNewTemplateQuickReply2(e.target.value)
                }
                placeholder="לא מעוניין כרגע"
                disabled={!isConnected}
              />

              <button
                type="button"
                className="text-sm text-blue-700 underline disabled:text-gray-400"
                onClick={() => {
                  setNewTemplateQuickReply1('כן, אשמח לקבוע');
                  setNewTemplateQuickReply2('לא מעוניין כרגע');
                }}
                disabled={!isConnected}
              >
                מילוי הכפתורים המומלצים
              </button>
            </div>

            {!isConnected && (
              <div className="text-sm text-orange-700">
                יש לחבר חשבון WhatsApp Business לפני יצירת תבניות.
              </div>
            )}

            <div className="flex justify-end">
              <Button
                text={creatingTemplate ? '⏳ יוצר תבנית...' : 'יצירת תבנית'}
                type="primary"
                onClick={handleCreateTemplate}
                disabled={
                  !isConnected ||
                  !newTemplateName.trim() ||
                  !newTemplateBody.trim() ||
                  creatingTemplate
                }
              />
            </div>
          </div>

          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-bold">תבניות WhatsApp</div>

                <div className="text-sm text-gray-500 mt-1">
                  כאן מוצגות התבניות שנשמרו במערכת וסטטוס האישור שלהן מול
                  Meta.
                </div>
              </div>

              <Button
                text={refreshingTemplates ? '⏳ מרענן...' : 'רענון מ-Meta'}
                type="secondary"
                onClick={handleRefreshTemplates}
                disabled={!isConnected || refreshingTemplates || loadingTemplates}
              />
            </div>

            {loadingTemplates && (
              <div className="text-sm text-gray-500">טוען תבניות...</div>
            )}

            {!loadingTemplates && templates.length === 0 && (
              <div className="text-sm text-gray-500 border rounded p-3 bg-gray-50">
                אין עדיין תבניות שמורות.
              </div>
            )}

            {!loadingTemplates && templates.length > 0 && (
              <div className="overflow-x-auto border rounded">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="p-2 text-right">שם תבנית</th>
                      <th className="p-2 text-right">קטגוריה</th>
                      <th className="p-2 text-right">שפה</th>
                      <th className="p-2 text-right">סטטוס</th>
                      <th className="p-2 text-right">תוכן</th>
                      <th className="p-2 text-right">כפתורים</th>
                    </tr>
                  </thead>

                  <tbody>
                    {templates.map((t) => (
                      <tr key={t.id} className="border-t">
                        <td className="p-2 font-mono">{t.name}</td>
                        <td className="p-2">{t.category || '-'}</td>
                        <td className="p-2">{t.language || '-'}</td>
                        <td className="p-2">
                          <span className="inline-flex rounded-full bg-gray-100 px-2 py-1 text-xs font-bold">
                            {t.status || 'UNKNOWN'}
                          </span>
                        </td>
                        <td className="p-2 max-w-xs truncate">
                          {t.bodyText || '-'}
                        </td>
                        <td className="p-2">
                          {t.quickReplyButtons?.length
                            ? t.quickReplyButtons.join(' | ')
                            : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {dialog && (
        <DialogNotification
          type={dialog.type}
          title={dialog.title}
          message={dialog.message}
          onConfirm={() => setDialog(null)}
          confirmText="סגור"
          hideCancel
        />
      )}
    </div>
  );
}