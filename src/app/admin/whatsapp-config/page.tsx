'use client';

import React, { useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions, db } from '@/lib/firebase/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
} from 'firebase/firestore';

import { Button } from '@/components/Button/Button';
import DialogNotification from '@/components/DialogNotification';
import AccessDenied from '@/components/AccessDenied';
import { useAuth } from '@/lib/firebase/AuthContext';
import { usePermission } from '@/hooks/usePermission';

type Agent = {
  id: string;
  name: string;
};

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

type DialogKind =
  | 'info'
  | 'warning'
  | 'success'
  | 'error';

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

export default function WhatsAppConfigPage() {
  const { user, isLoading } = useAuth();

  const {
    canAccess,
    isChecking,
  } = usePermission(
    user ? 'access_whatsapp_admin' : null
  );

  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');

  const [businessId, setBusinessId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [displayPhoneNumber, setDisplayPhoneNumber] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [templateName, setTemplateName] = useState('');

  // יצירת תבנית WhatsApp חדשה
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateCategory, setNewTemplateCategory] = useState('MARKETING');
  const [newTemplateLanguage, setNewTemplateLanguage] = useState('he');
  const [newTemplateBody, setNewTemplateBody] = useState('');
  const [newTemplateExample1, setNewTemplateExample1] = useState('');
  const [newTemplateQuickReply1, setNewTemplateQuickReply1] = useState('');
  const [newTemplateQuickReply2, setNewTemplateQuickReply2] = useState('');
  const [creatingTemplate, setCreatingTemplate] = useState(false);

  // רשימת תבניות קיימות
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [refreshingTemplates, setRefreshingTemplates] = useState(false);


  const [registrationPin, setRegistrationPin] = useState('');
const [registering, setRegistering] = useState(false);

  const [
    embeddedSignupCode,
    setEmbeddedSignupCode,
  ] = useState('');

  const [saving, setSaving] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [connectingMeta, setConnectingMeta] = useState(false);
  const [metaSdkReady, setMetaSdkReady] = useState(false);

  const embeddedSignupSessionRef = useRef<{
    businessId?: string;
    wabaId?: string;
    phoneNumberId?: string;
  }>({});

  const [dialog, setDialog] =
    useState<DialogState | null>(null);


  // =====================================================
  // טעינת Facebook JavaScript SDK + אירועי Embedded Signup
  // =====================================================

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
          businessId: String(
            data.business_id ||
            data.businessId ||
            ''
          ),
          wabaId: String(
            data.waba_id ||
            data.wabaId ||
            ''
          ),
          phoneNumberId: String(
            data.phone_number_id ||
            data.phoneNumberId ||
            ''
          ),
        };

        embeddedSignupSessionRef.current = sessionData;

        if (sessionData.businessId) {
          setBusinessId(sessionData.businessId);
        }

        if (sessionData.wabaId) {
          setWabaId(sessionData.wabaId);
        }

        if (sessionData.phoneNumberId) {
          setPhoneNumberId(sessionData.phoneNumberId);
        }
      }

      if (payload?.event === 'CANCEL') {
        setConnectingMeta(false);
      }

      if (payload?.event === 'ERROR') {
        setConnectingMeta(false);

        setDialog({
          type: 'error',
          title: 'שגיאה בחיבור Meta',
          message:
            String(
              data?.error_message ||
              data?.message ||
              'תהליך החיבור מול Meta נכשל.'
            ),
        });
      }
    };

    window.addEventListener(
      'message',
      handleEmbeddedSignupMessage
    );

    if (!META_APP_ID) {
      console.error(
        '[EmbeddedSignup] Missing NEXT_PUBLIC_META_APP_ID'
      );

      return () => {
        window.removeEventListener(
          'message',
          handleEmbeddedSignupMessage
        );
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

    const existingScript =
      document.getElementById('facebook-jssdk');

    if (!existingScript) {
      const script = document.createElement('script');

      script.id = 'facebook-jssdk';
      script.src =
        'https://connect.facebook.net/en_US/sdk.js';
      script.async = true;
      script.defer = true;
      script.crossOrigin = 'anonymous';

      document.body.appendChild(script);
    } else if (window.FB) {
      window.fbAsyncInit();
    }

    return () => {
      window.removeEventListener(
        'message',
        handleEmbeddedSignupMessage
      );
    };
  }, []);


  // =====================================================
  // פתיחת Embedded Signup
  // =====================================================

  const handleConnectMeta = () => {
    if (!selectedAgentId) {
      setDialog({
        type: 'warning',
        title: 'לא נבחר סוכן',
        message:
          'יש לבחור סוכן לפני התחלת החיבור ל-Meta.',
      });
      return;
    }

    if (!META_APP_ID) {
      setDialog({
        type: 'error',
        title: 'חסרה הגדרת App ID',
        message:
          'יש להגדיר NEXT_PUBLIC_META_APP_ID בסביבת MagicSale.',
      });
      return;
    }

    if (!window.FB || !metaSdkReady) {
      setDialog({
        type: 'warning',
        title: 'Meta עדיין נטען',
        message:
          'החיבור ל-Meta עדיין נטען. נסי שוב בעוד מספר שניות.',
      });
      return;
    }

    embeddedSignupSessionRef.current = {};
    setEmbeddedSignupCode('');
    setConnectingMeta(true);

    window.FB.login(
      (response: any) => {
        const code =
          response?.authResponse?.code;

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
          message:
            'פרטי החיבור התקבלו מ-Meta. כעת ניתן לשמור את החיבור לסוכן.',
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


  // =====================================================
  // ניקוי שדות ההגדרה
  // =====================================================

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


  // =====================================================
  // טעינת רשימת סוכנים
  // =====================================================

  useEffect(() => {
    const loadAgents = async () => {
      try {
        const snap = await getDocs(
          collection(db, 'users')
        );

        const list: Agent[] = snap.docs.map((d) => {
          const data: any = d.data();

          return {
            id: d.id,
            name:
              data.fullName ||
              data.displayName ||
              data.name ||
              d.id,
          };
        });

        list.sort((a, b) =>
          a.name.localeCompare(b.name, 'he')
        );

        setAgents(list);
      } catch (e: any) {
        setDialog({
          type: 'error',
          title: 'שגיאה',
          message:
            'לא ניתן היה לטעון את רשימת הסוכנים: ' +
            String(e?.message || e),
        });
      }
    };

    loadAgents();
  }, []);



  // =====================================================
  // טעינת תבניות WhatsApp קיימות לסוכן
  // =====================================================

  const loadTemplates = async (agentId: string) => {
    if (!agentId) {
      setTemplates([]);
      return;
    }

    setLoadingTemplates(true);

    try {
      const templatesRef = collection(
        db,
        'agents',
        agentId,
        'whatsapp_templates'
      );

      const q = query(
        templatesRef,
        orderBy('updatedAt', 'desc')
      );

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


  // =====================================================
  // טעינת הגדרת WhatsApp קיימת לסוכן
  // =====================================================

  useEffect(() => {
    if (!selectedAgentId) {
      clearConfigFields();
      return;
    }

    const loadWhatsAppConfig = async () => {
      setLoadingConfig(true);

      try {
        const configRef = doc(
          db,
          'agents',
          selectedAgentId,
          'config',
          'whatsapp'
        );

        const configSnap = await getDoc(configRef);

        if (!configSnap.exists()) {
          clearConfigFields();
          return;
        }

        const data: any = configSnap.data();

        setBusinessId(
          String(data.businessId || '')
        );

        setWabaId(
          String(data.wabaId || '')
        );

        setPhoneNumberId(
          String(data.phoneNumberId || '')
        );

        setDisplayPhoneNumber(
          String(data.displayPhoneNumber || '')
        );

        setDisplayName(
          String(data.displayName || '')
        );

        setTemplateName(
          String(data.templateName || '')
        );

        // לא מחזירים טוקן או code למסך
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
    loadTemplates(selectedAgentId);

  }, [selectedAgentId]);


  // =====================================================
  // האם אפשר לשמור
  // =====================================================

  const canSave =
    !!selectedAgentId &&
    !!businessId.trim() &&
    !!wabaId.trim() &&
    !!phoneNumberId.trim() &&
    !!embeddedSignupCode.trim() &&
    !saving &&
    !loadingConfig;


  // =====================================================
  // איפוס מלא
  // =====================================================

  const resetForm = () => {
    setSelectedAgentId('');
    clearConfigFields();
  };


  // =====================================================
  // שמירה
  // =====================================================

  const handleSave = async () => {
    if (!canSave) return;

    setSaving(true);

    try {
      const fn = httpsCallable(
        functions,
        'saveAgentWhatsAppConfig'
      );

      /*
       * חשוב:
       * ה-Function דורשת redirectUri.
       *
       * אנחנו שולחים את כתובת העמוד הנוכחי,
       * ללא query string או hash.
       */
const redirectUri =
  'https://developers.facebook.com/es/oauth/callback/?product_route=whatsapp-business&business_id=757884344079063&nonce=mrToB6QAKsnjxovBkFVvB1ICSGghamg5';

      await fn({
        agentId: selectedAgentId,

        businessId:
          businessId.trim(),

        wabaId:
          wabaId.trim(),

        phoneNumberId:
          phoneNumberId.trim(),

        displayPhoneNumber:
          displayPhoneNumber.trim() || undefined,

        displayName:
          displayName.trim() || undefined,

        templateName:
          templateName.trim() || undefined,

        embeddedSignupCode:
          embeddedSignupCode.trim(),

        redirectUri,
      });


      setDialog({
        type: 'success',
        title: 'נשמר בהצלחה',
        message:
          'חיבור ה-WhatsApp נשמר והטוקן נשמר מוצפן עבור הסוכן.',
      });

      resetForm();

    } catch (e: any) {
      console.error(
        '[WhatsAppConfig] Save error:',
        e
      );

      setDialog({
        type: 'error',
        title: 'שגיאה',
        message: String(e?.message || e),
      });

    } finally {
      setSaving(false);
    }
  };




const handleRegisterPhone = async () => {
  if (!selectedAgentId || !registrationPin.trim()) {
    setDialog({
      type: 'warning',
      title: 'חסרים נתונים',
      message: 'יש לבחור סוכן ולהזין PIN.',
    });
    return;
  }

  setRegistering(true);

  try {
    const fn = httpsCallable(
      functions,
      'registerAgentWhatsAppPhone'
    );

    const result = await fn({
      agentId: selectedAgentId,
      pin: registrationPin.trim(),
    });

    console.log(
      '[registerAgentWhatsAppPhone]',
      result.data
    );

    setDialog({
      type: 'success',
      title: 'הרישום הצליח',
      message: 'מספר ה-WhatsApp נרשם בהצלחה ב-Cloud API.',
    });

    setRegistrationPin('');
  } catch (e: any) {
    console.error(
      '[registerAgentWhatsAppPhone]',
      e
    );

    setDialog({
      type: 'error',
      title: 'שגיאה ברישום המספר',
      message: String(e?.message || e),
    });
  } finally {
    setRegistering(false);
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


// =====================================================
// יצירת תבנית WhatsApp
// =====================================================

const handleCreateTemplate = async () => {
  if (
    !selectedAgentId ||
    !newTemplateName.trim() ||
    !newTemplateBody.trim()
  ) {
    setDialog({
      type: 'warning',
      title: 'חסרים נתונים',
      message: 'יש לבחור סוכן, להזין שם תבנית ותוכן הודעה.',
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
    const fn = httpsCallable(
      functions,
      'createWhatsAppTemplate'
    );

  const result = await fn({
  agentId: selectedAgentId,
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

    await loadTemplates(selectedAgentId);
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


// =====================================================
// רענון תבניות מ-Meta
// =====================================================

const handleRefreshTemplates = async () => {
  if (!selectedAgentId) {
    setDialog({
      type: 'warning',
      title: 'לא נבחר סוכן',
      message: 'יש לבחור סוכן לפני רענון התבניות.',
    });
    return;
  }

  setRefreshingTemplates(true);

  try {
    const fn = httpsCallable(
      functions,
      'refreshWhatsAppTemplates'
    );

    const result = await fn({
      agentId: selectedAgentId,
    });

    const data: any = result.data;

    await loadTemplates(selectedAgentId);

    setDialog({
      type: 'success',
      title: 'התבניות עודכנו',
      message:
        `עודכנו ${data?.count ?? 0} תבניות מ-Meta.`,
    });
  } catch (e: any) {
    console.error(
      '[refreshWhatsAppTemplates]',
      e
    );

    setDialog({
      type: 'error',
      title: 'שגיאה ברענון תבניות',
      message: String(e?.message || e),
    });
  } finally {
    setRefreshingTemplates(false);
  }
};


  // =====================================================
  // UI
  // =====================================================

  return (
      <div
        className="p-6 max-w-2xl mx-auto text-right"
        dir="rtl"
      >

        <h1 className="text-2xl font-bold mb-4">
          ⚙️ הגדרת WhatsApp לסוכן
        </h1>


        <div className="border rounded p-4 bg-white space-y-4">


          {/* בחירת סוכן */}

          <select
            className="border rounded px-2 py-2 w-full"
            value={selectedAgentId}
            onChange={(e) =>
              setSelectedAgentId(e.target.value)
            }
          >
            <option value="">
              בחר/י סוכן
            </option>

            {agents.map((a) => (
              <option
                key={a.id}
                value={a.id}
              >
                {a.name}
              </option>
            ))}
          </select>


          {loadingConfig && (
            <div className="text-sm text-gray-500">
              טוען הגדרות קיימות...
            </div>
          )}


          {/* Embedded Signup */}

          <div className="rounded-lg border bg-slate-50 p-4 space-y-3">
            <div>
              <div className="font-bold">
                חיבור WhatsApp Business דרך Meta
              </div>

              <div className="text-sm text-gray-500 mt-1">
                בחרי סוכן והתחילי את תהליך החיבור המאובטח של Meta.
                פרטי ה-WABA ומספר הטלפון ייקלטו אוטומטית.
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                text={
                  connectingMeta
                    ? '⏳ מתחבר ל-Meta...'
                    : 'חיבור WhatsApp Business'
                }
                type="primary"
                onClick={handleConnectMeta}
                disabled={
                  !selectedAgentId ||
                  connectingMeta ||
                  !metaSdkReady
                }
              />
            </div>

            {!META_APP_ID && (
              <div className="text-sm text-red-600">
                חסר NEXT_PUBLIC_META_APP_ID בסביבת הפרויקט.
              </div>
            )}

            {META_APP_ID && !metaSdkReady && (
              <div className="text-sm text-gray-500">
                טוען את חיבור Meta...
              </div>
            )}

            {!!embeddedSignupCode && (
              <div className="text-sm text-green-700">
                ✓ התקבל קוד חיבור מ-Meta. ניתן לשמור את החיבור.
              </div>
            )}
          </div>


          {/* Business ID */}

          <input
            className="border rounded px-2 py-2 w-full font-mono"
            value={businessId}
            onChange={(e) =>
              setBusinessId(e.target.value)
            }
            placeholder="Business ID"
          />


          {/* WABA ID */}

          <input
            className="border rounded px-2 py-2 w-full font-mono"
            value={wabaId}
            onChange={(e) =>
              setWabaId(e.target.value)
            }
            placeholder="WABA ID"
          />


          {/* Phone Number ID */}

          <input
            className="border rounded px-2 py-2 w-full font-mono"
            value={phoneNumberId}
            onChange={(e) =>
              setPhoneNumberId(e.target.value)
            }
            placeholder="Phone Number ID"
          />


          {/* Display Phone Number */}

          <input
            className="border rounded px-2 py-2 w-full font-mono"
            value={displayPhoneNumber}
            onChange={(e) =>
              setDisplayPhoneNumber(e.target.value)
            }
            placeholder="Display Phone Number"
          />


          {/* Display Name */}

          <input
            className="border rounded px-2 py-2 w-full"
            value={displayName}
            onChange={(e) =>
              setDisplayName(e.target.value)
            }
            placeholder="Display Name"
          />


          {/* Template Name */}

          <input
            className="border rounded px-2 py-2 w-full font-mono"
            value={templateName}
            onChange={(e) =>
              setTemplateName(e.target.value)
            }
            placeholder="Template Name"
          />


          {/* Embedded Signup Code נשמר בזיכרון בלבד ואינו מוצג למשתמש */}

          {!!embeddedSignupCode && (
            <div className="rounded border border-green-200 bg-green-50 p-2 text-sm text-green-700">
              קוד החיבור התקבל בהצלחה מ-Meta.
            </div>
          )}
<div className="border-t pt-4 mt-4">

  <div className="font-bold mb-2">
    רישום המספר ב-Cloud API
  </div>

  <input
    className="border rounded px-2 py-2 w-full font-mono"
    type="password"
    value={registrationPin}
    onChange={(e) =>
      setRegistrationPin(e.target.value)
    }
    placeholder="PIN דו-שלבי של מספר WhatsApp"
  />

  <div className="flex justify-end mt-3">
    <Button
      text={
        registering
          ? '⏳ רושם...'
          : 'רישום מספר WhatsApp'
      }
      type="primary"
      onClick={handleRegisterPhone}
      disabled={
        !selectedAgentId ||
        !registrationPin.trim() ||
        registering
      }
    />
  </div>

</div>

          {/* יצירת תבנית WhatsApp */}

          <div className="border-t pt-4 mt-4 space-y-3">

            <div>
              <div className="font-bold">
                יצירת תבנית WhatsApp
              </div>

              <div className="text-sm text-gray-500 mt-1">
                יצירת תבנית חדשה עבור הסוכן שנבחר ושליחתה לאישור Meta.
              </div>
            </div>

            <input
              className="border rounded px-2 py-2 w-full font-mono"
              value={newTemplateName}
              onChange={(e) =>
                setNewTemplateName(e.target.value)
              }
              placeholder="Template Name, לדוגמה: renewal_conversation"
            />

            <select
              className="border rounded px-2 py-2 w-full"
              value={newTemplateCategory}
              onChange={(e) =>
                setNewTemplateCategory(e.target.value)
              }
            >
              <option value="MARKETING">
                MARKETING
              </option>
              <option value="UTILITY">
                UTILITY
              </option>
              <option value="AUTHENTICATION">
                AUTHENTICATION
              </option>
            </select>

            <select
              className="border rounded px-2 py-2 w-full"
              value={newTemplateLanguage}
              onChange={(e) =>
                setNewTemplateLanguage(e.target.value)
              }
            >
              <option value="he">
                עברית (he)
              </option>
              <option value="en">
                English (en)
              </option>
            </select>

            <textarea
              className="border rounded px-2 py-2 w-full"
              rows={6}
              value={newTemplateBody}
              onChange={(e) =>
                setNewTemplateBody(e.target.value)
              }
              placeholder="תוכן התבנית"
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
              />

              <input
                className="border rounded px-2 py-2 w-full"
                value={newTemplateQuickReply2}
                onChange={(e) =>
                  setNewTemplateQuickReply2(e.target.value)
                }
                placeholder="לא מעוניין כרגע"
              />

              <button
                type="button"
                className="text-sm text-blue-700 underline"
                onClick={() => {
                  setNewTemplateQuickReply1('כן, אשמח לקבוע');
                  setNewTemplateQuickReply2('לא מעוניין כרגע');
                }}
              >
                מילוי הכפתורים המומלצים
              </button>
            </div>

            <div className="flex justify-end">
              <Button
                text={
                  creatingTemplate
                    ? '⏳ יוצר תבנית...'
                    : 'יצירת תבנית'
                }
                type="primary"
                onClick={handleCreateTemplate}
                disabled={
                  !selectedAgentId ||
                  !newTemplateName.trim() ||
                  !newTemplateBody.trim() ||
                  creatingTemplate
                }
              />
            </div>

          </div>

          {/* רשימת תבניות WhatsApp */}

          <div className="border-t pt-4 mt-4 space-y-3">

            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-bold">
                  תבניות WhatsApp של הסוכן
                </div>

                <div className="text-sm text-gray-500 mt-1">
                  כאן מוצגות התבניות שנשמרו במערכת. ניתן לרענן סטטוס מול Meta.
                </div>
              </div>

              <Button
                text={
                  refreshingTemplates
                    ? '⏳ מרענן...'
                    : 'רענון מ-Meta'
                }
                type="secondary"
                onClick={handleRefreshTemplates}
                disabled={
                  !selectedAgentId ||
                  refreshingTemplates ||
                  loadingTemplates
                }
              />
            </div>

            {loadingTemplates && (
              <div className="text-sm text-gray-500">
                טוען תבניות...
              </div>
            )}

            {!loadingTemplates && templates.length === 0 && (
              <div className="text-sm text-gray-500 border rounded p-3 bg-gray-50">
                אין עדיין תבניות שמורות לסוכן הזה.
              </div>
            )}

            {!loadingTemplates && templates.length > 0 && (
              <div className="overflow-x-auto border rounded">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="p-2 text-right">
                        שם תבנית
                      </th>
                      <th className="p-2 text-right">
                        קטגוריה
                      </th>
                      <th className="p-2 text-right">
                        שפה
                      </th>
                      <th className="p-2 text-right">
                        סטטוס
                      </th>
                      <th className="p-2 text-right">
                        תוכן
                      </th>
                      <th className="p-2 text-right">
                        כפתורים
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {templates.map((t) => (
                      <tr
                        key={t.id}
                        className="border-t"
                      >
                        <td className="p-2 font-mono">
                          {t.name}
                        </td>
                        <td className="p-2">
                          {t.category || '-'}
                        </td>
                        <td className="p-2">
                          {t.language || '-'}
                        </td>
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

          {/* שמירה */}

          <div className="flex justify-end">
            <Button
              text={
                saving
                  ? '⏳ שומר...'
                  : 'שמור'
              }
              type="primary"
              onClick={handleSave}
              disabled={!canSave}
            />
          </div>

        </div>


        {dialog && (
          <DialogNotification
            type={dialog.type}
            title={dialog.title}
            message={dialog.message}
            onConfirm={() =>
              setDialog(null)
            }
            confirmText="סגור"
            hideCancel
          />
        )}

      </div>

  );
}