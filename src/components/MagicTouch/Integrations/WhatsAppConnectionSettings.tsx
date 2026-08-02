"use client";

import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  httpsCallable,
} from "firebase/functions";

import {
  doc,
  getDoc,
} from "firebase/firestore";

import {
  db,
  functions,
} from "@/lib/firebase/firebase";

import {
  useAuth,
} from "@/lib/firebase/AuthContext";

import {
  usePermission,
} from "@/hooks/usePermission";

import {
  Button,
} from "@/components/Button/Button";

import DialogNotification from "@/components/DialogNotification";
import AccessDenied from "@/components/AccessDenied";

type DialogKind =
  | "info"
  | "warning"
  | "success"
  | "error";

type DialogState = {
  type: DialogKind;
  title: string;
  message: string;
};

const META_APP_ID =
  process.env.NEXT_PUBLIC_META_APP_ID ||
  "";

const EMBEDDED_SIGNUP_CONFIG_ID =
  "3303093589871398";

declare global {
  interface Window {
    FB?: {
      init: (
        options:
          Record<string, unknown>
      ) => void;

      login: (
        callback:
          (
            response:
              Record<string, any>
          ) => void,

        options:
          Record<string, unknown>
      ) => void;
    };

    fbAsyncInit?:
      () => void;
  }
}

export default function WhatsAppConnectionSettings() {
  const {
    user,
    detail,
    isLoading,
  } =
    useAuth() as any;

  const {
    canAccess,
    isChecking,
  } =
    usePermission(
      user
        ? "access_magic_touch"
        : null
    );

  const agentId =
    String(
      detail?.agentId ||
      user?.uid ||
      ""
    ).trim();

  const [
    businessId,
    setBusinessId,
  ] =
    useState("");

  const [
    wabaId,
    setWabaId,
  ] =
    useState("");

  const [
    phoneNumberId,
    setPhoneNumberId,
  ] =
    useState("");

  const [
    displayPhoneNumber,
    setDisplayPhoneNumber,
  ] =
    useState("");

  const [
    displayName,
    setDisplayName,
  ] =
    useState("");

  const [
    templateName,
    setTemplateName,
  ] =
    useState("");

  const [
    embeddedSignupCode,
    setEmbeddedSignupCode,
  ] =
    useState("");

  const [
    loadingConfig,
    setLoadingConfig,
  ] =
    useState(false);

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const [
    connectingMeta,
    setConnectingMeta,
  ] =
    useState(false);

  const [
    metaSdkReady,
    setMetaSdkReady,
  ] =
    useState(false);

  const [
    isPersistedConnected,
    setIsPersistedConnected,
  ] =
    useState(false);

  const [
    dialog,
    setDialog,
  ] =
    useState<DialogState | null>(
      null
    );

  const embeddedSignupSessionRef =
    useRef<{
      businessId?: string;
      wabaId?: string;
      phoneNumberId?: string;
    }>({});

  const canSave =
    Boolean(agentId) &&
    Boolean(
      businessId.trim()
    ) &&
    Boolean(
      wabaId.trim()
    ) &&
    Boolean(
      phoneNumberId.trim()
    ) &&
    Boolean(
      embeddedSignupCode.trim()
    ) &&
    !saving &&
    !loadingConfig;

  const clearConfigFields =
    () => {
      setBusinessId("");
      setWabaId("");
      setPhoneNumberId("");
      setDisplayPhoneNumber("");
      setDisplayName("");
      setTemplateName("");
      setEmbeddedSignupCode("");
      setIsPersistedConnected(
        false
      );
    };

  useEffect(
    () => {
      const handleEmbeddedSignupMessage =
        (
          event:
            MessageEvent
        ) => {
          if (
            event.origin !==
              "https://www.facebook.com" &&
            event.origin !==
              "https://web.facebook.com"
          ) {
            return;
          }

          let payload:
            any =
            event.data;

          if (
            typeof payload ===
            "string"
          ) {
            try {
              payload =
                JSON.parse(
                  payload
                );
            } catch {
              return;
            }
          }

          if (
            payload?.type !==
            "WA_EMBEDDED_SIGNUP"
          ) {
            return;
          }

          const data =
            payload?.data ||
            {};

          if (
            payload?.event ===
            "FINISH"
          ) {
            const sessionData = {
              businessId:
                String(
                  data.business_id ||
                  data.businessId ||
                  ""
                ),

              wabaId:
                String(
                  data.waba_id ||
                  data.wabaId ||
                  ""
                ),

              phoneNumberId:
                String(
                  data.phone_number_id ||
                  data.phoneNumberId ||
                  ""
                ),
            };

            embeddedSignupSessionRef.current =
              sessionData;

            if (
              sessionData.businessId
            ) {
              setBusinessId(
                sessionData.businessId
              );
            }

            if (
              sessionData.wabaId
            ) {
              setWabaId(
                sessionData.wabaId
              );
            }

            if (
              sessionData.phoneNumberId
            ) {
              setPhoneNumberId(
                sessionData.phoneNumberId
              );
            }
          }

          if (
            payload?.event ===
            "CANCEL"
          ) {
            setConnectingMeta(
              false
            );
          }

          if (
            payload?.event ===
            "ERROR"
          ) {
            setConnectingMeta(
              false
            );

            setDialog({
              type:
                "error",

              title:
                "שגיאה בחיבור Meta",

              message:
                String(
                  data?.error_message ||
                  data?.message ||
                  "תהליך החיבור מול Meta נכשל."
                ),
            });
          }
        };

      window.addEventListener(
        "message",
        handleEmbeddedSignupMessage
      );

      if (
        !META_APP_ID
      ) {
        return () => {
          window.removeEventListener(
            "message",
            handleEmbeddedSignupMessage
          );
        };
      }

      window.fbAsyncInit =
        () => {
          window.FB?.init({
            appId:
              META_APP_ID,

            cookie:
              true,

            xfbml:
              false,

            version:
              "v24.0",
          });

          setMetaSdkReady(
            true
          );
        };

      const existingScript =
        document.getElementById(
          "facebook-jssdk"
        );

      if (
        !existingScript
      ) {
        const script =
          document.createElement(
            "script"
          );

        script.id =
          "facebook-jssdk";

        script.src =
          "https://connect.facebook.net/en_US/sdk.js";

        script.async =
          true;

        script.defer =
          true;

        script.crossOrigin =
          "anonymous";

        document.body.appendChild(
          script
        );
      } else if (
        window.FB
      ) {
        window.fbAsyncInit();
      }

      return () => {
        window.removeEventListener(
          "message",
          handleEmbeddedSignupMessage
        );
      };
    },
    []
  );

  useEffect(
    () => {
      if (
        !agentId
      ) {
        clearConfigFields();
        return;
      }

      const loadConfig =
        async () => {
          setLoadingConfig(
            true
          );

          try {
            const configRef =
              doc(
                db,
                "agents",
                agentId,
                "config",
                "whatsapp"
              );

            const configSnap =
              await getDoc(
                configRef
              );

            if (
              !configSnap.exists()
            ) {
              clearConfigFields();
              return;
            }

            const data:
              any =
              configSnap.data();

            setBusinessId(
              String(
                data.businessId ||
                ""
              )
            );

            setWabaId(
              String(
                data.wabaId ||
                ""
              )
            );

            setPhoneNumberId(
              String(
                data.phoneNumberId ||
                ""
              )
            );

            setDisplayPhoneNumber(
              String(
                data.displayPhoneNumber ||
                ""
              )
            );

            setDisplayName(
              String(
                data.displayName ||
                ""
              )
            );

            setTemplateName(
              String(
                data.templateName ||
                ""
              )
            );

            setEmbeddedSignupCode(
              ""
            );

            setIsPersistedConnected(
              Boolean(
                String(
                  data.wabaId ||
                  ""
                ).trim()
              ) &&
              Boolean(
                String(
                  data.phoneNumberId ||
                  ""
                ).trim()
              )
            );
          } catch (
            error: any
          ) {
            clearConfigFields();

            setDialog({
              type:
                "error",

              title:
                "שגיאה בטעינת ההגדרות",

              message:
                String(
                  error?.message ||
                  error
                ),
            });
          } finally {
            setLoadingConfig(
              false
            );
          }
        };

      void loadConfig();
    },
    [
      agentId,
    ]
  );

  const handleConnectMeta =
    () => {
      if (
        !agentId
      ) {
        setDialog({
          type:
            "warning",

          title:
            "לא נמצא סוכן",

          message:
            "לא נמצא agentId למשתמש המחובר.",
        });

        return;
      }

      if (
        !META_APP_ID
      ) {
        setDialog({
          type:
            "error",

          title:
            "חסרה הגדרת App ID",

          message:
            "יש להגדיר NEXT_PUBLIC_META_APP_ID בסביבת MagicSale.",
        });

        return;
      }

      if (
        !window.FB ||
        !metaSdkReady
      ) {
        setDialog({
          type:
            "warning",

          title:
            "Meta עדיין נטען",

          message:
            "החיבור ל-Meta עדיין נטען. נסי שוב בעוד מספר שניות.",
        });

        return;
      }

      embeddedSignupSessionRef.current =
        {};

      setEmbeddedSignupCode(
        ""
      );

      setConnectingMeta(
        true
      );

      window.FB.login(
        (
          response:
            any
        ) => {
          const code =
            response
              ?.authResponse
              ?.code;

          if (
            !code
          ) {
            setConnectingMeta(
              false
            );

            setDialog({
              type:
                "warning",

              title:
                "החיבור לא הושלם",

              message:
                "Meta לא החזירה קוד חיבור. ניתן לנסות שוב.",
            });

            return;
          }

          setEmbeddedSignupCode(
            String(
              code
            )
          );

          setConnectingMeta(
            false
          );

          setDialog({
            type:
              "success",

            title:
              "החיבור ל-Meta הושלם",

            message:
              "פרטי החיבור התקבלו. כעת ניתן לשמור את החיבור.",
          });
        },
        {
          config_id:
            EMBEDDED_SIGNUP_CONFIG_ID,

          response_type:
            "code",

          override_default_response_type:
            true,

          extras: {
            setup: {},
            featureType:
              "",
            sessionInfoVersion:
              "3",
          },
        }
      );
    };

  const handleSave =
    async () => {
      if (
        !canSave
      ) {
        return;
      }

      setSaving(
        true
      );

      try {
        const fn =
          httpsCallable(
            functions,
            "saveAgentWhatsAppConfig"
          );

        await fn({
          agentId,

          businessId:
            businessId.trim(),

          wabaId:
            wabaId.trim(),

          phoneNumberId:
            phoneNumberId.trim(),

          displayPhoneNumber:
            displayPhoneNumber.trim() ||
            undefined,

          displayName:
            displayName.trim() ||
            undefined,

          templateName:
            templateName.trim() ||
            undefined,

          embeddedSignupCode:
            embeddedSignupCode.trim(),
        });

        setIsPersistedConnected(
          true
        );

        setEmbeddedSignupCode(
          ""
        );

        setDialog({
          type:
            "success",

          title:
            "החיבור נשמר בהצלחה",

          message:
            "חשבון WhatsApp Business חובר ונשמר במערכת.",
        });
      } catch (
        error: any
      ) {
        console.error(
          "[WhatsAppConnectionSettings] save failed",
          error
        );

        setDialog({
          type:
            "error",

          title:
            "שגיאה בשמירת החיבור",

          message:
            String(
              error?.message ||
              error
            ),
        });
      } finally {
        setSaving(
          false
        );
      }
    };

  if (
    isLoading ||
    isChecking
  ) {
    return (
      <div
        dir="rtl"
        className="p-6 text-right"
      >
        טוען...
      </div>
    );
  }

  if (
    !canAccess
  ) {
    return (
      <AccessDenied />
    );
  }

  return (
    <main
      dir="rtl"
      className="mx-auto max-w-5xl space-y-6 p-6 text-right"
    >
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">
          חיבור WhatsApp Business
        </h1>

        <p className="text-sm text-gray-600">
          כאן מחברים את מספר ה-WhatsApp של הסוכן דרך Meta.
          ניהול התבניות נמצא במסך התבניות של MagicTouch.
        </p>
      </header>

      {!agentId && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          לא נמצא agentId למשתמש המחובר.
        </div>
      )}

      <section className="space-y-5 rounded-2xl border bg-white p-5 shadow-sm">
        <div className="rounded-xl border bg-slate-50 p-4">
          <div className="mb-1 font-bold">
            סטטוס החיבור
          </div>

          {loadingConfig
            ? (
              <div className="text-sm text-gray-500">
                טוען הגדרות חיבור...
              </div>
            )
            : isPersistedConnected
              ? (
                <div className="space-y-2">
                  <div className="font-bold text-green-700">
                    ✓ חשבון WhatsApp Business מחובר
                  </div>

                  <div className="text-sm text-gray-700">
                    <strong>
                      מספר מחובר:
                    </strong>{" "}
                    {displayPhoneNumber ||
                      "לא הוגדר"}
                  </div>

                  <div className="text-sm text-gray-700">
                    <strong>
                      שם תצוגה:
                    </strong>{" "}
                    {displayName ||
                      "לא הוגדר"}
                  </div>

                  <div className="text-xs text-gray-500">
                    WABA ID: {wabaId}
                  </div>
                </div>
              )
              : (
                <div className="font-bold text-orange-700">
                  חשבון WhatsApp Business עדיין לא מחובר
                </div>
              )}
        </div>

        <div className="space-y-4 rounded-xl border p-4">
          <div>
            <div className="font-bold">
              חיבור מאובטח דרך Meta
            </div>

            <p className="mt-1 text-sm leading-6 text-gray-500">
              לחיצה על הכפתור תפתח את תהליך Embedded Signup של Meta.
            </p>
          </div>

          {!META_APP_ID && (
            <div className="text-sm text-red-600">
              חסר NEXT_PUBLIC_META_APP_ID בסביבת הפרויקט.
            </div>
          )}

          {META_APP_ID &&
            !metaSdkReady && (
              <div className="text-sm text-gray-500">
                טוען את חיבור Meta...
              </div>
            )}

          {isPersistedConnected
            ? (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                ✓ החשבון מחובר בהצלחה. אין צורך לבצע חיבור נוסף.
              </div>
            )
            : (
              <div className="flex flex-wrap justify-end gap-3">
                <Button
                  text={
                    connectingMeta
                      ? "⏳ מתחבר ל-Meta..."
                      : "חיבור WhatsApp Business"
                  }
                  type="primary"
                  onClick={
                    handleConnectMeta
                  }
                  disabled={
                    !agentId ||
                    connectingMeta ||
                    !metaSdkReady
                  }
                />

                <Button
                  text={
                    saving
                      ? "⏳ שומר..."
                      : "שמור חיבור"
                  }
                  type="primary"
                  onClick={
                    handleSave
                  }
                  disabled={
                    !canSave
                  }
                />
              </div>
            )}

          {Boolean(
            embeddedSignupCode
          ) && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              ✓ החיבור מול Meta הושלם. לחצי על שמירת החיבור.
            </div>
          )}
        </div>
      </section>

      {dialog && (
        <DialogNotification
          type={
            dialog.type
          }
          title={
            dialog.title
          }
          message={
            dialog.message
          }
          onConfirm={() =>
            setDialog(
              null
            )
          }
          confirmText="סגור"
          hideCancel
        />
      )}
    </main>
  );
}
