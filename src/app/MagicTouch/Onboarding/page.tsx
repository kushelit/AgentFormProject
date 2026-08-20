"use client";

import React, {
  useMemo,
  useState,
} from "react";

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
  const [
    whatsappConnected,
    setWhatsappConnected,
  ] = useState(false);

  const [
    calendarProvider,
    setCalendarProvider,
  ] =
    useState<CalendarProvider>(
      null
    );

  const [
    calendarConnected,
    setCalendarConnected,
  ] = useState(false);

  const [
    firstFlow,
    setFirstFlow,
  ] =
    useState<FirstFlowChoice>({
      outbound: false,
      inbound: false,
    });

  const [
    flowCompleted,
    setFlowCompleted,
  ] = useState(false);

  const [
    testCompleted,
    setTestCompleted,
  ] = useState(false);

  const calendarCompleted =
    calendarProvider === "none" ||
    (
      calendarProvider !== null &&
      calendarConnected
    );

  const flowSelected =
    firstFlow.outbound ||
    firstFlow.inbound;

  const currentStep =
    useMemo<JourneyStep>(() => {
      if (!whatsappConnected) {
        return "whatsapp";
      }

      if (!calendarCompleted) {
        return "calendar";
      }

      if (
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
      whatsappConnected,
      calendarCompleted,
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
        {/* HERO */}
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

        {/* JOURNEY */}
        <section className="relative mt-8 overflow-hidden rounded-[36px] border border-slate-200 bg-white px-5 py-8 shadow-sm md:min-h-[640px] md:px-10 md:py-12">
          {/* desktop flight path */}
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
            {/* STATION 1 */}
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

            {/* STATION 2 */}
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

            {/* STATION 3 */}
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

            {/* STATION 4 */}
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

            {/* LAUNCH */}
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

          {/* mobile journey */}
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

        {/* CURRENT MISSION */}
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

            {/* WHATSAPP */}
            {currentStep ===
            "whatsapp" ? (
              <div>
                <p className="max-w-2xl text-sm leading-7 text-slate-600">
                  זה הערוץ שדרכו
                  MagicTouch ידבר עם
                  הלקוחות שלכם. החיבור
                  מתבצע ישירות מול Meta.
                </p>

                <button
                  type="button"
                  className="mt-5 rounded-xl bg-blue-600 px-6 py-3 font-bold text-white shadow-sm transition hover:bg-blue-700"
                  onClick={() =>
                    setWhatsappConnected(
                      true
                    )
                  }
                >
                  חיבור WhatsApp עם Meta
                </button>

                <div className="mt-3 text-xs text-slate-400">
                  כרגע הכפתור מדמה חיבור
                  מוצלח.
                </div>
              </div>
            ) : null}

            {/* CALENDAR */}
            {currentStep ===
            "calendar" ? (
              <div>
                <p className="mb-5 text-sm leading-7 text-slate-600">
                  אם אתם קובעים פגישות עם
                  לקוחות, MagicTouch יכול
                  לשלוח את הקישור ולזהות
                  קביעה או ביטול.
                </p>

                <div className="grid gap-4 md:grid-cols-3">
                  <ChoiceCard
                    selected={
                      calendarProvider ===
                      "google"
                    }
                    icon="🗓️"
                    title="Google Calendar"
                    description="חיבור היומן ודף קביעת הפגישות של Google."
                    onClick={() => {
                      setCalendarProvider(
                        "google"
                      );

                      setCalendarConnected(
                        false
                      );
                    }}
                  />

                  <ChoiceCard
                    selected={
                      calendarProvider ===
                      "microsoft"
                    }
                    icon="📅"
                    title="Microsoft 365"
                    description="חיבור Microsoft Bookings וסנכרון פגישות."
                    onClick={() => {
                      setCalendarProvider(
                        "microsoft"
                      );

                      setCalendarConnected(
                        false
                      );
                    }}
                  />

                  <ChoiceCard
                    selected={
                      calendarProvider ===
                      "none"
                    }
                    icon="⏭️"
                    title="לא כרגע"
                    description="אפשר לדלג ולחבר יומן מאוחר יותר."
                    onClick={() => {
                      setCalendarProvider(
                        "none"
                      );

                      setCalendarConnected(
                        false
                      );
                    }}
                  />
                </div>

                {calendarProvider &&
                calendarProvider !==
                  "none" ? (
                  <button
                    type="button"
                    className="mt-5 rounded-xl bg-blue-600 px-6 py-3 font-bold text-white hover:bg-blue-700"
                    onClick={() =>
                      setCalendarConnected(
                        true
                      )
                    }
                  >
                    {calendarProvider ===
                    "google"
                      ? "חיבור Google"
                      : "חיבור Microsoft 365"}
                  </button>
                ) : null}
              </div>
            ) : null}

            {/* FLOW */}
            {currentStep ===
            "flow" ? (
              <div>
                <p className="mb-5 text-sm leading-7 text-slate-600">
                  בחרו מאיפה אתם רוצים
                  להתחיל. אפשר לבחור גם את
                  שני המסלולים.
                </p>

                <div className="grid gap-4 md:grid-cols-2">
                  <ChoiceCard
                    selected={
                      firstFlow.outbound
                    }
                    icon="📣"
                    title="אני פונה ללקוחות"
                    description="ניצור הודעת Meta ראשונה ונגדיר כיצד הלקוח יכול להגיב."
                    onClick={() =>
                      setFirstFlow(
                        (
                          current
                        ) => ({
                          ...current,
                          outbound:
                            !current.outbound,
                        })
                      )
                    }
                  />

                  <ChoiceCard
                    selected={
                      firstFlow.inbound
                    }
                    icon="💬"
                    title="לקוחות פונים אליי"
                    description="נגדיר מענה ראשוני ומה קורה לפי התגובה של הלקוח."
                    onClick={() =>
                      setFirstFlow(
                        (
                          current
                        ) => ({
                          ...current,
                          inbound:
                            !current.inbound,
                        })
                      )
                    }
                  />
                </div>

                {flowSelected ? (
                  <button
                    type="button"
                    className="mt-5 rounded-xl bg-blue-600 px-6 py-3 font-bold text-white hover:bg-blue-700"
                    onClick={() =>
                      setFlowCompleted(
                        true
                      )
                    }
                  >
                    המשך לבניית התהליך
                  </button>
                ) : null}
              </div>
            ) : null}

            {/* TEST */}
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

            {/* LAUNCH */}
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