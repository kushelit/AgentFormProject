"use client";


import React, {
  useEffect,
  useState,
} from "react";

import {
  doc,
  getDoc,
} from "firebase/firestore";

import {
  httpsCallable,
} from "firebase/functions";

import {
  db,
  functions,
} from "@/lib/firebase/firebase";

import {
  useAuth,
} from "@/lib/firebase/AuthContext";

import {
  useMagicTouchAgent,
} from "@/components/MagicTouch/MagicTouchAgentContext";

import {
  usePermission,
} from "@/hooks/usePermission";

import DialogNotification from
  "@/components/DialogNotification";

import AccessDenied from
  "@/components/AccessDenied";

import WhatsAppEmbeddedSignup, {
  WhatsAppConnectionResult,
} from "./WhatsAppEmbeddedSignup";

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

export default function WhatsAppConnectionSettings() {
  const {
    effectiveAgentId,
  } =
    useMagicTouchAgent();

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
    effectiveAgentId;

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
    loadingConfig,
    setLoadingConfig,
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

  const [
    isDisconnectConfirmOpen,
    setIsDisconnectConfirmOpen,
  ] =
    useState(false);

  const [
    isDisconnecting,
    setIsDisconnecting,
  ] =
    useState(false);

  // ניתוק מותר לסוכן עצמו או ל-isSystem, כמו בשרת ובחוקי Firestore
  const canDisconnect =
    Boolean(
      agentId
    ) &&
    (
      user?.uid ===
        agentId ||
      detail?.isSystem ===
        true
    );

  const clearConfigFields =
    () => {
      setBusinessId("");
      setWabaId("");
      setPhoneNumberId("");
      setDisplayPhoneNumber("");
      setDisplayName("");

      setIsPersistedConnected(
        false
      );
    };

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

            const loadedBusinessId =
              String(
                data.businessId ||
                  ""
              );

            const loadedWabaId =
              String(
                data.wabaId ||
                  ""
              );

            const loadedPhoneNumberId =
              String(
                data.phoneNumberId ||
                  ""
              );

            const loadedDisplayPhoneNumber =
              String(
                data.displayPhoneNumber ||
                  ""
              );

            const loadedDisplayName =
              String(
                data.displayName ||
                  ""
              );

            setBusinessId(
              loadedBusinessId
            );

            setWabaId(
              loadedWabaId
            );

            setPhoneNumberId(
              loadedPhoneNumberId
            );

            setDisplayPhoneNumber(
              loadedDisplayPhoneNumber
            );

            setDisplayName(
              loadedDisplayName
            );
const isReady =
  String(
    data.status ||
    ""
  ) ===
    "ready" &&
  data.phoneRegistered ===
    true &&
  data.webhookSubscribed ===
    true;

setIsPersistedConnected(
  isReady
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

  const handleConnected =
    (
      result:
        WhatsAppConnectionResult
    ) => {
      setBusinessId(
        result.businessId
      );

      setWabaId(
        result.wabaId
      );

      setPhoneNumberId(
        result.phoneNumberId
      );

      if (
        result.displayPhoneNumber
      ) {
        setDisplayPhoneNumber(
          result.displayPhoneNumber
        );
      }

      if (
        result.displayName
      ) {
        setDisplayName(
          result.displayName
        );
      }

      setIsPersistedConnected(
        true
      );
    };

  /*
   * ניתוק בתוך MagicTouch בלבד (disconnectAgentWhatsApp).
   * המספר נשאר רשום אצל Meta, ואפשר לחבר מחדש בכל עת.
   */
  const handleDisconnect =
    async () => {
      if (
        !agentId ||
        isDisconnecting
      ) {
        return;
      }

      setIsDisconnecting(
        true
      );

      try {
        const fn =
          httpsCallable<
            {
              agentId:
                string;
            },
            {
              ok: boolean;
              disconnected: boolean;
            }
          >(
            functions,
            "disconnectAgentWhatsApp"
          );

        await fn({
          agentId,
        });

        setIsDisconnectConfirmOpen(
          false
        );

        clearConfigFields();

        setDialog({
          type:
            "success",

          title:
            "WhatsApp נותק",

          message:
            "החיבור נותק. הודעות כבר לא יגיעו ל-MagicTouch. אפשר לחבר מחדש בכל עת.",
        });
      } catch (
        error: any
      ) {
        console.error(
          "[WhatsAppConnectionSettings] Disconnect failed",
          error
        );

        setIsDisconnectConfirmOpen(
          false
        );

        setDialog({
          type:
            "error",

          title:
            "הניתוק נכשל",

          message:
            String(
              error?.message ||
                "לא ניתן היה לנתק את החיבור. יש לנסות שוב."
            ),
        });
      } finally {
        setIsDisconnecting(
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

          {loadingConfig ? (
            <div className="text-sm text-gray-500">
              טוען הגדרות חיבור...
            </div>
          ) : isPersistedConnected ? (
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
                WABA ID:{" "}
                {wabaId}
              </div>

              {businessId ? (
                <div className="text-xs text-gray-500">
                  Business ID:{" "}
                  {businessId}
                </div>
              ) : null}

              {phoneNumberId ? (
                <div className="text-xs text-gray-500">
                  Phone Number ID:{" "}
                  {phoneNumberId}
                </div>
              ) : null}

              {canDisconnect ? (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() =>
                      setIsDisconnectConfirmOpen(
                        true
                      )
                    }
                    disabled={
                      isDisconnecting
                    }
                    className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isDisconnecting
                      ? "מנתק..."
                      : "ניתוק WhatsApp"}
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
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

          {loadingConfig ? (
            <div className="text-sm text-gray-500">
              טוען את מצב החיבור...
            </div>
          ) : agentId ? (
            <WhatsAppEmbeddedSignup
              agentId={
                agentId
              }
              isConnected={
                isPersistedConnected
              }
              displayPhoneNumber={
                displayPhoneNumber
              }
              displayName={
                displayName
              }
              onConnected={
                handleConnected
              }
              onError={(
                error
              ) => {
                console.error(
                  "[WhatsAppConnectionSettings] Embedded Signup failed",
                  error
                );
              }}
            />
          ) : null}
        </div>
      </section>

      {isDisconnectConfirmOpen && (
        <DialogNotification
          type="warning"
          title="לנתק את WhatsApp?"
          message={`הודעות למספר ${
            displayPhoneNumber ||
            phoneNumberId
          } יפסיקו להגיע ל-MagicTouch, ולא יהיה אפשר לשלוח ממנו הודעות, תהליכים וקמפיינים. המספר עצמו נשאר פעיל אצל Meta, ואפשר לחבר מחדש בכל עת.`}
          onConfirm={() =>
            void handleDisconnect()
          }
          onCancel={() =>
            setIsDisconnectConfirmOpen(
              false
            )
          }
          confirmText={
            isDisconnecting
              ? "מנתק..."
              : "כן, לנתק"
          }
          cancelText="ביטול"
        />
      )}

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