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
  functions,
} from "@/lib/firebase/firebase";

import {
  Button,
} from "@/components/Button/Button";

import DialogNotification from
  "@/components/DialogNotification";

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

export type WhatsAppConnectionResult = {
  agentId: string;

  businessId: string;

  wabaId: string;

  phoneNumberId: string;

  displayPhoneNumber?: string;

  displayName?: string;
};

type Props = {
  agentId:
    string;

  isConnected?:
    boolean;

  displayPhoneNumber?:
    string;

  displayName?:
    string;

  onConnected?: (
    result:
      WhatsAppConnectionResult
  ) => void;

  onError?: (
    error: unknown
  ) => void;
};

const META_APP_ID =
  process.env
    .NEXT_PUBLIC_META_APP_ID ||
  "";

const EMBEDDED_SIGNUP_CONFIG_ID =
  "3303093589871398";

declare global {
  interface Window {
    FB?: {
      init: (
        options:
          Record<string, any>
      ) => void;

      login: (
        callback: (
          response: any
        ) => void,
        options:
          Record<string, any>
      ) => void;
    };

    fbAsyncInit?:
      () => void;
  }
}

export default function WhatsAppEmbeddedSignup({
  agentId,
  isConnected = false,
  displayPhoneNumber = "",
  displayName = "",
  onConnected,
  onError,
}: Props) {
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
    embeddedSignupCode,
    setEmbeddedSignupCode,
  ] =
    useState("");

  const [
    connectingMeta,
    setConnectingMeta,
  ] =
    useState(false);

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const [
    metaSdkReady,
    setMetaSdkReady,
  ] =
    useState(false);

  const [
    connectionSaved,
    setConnectionSaved,
  ] =
    useState(
      isConnected
    );

  const [
    pinRequired,
    setPinRequired,
  ] =
    useState(false);

  const [
    existingPin,
    setExistingPin,
  ] =
    useState("");

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

  useEffect(
    () => {
      setConnectionSaved(
        isConnected
      );
    },
    [
      isConnected,
    ]
  );

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
                ).trim(),

              wabaId:
                String(
                  data.waba_id ||
                  data.wabaId ||
                  ""
                ).trim(),

              phoneNumberId:
                String(
                  data.phone_number_id ||
                  data.phoneNumberId ||
                  ""
                ).trim(),
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

            return;
          }

          if (
            payload?.event ===
            "CANCEL"
          ) {
            setConnectingMeta(
              false
            );

            return;
          }

          if (
            payload?.event ===
            "ERROR"
          ) {
            setConnectingMeta(
              false
            );

            const error =
              new Error(
                String(
                  data?.error_message ||
                  data?.message ||
                  "תהליך החיבור מול Meta נכשל."
                )
              );

            onError?.(
              error
            );

            setDialog({
              type:
                "error",

              title:
                "שגיאה בחיבור Meta",

              message:
                error.message,
            });
          }
        };

      window.addEventListener(
        "message",
        handleEmbeddedSignupMessage
      );

      return () => {
        window.removeEventListener(
          "message",
          handleEmbeddedSignupMessage
        );
      };
    },
    [
      onError,
    ]
  );

  useEffect(
    () => {
      if (
        !META_APP_ID
      ) {
        return;
      }

      const initializeSdk =
        () => {
          if (
            !window.FB
          ) {
            return;
          }

          window.FB.init({
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

      window.fbAsyncInit =
        initializeSdk;

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
        initializeSdk();
      }
    },
    []
  );

  const canSave =
    Boolean(
      agentId
    ) &&
    Boolean(
      businessId
    ) &&
    Boolean(
      wabaId
    ) &&
    Boolean(
      phoneNumberId
    ) &&
    Boolean(
      embeddedSignupCode
    ) &&
    !saving;

  const buildConnectionResult =
    (): WhatsAppConnectionResult => {
      return {
        agentId,

        businessId:
          businessId.trim(),

        wabaId:
          wabaId.trim(),

        phoneNumberId:
          phoneNumberId.trim(),

        displayPhoneNumber:
          displayPhoneNumber ||
          undefined,

        displayName:
          displayName ||
          undefined,
      };
    };

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
            "לא נמצא agentId עבור החיבור.",
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

      setBusinessId(
        ""
      );

      setWabaId(
        ""
      );

      setPhoneNumberId(
        ""
      );

      setEmbeddedSignupCode(
        ""
      );

      setPinRequired(
        false
      );

      setExistingPin(
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
              "החיבור מול Meta הושלם",

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

          embeddedSignupCode:
            embeddedSignupCode.trim(),
        });

        setConnectionSaved(
          true
        );

        setEmbeddedSignupCode(
          ""
        );

        setPinRequired(
          false
        );

        const result =
          buildConnectionResult();

        onConnected?.(
          result
        );

        setDialog({
          type:
            "success",

          title:
            "WhatsApp מחובר",

          message:
            "חשבון WhatsApp Business חובר ומוכן לשליחה ולקבלת הודעות.",
        });
      } catch (
        error: any
      ) {
        console.error(
          "[WhatsAppEmbeddedSignup] save failed",
          error
        );

        const reason =
          String(
            error
              ?.details
              ?.reason ||
            error
              ?.customData
              ?.details
              ?.reason ||
            ""
          );

        if (
          reason ===
          "existing_pin_required"
        ) {
          setPinRequired(
            true
          );

          setDialog({
            type:
              "warning",

            title:
              "נדרש PIN קיים",

            message:
              "למספר הזה כבר מוגדר PIN אימות דו-שלבי ב-WhatsApp. הזן את ה-PIN הקיים כדי להשלים את החיבור.",
          });

          return;
        }

        onError?.(
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

  const handleExistingPinSubmit =
    async () => {
      const pin =
        existingPin.trim();

      if (
        !/^\d{6}$/.test(
          pin
        )
      ) {
        setDialog({
          type:
            "warning",

          title:
            "PIN לא תקין",

          message:
            "יש להזין PIN בן 6 ספרות.",
        });

        return;
      }

      setSaving(
        true
      );

      try {
        const registerFn =
          httpsCallable(
            functions,
            "registerAgentWhatsAppPhone"
          );

        await registerFn({
          agentId,
          pin,
        });

        const subscribeFn =
          httpsCallable(
            functions,
            "subscribeAgentWhatsAppWebhook"
          );

        await subscribeFn({
          agentId,
        });

        setPinRequired(
          false
        );

        setExistingPin(
          ""
        );

        setEmbeddedSignupCode(
          ""
        );

        setConnectionSaved(
          true
        );

        const result =
          buildConnectionResult();

        onConnected?.(
          result
        );

        setDialog({
          type:
            "success",

          title:
            "WhatsApp מחובר",

          message:
            "חשבון WhatsApp Business חובר בהצלחה ומוכן לשימוש.",
        });
      } catch (
        error: any
      ) {
        console.error(
          "[WhatsAppEmbeddedSignup] PIN completion failed",
          error
        );

        onError?.(
          error
        );

        setDialog({
          type:
            "error",

          title:
            "לא ניתן להשלים את החיבור",

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
    connectionSaved
  ) {
    return (
      <>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 font-black text-white">
              ✓
            </div>

            <div>
              <div className="font-black text-emerald-900">
                WhatsApp Business מחובר
              </div>

              {displayPhoneNumber ? (
                <div
                  className="mt-1 text-sm text-emerald-800"
                  dir="ltr"
                >
                  {displayPhoneNumber}
                </div>
              ) : null}

              {displayName ? (
                <div className="mt-1 text-sm text-emerald-700">
                  {displayName}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {dialog ? (
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
        ) : null}
      </>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {!META_APP_ID ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">
            חסר NEXT_PUBLIC_META_APP_ID בסביבת הפרויקט.
          </div>
        ) : null}

        {META_APP_ID &&
        !metaSdkReady ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
            טוען את חיבור Meta...
          </div>
        ) : null}

        {pinRequired ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="font-bold text-amber-900">
              נדרש PIN קיים
            </div>

            <p className="mt-1 text-sm leading-6 text-amber-800">
              למספר הזה כבר מוגדר PIN אימות דו-שלבי ב-WhatsApp.
              הזן את ה-PIN הקיים כדי להשלים את החיבור.
            </p>

            <div className="mt-4 max-w-xs">
              <input
                value={
                  existingPin
                }
                onChange={(
                  event
                ) => {
                  const value =
                    event.target.value
                      .replace(
                        /\D/g,
                        ""
                      )
                      .slice(
                        0,
                        6
                      );

                  setExistingPin(
                    value
                  );
                }}
                inputMode="numeric"
                maxLength={6}
                placeholder="PIN בן 6 ספרות"
                className="w-full rounded-xl border border-amber-300 bg-white px-4 py-3 text-center text-lg tracking-[0.3em] outline-none"
                dir="ltr"
              />
            </div>

            <div className="mt-4">
              <Button
                text={
                  saving
                    ? "⏳ משלים חיבור..."
                    : "השלמת החיבור"
                }
                type="primary"
                onClick={
                  handleExistingPinSubmit
                }
                disabled={
                  saving ||
                  existingPin.length !==
                    6
                }
              />
            </div>
          </div>
        ) : !embeddedSignupCode ? (
          <div className="flex flex-wrap gap-3">
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
          </div>
        ) : (
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
            <div className="font-bold text-blue-900">
              ✓ פרטי החיבור התקבלו מ-Meta
            </div>

            <p className="mt-1 text-sm leading-6 text-blue-700">
              נשאר רק לשמור את החיבור ב-MagicTouch.
            </p>

            <div className="mt-4">
              <Button
                text={
                  saving
                    ? "⏳ שומר..."
                    : "שמירת החיבור"
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
          </div>
        )}
      </div>

      {dialog ? (
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
      ) : null}
    </>
  );
}