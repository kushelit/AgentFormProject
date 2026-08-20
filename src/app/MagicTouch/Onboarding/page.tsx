"use client";


import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
} from "firebase/firestore";

import {
  db,
} from "@/lib/firebase/firebase";

import {
  useMagicTouchAgent,
} from "@/components/MagicTouch/MagicTouchAgentContext";

import WhatsAppEmbeddedSignup from
  "@/components/MagicTouch/Integrations/WhatsAppEmbeddedSignup";

import GoogleCalendarSetup from
  "@/components/MagicTouch/Integrations/GoogleCalendarSetup";

import MicrosoftBookingsSetup from
  "@/components/MagicTouch/Integrations/MicrosoftBookingsSetup";

import WhatsAppTemplateBuilder, {
  WhatsAppTemplateCreatedResult,
} from "@/components/MagicTouch/Integrations/WhatsAppTemplateBuilder";

import InboundFirstResponseBuilder from
  "@/components/MagicTouch/Integrations/InboundFirstResponseBuilder";

type CalendarProvider =
  | "google"
  | "microsoft"
  | "none"
  | null;

type JourneyStep =
  | "whatsapp"
  | "calendar"
  | "flow"
  | "test"
  | "launch";

type FirstFlowChoice = {
  outbound: boolean;
  inbound: boolean;
};

type StationProps = {
  number: number;
  icon: string;
  title: string;
  subtitle: string;
  active?: boolean;
  completed?: boolean;
  locked?: boolean;
  align?: "right" | "left";
  onClick?: () => void;
};

function Station({
  number,
  icon,
  title,
  subtitle,
  active = false,
  completed = false,
  locked = false,
  align = "right",
  onClick,
}: StationProps) {
  return (
    <button
      type="button"
      disabled={locked}
      onClick={onClick}
      className={[
        "group relative flex w-full items-center gap-4 text-right transition",
        align === "left"
          ? "md:flex-row-reverse md:text-left"
          : "",
        locked
          ? "cursor-default opacity-45"
          : "cursor-pointer",
      ].join(" ")}
    >
      <div className="relative shrink-0">
        {active ? (
          <div className="absolute -inset-3 rounded-full bg-blue-200/50 blur-xl" />
        ) : null}

        <div
          className={[
            "relative flex h-20 w-20 items-center justify-center rounded-full border-4 text-3xl shadow-lg transition duration-300",
            completed
              ? "border-emerald-200 bg-emerald-500 text-white"
              : active
                ? "scale-110 border-blue-200 bg-blue-600 text-white shadow-blue-200"
                : "border-white bg-slate-100 text-slate-500",
          ].join(" ")}
        >
          {completed
            ? "✓"
            : icon}

          <div
            className={[
              "absolute -bottom-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[11px] font-black shadow-sm",
              completed
                ? "bg-emerald-700 text-white"
                : active
                  ? "bg-slate-950 text-white"
                  : "bg-white text-slate-500",
            ].join(" ")}
          >
            {number}
          </div>
        </div>
      </div>

      <div
        className={[
          "min-w-0 max-w-xs",
          align === "left"
            ? "md:text-left"
            : "",
        ].join(" ")}
      >
        <div
          className={[
            "font-black",
            active
              ? "text-lg text-blue-700"
              : "text-base text-slate-900",
          ].join(" ")}
        >
          {title}
        </div>

        <div className="mt-1 text-sm leading-5 text-slate-500">
          {subtitle}
        </div>

        {active ? (
          <div className="mt-2 inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700">
            כאן אנחנו עכשיו
          </div>
        ) : null}
      </div>
    </button>
  );
}

function ChoiceCard({
  selected,
  icon,
  title,
  description,
  onClick,
}: {
  selected: boolean;
  icon: string;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "relative rounded-2xl border p-4 text-right transition duration-200",
        selected
          ? "border-blue-400 bg-blue-50 shadow-sm ring-4 ring-blue-50"
          : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-sm",
      ].join(" ")}
    >
      {selected ? (
        <div className="absolute left-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-black text-white">
          ✓
        </div>
      ) : null}

      <div className="text-2xl">
        {icon}
      </div>

      <div className="mt-3 font-black text-slate-900">
        {title}
      </div>

      <p className="mt-1 text-sm leading-6 text-slate-500">
        {description}
      </p>
    </button>
  );
}

export default function MagicTouchOnboardingPage() {
  const {
    effectiveAgentId,
  } =
    useMagicTouchAgent();

  const agentId =
    effectiveAgentId;

  const [
    loadingWhatsApp,
    setLoadingWhatsApp,
  ] =
    useState(true);

  const [
    whatsappConnected,
    setWhatsappConnected,
  ] =
    useState(false);

  useEffect(() => {
    if (!agentId) {
      setWhatsappConnected(false);
      setLoadingWhatsApp(false);
      return;
    }

    const loadWhatsAppConnection =
      async () => {
        setLoadingWhatsApp(true);

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

          if (!configSnap.exists()) {
            setWhatsappConnected(false);
            return;
          }

          const data =
            configSnap.data();

          const wabaId =
            String(
              data?.wabaId ||
                ""
            ).trim();

          const phoneNumberId =
            String(
              data?.phoneNumberId ||
                ""
            ).trim();

          setWhatsappConnected(
            Boolean(wabaId) &&
              Boolean(phoneNumberId)
          );
        } catch (error) {
          console.error(
            "[MagicTouchOnboarding] Failed loading WhatsApp connection",
            error
          );

          setWhatsappConnected(false);
        } finally {
          setLoadingWhatsApp(false);
        }
      };

    void loadWhatsAppConnection();
  }, [agentId]);

  const [
    calendarProvider,
    setCalendarProvider,
  ] =
    useState<CalendarProvider>(
      null
    );

  const [
    loadingAppointmentProvider,
    setLoadingAppointmentProvider,
  ] =
    useState(true);

  const [
    savingAppointmentProvider,
    setSavingAppointmentProvider,
  ] =
    useState(false);

  const [
    googleCalendarConfig,
    setGoogleCalendarConfig,
  ] =
    useState<Record<string, any> | null>(
      null
    );

  const [
    microsoftBookingsConfig,
    setMicrosoftBookingsConfig,
  ] =
    useState<Record<string, any> | null>(
      null
    );

  const [
    loadingCalendars,
    setLoadingCalendars,
  ] =
    useState(true);

  const [
    connectingCalendar,
    setConnectingCalendar,
  ] =
    useState<"google" | "microsoft" | null>(
      null
    );

  useEffect(() => {
    if (!agentId) {
      setCalendarProvider(null);
      setLoadingAppointmentProvider(false);
      return;
    }

    setLoadingAppointmentProvider(true);

    const configRef =
      doc(
        db,
        `agents/${agentId}/config/magicTouch`
      );

    return onSnapshot(
      configRef,
      (snapshot) => {
        const provider =
          snapshot.exists()
            ? String(
                snapshot.data()
                  ?.appointmentProvider ||
                  ""
              ).trim()
            : "";

        if (
          provider === "google" ||
          provider === "microsoft" ||
          provider === "none"
        ) {
          setCalendarProvider(
            provider as CalendarProvider
          );
        } else {
          setCalendarProvider(null);
        }

        setLoadingAppointmentProvider(
          false
        );
      },
      (error) => {
        console.error(
          "[MagicTouchOnboarding] Failed loading appointment provider",
          error
        );

        setLoadingAppointmentProvider(
          false
        );
      }
    );
  }, [agentId]);

  const saveAppointmentProvider =
    async (
      provider:
        Exclude<
          CalendarProvider,
          null
        >
    ) => {
      if (!agentId) {
        return;
      }

      setSavingAppointmentProvider(
        true
      );

      try {
        await setDoc(
          doc(
            db,
            `agents/${agentId}/config/magicTouch`
          ),
          {
            appointmentProvider:
              provider,

            updatedAt:
              new Date(),
          },
          {
            merge:
              true,
          }
        );

        setCalendarProvider(
          provider
        );
      } catch (error) {
        console.error(
          "[MagicTouchOnboarding] Failed saving appointment provider",
          error
        );
      } finally {
        setSavingAppointmentProvider(
          false
        );
      }
    };

  useEffect(() => {
    if (!agentId) {
      setGoogleCalendarConfig(null);
      setMicrosoftBookingsConfig(null);
      setLoadingCalendars(false);
      return;
    }

    setLoadingCalendars(true);

    let googleLoaded = false;
    let microsoftLoaded = false;

    const finishLoading = () => {
      if (googleLoaded && microsoftLoaded) {
        setLoadingCalendars(false);
      }
    };

    const googleRef =
      doc(
        db,
        `agents/${agentId}/config/googleCalendar`
      );

    const microsoftRef =
      doc(
        db,
        `agents/${agentId}/config/microsoftBookings`
      );

    const unsubscribeGoogle =
      onSnapshot(
        googleRef,
        (snapshot) => {
          setGoogleCalendarConfig(
            snapshot.exists()
              ? snapshot.data()
              : null
          );

          googleLoaded = true;
          finishLoading();
        },
        (error) => {
          console.error(
            "[MagicTouchOnboarding] Failed loading Google Calendar config",
            error
          );

          setGoogleCalendarConfig(null);
          googleLoaded = true;
          finishLoading();
        }
      );

    const unsubscribeMicrosoft =
      onSnapshot(
        microsoftRef,
        (snapshot) => {
          setMicrosoftBookingsConfig(
            snapshot.exists()
              ? snapshot.data()
              : null
          );

          microsoftLoaded = true;
          finishLoading();
        },
        (error) => {
          console.error(
            "[MagicTouchOnboarding] Failed loading Microsoft Bookings config",
            error
          );

          setMicrosoftBookingsConfig(null);
          microsoftLoaded = true;
          finishLoading();
        }
      );

    return () => {
      unsubscribeGoogle();
      unsubscribeMicrosoft();
    };
  }, [agentId]);

  const googleReady =
    googleCalendarConfig?.connected ===
      true &&
    Boolean(
      String(
        googleCalendarConfig
          ?.selectedCalendarId ||
          ""
      ).trim()
    ) &&
    Boolean(
      String(
        googleCalendarConfig
          ?.defaultBookingUrl ||
          ""
      ).trim()
    );

  const microsoftReady =
    microsoftBookingsConfig?.connected ===
      true &&
    Boolean(
      String(
        microsoftBookingsConfig
          ?.bookingBusinessId ||
          ""
      ).trim()
    ) &&
    Boolean(
      String(
        microsoftBookingsConfig
          ?.defaultBookingServiceId ||
          ""
      ).trim()
    ) &&
    Boolean(
      String(
        microsoftBookingsConfig
          ?.defaultBookingServiceUrl ||
          ""
      ).trim()
    );

  const [
    firstFlow,
    setFirstFlow,
  ] =
    useState<FirstFlowChoice>({
      outbound: false,
      inbound: false,
    });

  const [
    loadingFirstFlowMode,
    setLoadingFirstFlowMode,
  ] =
    useState(true);

  const [
    savingFirstFlowMode,
    setSavingFirstFlowMode,
  ] =
    useState(false);

  const [
    outboundTemplateName,
    setOutboundTemplateName,
  ] =
    useState("");

  const [
    outboundTemplateStatus,
    setOutboundTemplateStatus,
  ] =
    useState("");

  const [
    inboundSetupCompleted,
    setInboundSetupCompleted,
  ] =
    useState(false);

  const [
    testCompleted,
    setTestCompleted,
  ] = useState(false);

  useEffect(() => {
    if (!agentId) {
      setFirstFlow({
        outbound: false,
        inbound: false,
      });

      setOutboundTemplateName("");
      setOutboundTemplateStatus("");
      setInboundSetupCompleted(false);
      setLoadingFirstFlowMode(false);
      return;
    }

    setLoadingFirstFlowMode(true);

    const configRef =
      doc(
        db,
        `agents/${agentId}/config/magicTouch`
      );

    return onSnapshot(
      configRef,
      (snapshot) => {
        const data =
          snapshot.exists()
            ? snapshot.data()
            : {};

        const mode =
          data?.firstFlowMode &&
          typeof data.firstFlowMode ===
            "object"
            ? data.firstFlowMode
            : {};

        setFirstFlow({
          outbound:
            mode?.outbound ===
            true,

          inbound:
            mode?.inbound ===
            true,
        });

        setOutboundTemplateName(
          String(
            data?.onboarding
              ?.outboundTemplateName ||
              ""
          ).trim()
        );

        setOutboundTemplateStatus(
          String(
            data?.onboarding
              ?.outboundTemplateStatus ||
              ""
          ).trim()
        );

        setInboundSetupCompleted(
          data?.onboarding
            ?.inboundSetupCompleted ===
            true
        );

        setLoadingFirstFlowMode(
          false
        );
      },
      (error) => {
        console.error(
          "[MagicTouchOnboarding] Failed loading first flow mode",
          error
        );

        setLoadingFirstFlowMode(
          false
        );
      }
    );
  }, [agentId]);

  const saveFirstFlowMode =
    async (
      next:
        FirstFlowChoice
    ) => {
      if (!agentId) {
        return;
      }

      setSavingFirstFlowMode(
        true
      );

      try {
        await setDoc(
          doc(
            db,
            `agents/${agentId}/config/magicTouch`
          ),
          {
            firstFlowMode: {
              outbound:
                next.outbound,

              inbound:
                next.inbound,
            },

            updatedAt:
              new Date(),
          },
          {
            merge:
              true,
          }
        );

        setFirstFlow(
          next
        );
      } catch (error) {
        console.error(
          "[MagicTouchOnboarding] Failed saving first flow mode",
          error
        );
      } finally {
        setSavingFirstFlowMode(
          false
        );
      }
    };

  const handleOutboundTemplateCreated =
    async (
      result:
        WhatsAppTemplateCreatedResult
    ) => {
      setOutboundTemplateName(
        result.name
      );

      setOutboundTemplateStatus(
        result.status
      );

      if (!agentId) {
        return;
      }

      try {
        await setDoc(
          doc(
            db,
            `agents/${agentId}/config/magicTouch`
          ),
          {
            onboarding: {
              outboundTemplateName:
                result.name,

              outboundTemplateStatus:
                result.status,

              inboundSetupCompleted:
                inboundSetupCompleted,
            },

            updatedAt:
              new Date(),
          },
          {
            merge:
              true,
          }
        );
      } catch (error) {
        console.error(
          "[MagicTouchOnboarding] Failed saving outbound template state",
          error
        );
      }
    };

  const calendarCompleted =
    calendarProvider === "none" ||
    (
      calendarProvider ===
        "google" &&
      googleReady
    ) ||
    (
      calendarProvider ===
        "microsoft" &&
      microsoftReady
    );

  const flowSelected =
    firstFlow.outbound ||
    firstFlow.inbound;

  const outboundSetupCompleted =
    !firstFlow.outbound ||
    Boolean(
      outboundTemplateName
    );

  const flowCompleted =
    flowSelected &&
    outboundSetupCompleted &&
    (
      !firstFlow.inbound ||
      inboundSetupCompleted
    );

  const currentStep =
    useMemo<JourneyStep>(() => {
      if (
        loadingWhatsApp ||
        !whatsappConnected
      ) {
        return "whatsapp";
      }

      if (
        loadingAppointmentProvider
      ) {
        return "calendar";
      }

      if (!calendarCompleted) {
        return "calendar";
      }

      if (
        loadingFirstFlowMode ||
        !flowSelected ||
        !flowCompleted
      ) {
        return "flow";
      }

      if (!testCompleted) {
        return "test";
      }

      return "launch";
    }, [
      loadingWhatsApp,
      whatsappConnected,
      loadingAppointmentProvider,
      calendarCompleted,
      loadingFirstFlowMode,
      flowSelected,
      flowCompleted,
      testCompleted,
    ]);

  const currentIndex =
    [
      "whatsapp",
      "calendar",
      "flow",
      "test",
      "launch",
    ].indexOf(
      currentStep
    );

  const completedCount =
    [
      whatsappConnected,
      calendarCompleted,
      flowSelected &&
        flowCompleted,
      testCompleted,
    ].filter(Boolean).length;

  const progress =
    completedCount * 25;

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#f7f9fc] px-4 py-8 text-right sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-7xl">
        <header className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-white px-6 py-7 shadow-sm md:px-9">
          <div className="absolute -left-20 -top-24 h-64 w-64 rounded-full bg-blue-100/60 blur-3xl" />
          <div className="absolute -bottom-32 right-1/3 h-56 w-56 rounded-full bg-violet-100/50 blur-3xl" />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">
                <span>🚀</span>
                <span>
                  מסלול ההמראה שלכם
                </span>
              </div>

              <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950 md:text-4xl">
                מכינים את MagicTouch
                לעבודה
              </h1>

              <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
                נחבר את ערוצי העבודה שלכם,
                נבנה יחד תהליך ראשון ונבדוק
                שהכול עובד לפני שמתחילים עם
                לקוחות אמיתיים.
              </p>
            </div>

            <div className="w-full max-w-sm rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-700">
                  מוכנות להמראה
                </span>

                <span
                  className="text-sm font-black text-blue-700"
                  dir="ltr"
                >
                  {progress}%
                </span>
              </div>

              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-gradient-to-l from-blue-600 to-violet-500 transition-all duration-500"
                  style={{
                    width:
                      `${progress}%`,
                  }}
                />
              </div>

              <div className="mt-2 text-xs text-slate-500">
                {completedCount} מתוך 4
                תחנות הושלמו
              </div>
            </div>
          </div>
        </header>

        <section className="relative mt-8 overflow-hidden rounded-[36px] border border-slate-200 bg-white px-5 py-8 shadow-sm md:min-h-[640px] md:px-10 md:py-12">
          <div className="pointer-events-none absolute inset-0 hidden md:block">
            <svg
              viewBox="0 0 1200 620"
              preserveAspectRatio="none"
              className="h-full w-full"
            >
              <path
                d="
                  M 1080 510
                  C 930 510, 920 410, 770 410
                  C 600 410, 610 260, 450 260
                  C 290 260, 300 110, 120 110
                "
                fill="none"
                stroke="#e2e8f0"
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray="10 14"
              />

              <path
                d="
                  M 1080 510
                  C 930 510, 920 410, 770 410
                  C 600 410, 610 260, 450 260
                  C 290 260, 300 110, 120 110
                "
                fill="none"
                stroke="#dbeafe"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>

          <div className="relative hidden h-[560px] md:block">
            <div className="absolute bottom-[25px] right-[2%] w-[310px]">
              <Station
                number={1}
                icon="💬"
                title="מתחברים"
                subtitle="מחברים את WhatsApp Business ל־MagicTouch."
                active={
                  currentStep ===
                  "whatsapp"
                }
                completed={
                  whatsappConnected
                }
                onClick={() => {}}
              />
            </div>

            <div className="absolute bottom-[125px] right-[37%] w-[310px]">
              <Station
                number={2}
                icon="📅"
                title="מתאמים"
                subtitle="בוחרים Google Calendar או Microsoft 365."
                active={
                  currentStep ===
                  "calendar"
                }
                completed={
                  calendarCompleted
                }
                locked={
                  currentIndex < 1
                }
                onClick={() => {}}
              />
            </div>

            <div className="absolute left-[18%] top-[170px] w-[320px]">
              <Station
                number={3}
                icon="⚡"
                title="בונים"
                subtitle="יוצרים את תהליך ה־MagicTouch הראשון שלכם."
                active={
                  currentStep ===
                  "flow"
                }
                completed={
                  flowSelected &&
                  flowCompleted
                }
                locked={
                  currentIndex < 2
                }
                align="left"
                onClick={() => {}}
              />
            </div>

            <div className="absolute left-[3%] top-[20px] w-[300px]">
              <Station
                number={4}
                icon="🧪"
                title="מנסים"
                subtitle="מריצים תרחיש קצר ובודקים שהכול עובד יחד."
                active={
                  currentStep ===
                  "test"
                }
                completed={
                  testCompleted
                }
                locked={
                  currentIndex < 3
                }
                align="left"
                onClick={() => {}}
              />
            </div>

            <div
              className={[
                "absolute left-[4%] top-[285px] rounded-[28px] border p-5 text-center transition duration-500",
                currentStep ===
                "launch"
                  ? "scale-105 border-violet-200 bg-gradient-to-br from-violet-50 to-blue-50 shadow-xl"
                  : "border-slate-200 bg-slate-50 opacity-50",
              ].join(" ")}
            >
              <div className="text-5xl">
                🚀
              </div>

              <div className="mt-3 text-lg font-black text-slate-950">
                מוכנים להמראה
              </div>

              <div className="mt-1 text-xs text-slate-500">
                MagicTouch פעיל
              </div>
            </div>
          </div>

          <div className="relative space-y-8 md:hidden">
            <Station
              number={1}
              icon="💬"
              title="מתחברים"
              subtitle="מחברים WhatsApp Business."
              active={
                currentStep ===
                "whatsapp"
              }
              completed={
                whatsappConnected
              }
            />

            <Station
              number={2}
              icon="📅"
              title="מתאמים"
              subtitle="מחברים את היומן."
              active={
                currentStep ===
                "calendar"
              }
              completed={
                calendarCompleted
              }
              locked={
                currentIndex < 1
              }
            />

            <Station
              number={3}
              icon="⚡"
              title="בונים"
              subtitle="יוצרים תהליך ראשון."
              active={
                currentStep ===
                "flow"
              }
              completed={
                flowSelected &&
                flowCompleted
              }
              locked={
                currentIndex < 2
              }
            />

            <Station
              number={4}
              icon="🧪"
              title="מנסים"
              subtitle="בודקים את התהליך."
              active={
                currentStep ===
                "test"
              }
              completed={
                testCompleted
              }
              locked={
                currentIndex < 3
              }
            />
          </div>
        </section>

        <section className="relative -mt-16 mx-auto max-w-4xl px-3 md:-mt-20">
          <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/50 md:p-8">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-blue-600">
                  המשימה הנוכחית
                </div>

                <h2 className="mt-1 text-2xl font-black text-slate-950">
                  {currentStep ===
                  "whatsapp"
                    ? "מחברים את WhatsApp"
                    : currentStep ===
                        "calendar"
                      ? "בוחרים איך מתאמים פגישות"
                      : currentStep ===
                          "flow"
                        ? "בונים תהליך ראשון"
                        : currentStep ===
                            "test"
                          ? "עושים בדיקת מערכת"
                          : "MagicTouch מוכן"}
                </h2>
              </div>

              <div className="hidden h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-xl md:flex">
                {currentStep ===
                "whatsapp"
                  ? "💬"
                  : currentStep ===
                      "calendar"
                    ? "📅"
                    : currentStep ===
                        "flow"
                      ? "⚡"
                      : currentStep ===
                          "test"
                        ? "🧪"
                        : "🚀"}
              </div>
            </div>

            {currentStep ===
            "whatsapp" ? (
              <div>
                <p className="max-w-2xl text-sm leading-7 text-slate-600">
                  זה הערוץ שדרכו
                  MagicTouch ידבר עם
                  הלקוחות שלכם. החיבור
                  מתבצע ישירות ובאופן
                  מאובטח מול Meta.
                </p>

                {loadingWhatsApp ? (
                  <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                    <div className="font-bold text-slate-700">
                      בודק את חיבור
                      WhatsApp...
                    </div>

                    <div className="mt-1 text-sm text-slate-500">
                      אנחנו בודקים אם
                      החשבון כבר מחובר
                      ל־MagicTouch.
                    </div>
                  </div>
                ) : !agentId ? (
                  <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-bold text-rose-700">
                    לא נמצא סוכן פעיל
                    עבור החיבור.
                  </div>
                ) : (
                  <div className="mt-5">
                    <WhatsAppEmbeddedSignup
                      agentId={
                        agentId
                      }
                      isConnected={
                        whatsappConnected
                      }
                      onConnected={() => {
                        setWhatsappConnected(
                          true
                        );
                      }}
                      onError={(error) => {
                        console.error(
                          "[MagicTouchOnboarding] WhatsApp connection failed",
                          error
                        );
                      }}
                    />
                  </div>
                )}
              </div>
            ) : null}

            {currentStep ===
            "calendar" ? (
              <div>
                <p className="mb-5 text-sm leading-7 text-slate-600">
                  אם אתם קובעים פגישות עם
                  לקוחות, MagicTouch יכול
                  לשלוח את קישור התיאום,
                  לזהות פגישה שנקבעה
                  ולהגיב גם לביטול.
                </p>

                {loadingCalendars ? (
                  <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    בודק אילו יומנים כבר
                    מחוברים ל־MagicTouch...
                  </div>
                ) : null}

                {loadingAppointmentProvider ? (
                  <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    טוען את יומן ברירת
                    המחדל של MagicTouch...
                  </div>
                ) : null}

                {savingAppointmentProvider ? (
                  <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-semibold text-blue-700">
                    שומר את בחירת היומן...
                  </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="relative">
                    {googleReady ? (
                      <span className="absolute right-3 top-3 z-10 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-black text-emerald-700">
                        ✓ מוכן
                      </span>
                    ) : googleCalendarConfig?.connected ===
                      true ? (
                      <span className="absolute right-3 top-3 z-10 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-black text-amber-800">
                        מחובר · נדרשת השלמה
                      </span>
                    ) : null}

                    <ChoiceCard
                      selected={
                        calendarProvider ===
                        "google"
                      }
                      icon="🗓️"
                      title="Google Calendar"
                      description="חיבור היומן ודף קביעת הפגישות של Google."
                      onClick={() => {
                        void saveAppointmentProvider(
                          "google"
                        );
                      }}
                    />
                  </div>

                  <div className="relative">
                    {microsoftReady ? (
                      <span className="absolute right-3 top-3 z-10 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-black text-emerald-700">
                        ✓ מוכן
                      </span>
                    ) : microsoftBookingsConfig?.connected ===
                      true ? (
                      <span className="absolute right-3 top-3 z-10 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-black text-amber-800">
                        מחובר · נדרשת השלמה
                      </span>
                    ) : null}

                    <ChoiceCard
                      selected={
                        calendarProvider ===
                        "microsoft"
                      }
                      icon="📅"
                      title="Microsoft 365"
                      description="חיבור Microsoft Bookings והגדרת פגישת ברירת המחדל."
                      onClick={() => {
                        void saveAppointmentProvider(
                          "microsoft"
                        );
                      }}
                    />
                  </div>

                  <ChoiceCard
                    selected={
                      calendarProvider ===
                      "none"
                    }
                    icon="⏭️"
                    title="לא כרגע"
                    description="אפשר לדלג ולחבר יומן מאוחר יותר."
                    onClick={() => {
                      void saveAppointmentProvider(
                        "none"
                      );
                    }}
                  />
                </div>

                {calendarProvider ? (
                  <div className="mt-4 inline-flex rounded-full bg-slate-900 px-3 py-1.5 text-xs font-bold text-white">
                    ברירת מחדל:{" "}
                    {calendarProvider ===
                    "google"
                      ? "Google Calendar"
                      : calendarProvider ===
                          "microsoft"
                        ? "Microsoft 365"
                        : "ללא יומן"}
                  </div>
                ) : null}

                {calendarProvider ===
                "google" ? (
                  <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/40 p-5">
                    {!agentId ? (
                      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
                        לא נמצא סוכן פעיל עבור החיבור.
                      </div>
                    ) : (
                      <GoogleCalendarSetup
                        agentId={
                          agentId
                        }
                        compact
                      />
                    )}
                  </div>
                ) : null}

                {calendarProvider ===
                "microsoft" ? (
                  <div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50/40 p-5">
                    {!agentId ? (
                      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
                        לא נמצא סוכן פעיל עבור החיבור.
                      </div>
                    ) : (
                      <MicrosoftBookingsSetup
                        agentId={
                          agentId
                        }
                        compact
                      />
                    )}
                  </div>
                ) : null}

                {calendarProvider ===
                "none" ? (
                  <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="font-bold text-slate-800">
                      ממשיכים בלי יומן
                    </div>

                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      אפשר לחבר Google או
                      Microsoft מאוחר יותר.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {currentStep ===
            "flow" ? (
              <div>
                <p className="mb-5 text-sm leading-7 text-slate-600">
                  קודם בוחרים איך
                  MagicTouch יתחיל לעבוד
                  אצלכם. אפשר לבחור מסלול
                  אחד או את שניהם.
                </p>

                {loadingFirstFlowMode ? (
                  <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    טוען את בחירת התהליך
                    הראשון...
                  </div>
                ) : null}

                {savingFirstFlowMode ? (
                  <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-semibold text-blue-700">
                    שומר את הבחירה...
                  </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2">
                  <ChoiceCard
                    selected={
                      firstFlow.outbound
                    }
                    icon="📣"
                    title="אני פונה ללקוחות"
                    description="פנייה יזומה: יוצרים תבנית Meta, מגדירים כפתורי תגובה וממשיכים משם ל־Flow."
                    onClick={() => {
                      void saveFirstFlowMode({
                        ...firstFlow,

                        outbound:
                          !firstFlow.outbound,
                      });
                    }}
                  />

                  <ChoiceCard
                    selected={
                      firstFlow.inbound
                    }
                    icon="💬"
                    title="לקוחות פונים אליי"
                    description="פנייה נכנסת: נגדיר מענה ראשוני ומה MagicTouch יעשה לפי הכפתור או הטקסט של הלקוח."
                    onClick={() => {
                      void saveFirstFlowMode({
                        ...firstFlow,

                        inbound:
                          !firstFlow.inbound,
                      });
                    }}
                  />
                </div>

                {flowSelected ? (
                  <div className="mt-5 flex flex-wrap gap-2 text-xs">
                    {firstFlow.outbound ? (
                      <span className="rounded-full bg-blue-50 px-3 py-1.5 font-bold text-blue-700">
                        📣 פנייה יזומה
                      </span>
                    ) : null}

                    {firstFlow.inbound ? (
                      <span className="rounded-full bg-violet-50 px-3 py-1.5 font-bold text-violet-700">
                        💬 פנייה נכנסת
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {firstFlow.outbound ? (
                  <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/30 p-5">
                    <div className="mb-5">
                      <div className="text-xs font-black text-blue-600">
                        מסלול 1 · פנייה יזומה
                      </div>

                      <h3 className="mt-1 text-xl font-black text-slate-950">
                        יוצרים את ההודעה הראשונה ללקוח
                      </h3>

                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        בפנייה יזומה WhatsApp
                        דורשת תבנית מאושרת על
                        ידי Meta. כאן יוצרים
                        אותה ומגדירים איך
                        הלקוח יוכל להגיב.
                      </p>
                    </div>

                    {outboundTemplateName ? (
                      <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                        <div className="font-black text-emerald-900">
                          ✓ התבנית נוצרה ונשלחה
                          ל־Meta
                        </div>

                        <div
                          className="mt-2 text-sm text-emerald-800"
                          dir="ltr"
                        >
                          {outboundTemplateName}
                        </div>

                        <div className="mt-1 text-xs font-bold text-emerald-700">
                          סטטוס:{" "}
                          {outboundTemplateStatus ||
                            "PENDING"}
                        </div>

                        <p className="mt-2 text-xs leading-5 text-emerald-800">
                          אפשר להמשיך לבנות את
                          ה־Flow גם בזמן
                          שהתבנית ממתינה לאישור.
                          לפני שליחה אמיתית
                          נוודא שהיא APPROVED.
                        </p>
                      </div>
                    ) : (
                      !agentId ? (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
                          לא נמצא סוכן פעיל.
                        </div>
                      ) : (
                        <WhatsAppTemplateBuilder
                          agentId={
                            agentId
                          }
                          compact
                          defaultTemplateName="magic_touch_first_outbound"
                          defaultBodyText={`שלום {{1}},
רצינו לבדוק האם תרצה שנמשיך מכאן ונקבע שיחה קצרה.`}
                          onCreated={
                            handleOutboundTemplateCreated
                          }
                        />
                      )
                    )}
                  </div>
                ) : null}

                {firstFlow.inbound ? (
                  <div className="mt-6 rounded-2xl border border-violet-100 bg-violet-50/40 p-5">
                    <div className="text-xs font-black text-violet-600">
                      מסלול 2 · פנייה נכנסת
                    </div>

                    <h3 className="mt-1 text-xl font-black text-slate-950">
                      מענה ראשוני ללקוח שפנה
                    </h3>

                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      במסלול הזה לא צריך
                      Template כדי לפתוח את
                      השיחה. נגדיר הודעת מענה
                      ראשונית ואת הפעולות
                      שהלקוח יכול לבחור.
                    </p>

                    <div className="mt-5">
                      {!agentId ? (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
                          לא נמצא סוכן פעיל.
                        </div>
                      ) : (
                        <InboundFirstResponseBuilder
                          agentId={
                            agentId
                          }
                          onSaved={() => {
                            setInboundSetupCompleted(
                              true
                            );
                          }}
                        />
                      )}
                    </div>
                  </div>
                ) : null}

                {!flowSelected ? (
                  <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    בחרו לפחות דרך התחלה אחת
                    כדי להמשיך.
                  </div>
                ) : null}

                {flowSelected &&
                !flowCompleted ? (
                  <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                    נשלים את כל המסלולים
                    שבחרתם לפני שהתחנה תסומן
                    כהושלמה.
                  </div>
                ) : null}
              </div>
            ) : null}

            {currentStep ===
            "test" ? (
              <div>
                <p className="text-sm leading-7 text-slate-600">
                  החיבורים מוכנים והתהליך
                  הראשון נבנה. עכשיו נריץ
                  בדיקה קצרה לפני ההפעלה.
                </p>

                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 font-bold text-emerald-700">
                    ✓ WhatsApp
                  </div>

                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 font-bold text-emerald-700">
                    ✓ יומן
                  </div>

                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 font-bold text-emerald-700">
                    ✓ תהליך ראשון
                  </div>
                </div>

                <button
                  type="button"
                  className="mt-5 rounded-xl bg-slate-950 px-6 py-3 font-bold text-white hover:bg-slate-800"
                  onClick={() =>
                    setTestCompleted(
                      true
                    )
                  }
                >
                  הרצת בדיקת המראה
                </button>
              </div>
            ) : null}

            {currentStep ===
            "launch" ? (
              <div className="rounded-2xl bg-gradient-to-l from-blue-50 to-violet-50 p-6 text-center">
                <div className="text-5xl">
                  🚀
                </div>

                <h3 className="mt-4 text-2xl font-black text-slate-950">
                  MagicTouch מוכן להמראה
                </h3>

                <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-slate-600">
                  החיבורים מוכנים,
                  התהליך הראשון הוגדר
                  והמערכת מוכנה להתחיל
                  לעבוד עם לקוחות.
                </p>

                <button
                  type="button"
                  className="mt-5 rounded-xl bg-blue-600 px-7 py-3 font-bold text-white shadow-sm hover:bg-blue-700"
                >
                  כניסה ל־MagicTouch
                </button>
              </div>
            ) : null}
          </div>
        </section>

        <div className="h-16" />
      </div>
    </main>
  );
}
