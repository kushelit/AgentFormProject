'use client';

import { usePathname } from 'next/navigation';
import { Rubik } from 'next/font/google';
import { AuthContextProvider } from '@/lib/firebase/AuthContext';
import { TopBar } from '@/components/TopBar';
import { Navbar } from '@/components/Navbar';
import pages, { bottomPage } from '@/config/pagesConfig';
import '@/app/globals.css';
import Script from 'next/script';
import AnalyticsTracker from '@/components/AnalyticsTracker';
import WhatsAppCta from '@/components/WhatsAppCta';
import TaskReminderWatcher from '@/components/TaskReminderWatcher';
import GlobalPortalOtpWatcher from '@/components/GlobalPortalOtpWatcher';
import IdleSessionManager from '@/components/auth/IdleSessionManager';

const font = Rubik({ subsets: ['latin'] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // =========================================================
  // MagicTouch - עמודים פנימיים
  // =========================================================

  const isMagicTouchPage =
    pathname === '/MagicTouch' ||
    pathname.startsWith('/MagicTouch/');

  // =========================================================
  // MagicTouch - עמודים ציבוריים
  // =========================================================

  const isMagicTouchLandingPage =
    pathname === '/MagicTouchLanding';

  const isMagicTouchSignupPage =
    pathname === '/MagicTouchSignUp';

  const isMagicTouchTermsPage =
    pathname === '/MagicTouchTerms';

  const isMagicTouchPrivacyPage =
    pathname === '/MagicTouchPrivacy';

  // כל האזור הציבורי של MagicTouch
  const isMagicTouchPublicPage =
    isMagicTouchLandingPage ||
    isMagicTouchSignupPage ||
    isMagicTouchTermsPage ||
    isMagicTouchPrivacyPage;

  // =========================================================
  // עמודים מיוחדים נוספים
  // =========================================================

  const isOtpPage = pathname.startsWith('/otp');
  const isAuthPage = pathname.startsWith('/auth');
  const isHomePage = pathname === '/home';

  // =========================================================
  // Landing / Public pages
  // =========================================================

  const isLandingPage =
    pathname === '/' ||
    pathname === '/landing' ||
    pathname === '/subscription-sign-up' ||
    isMagicTouchPublicPage;

  // =========================================================
  // Main MagicSale pages
  // =========================================================

  const isMainPage =
    !isAuthPage &&
    !isHomePage &&
    !isLandingPage &&
    !isMagicTouchPage;

  // =========================================================
  // TopBar
  // =========================================================

  const showTopBar =
    !isOtpPage &&
    !isMagicTouchPage &&
    !isMagicTouchPublicPage &&
    (isMainPage || isAuthPage || isHomePage);

  // =========================================================
  // Navbar
  // =========================================================

  const showNavbar =
    !isOtpPage &&
    !isMagicTouchPage &&
    !isMagicTouchPublicPage &&
    isMainPage;

  // =========================================================
  // Auth wrapper
  // =========================================================

  const wrapInBox = isAuthPage;

  // =========================================================
  // Idle Session
  // =========================================================

  const shouldRunIdleSessionManager =
    !isAuthPage &&
    !isOtpPage &&
    !isLandingPage;

  // =========================================================
  // Render
  // =========================================================

  return (
    <html lang="he" dir="rtl">
      <head>
         {/* Google Search Console Verification */}
  <meta
    name="google-site-verification"
    content="6p1HoKFD9X2UMgstFD7UnMhxJ8hw7atQF"
  />
        {/* PWA */}
        <link rel="manifest" href="/manifest.json" />

        <meta
          name="theme-color"
          content="#111827"
        />

        <meta
          name="apple-mobile-web-app-capable"
          content="yes"
        />

        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="default"
        />

        <meta
          name="apple-mobile-web-app-title"
          content="Magic OTP"
        />

        <link
          rel="apple-touch-icon"
          href="/static/img/icon-192.png"
        />

        <link
          rel="icon"
          href="/static/img/icon-192.png"
        />

        {/* Google Analytics */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-S97DHBQ7EM"
          strategy="afterInteractive"
        />

        <Script
          id="google-analytics"
          strategy="afterInteractive"
        >
          {`
            window.dataLayer = window.dataLayer || [];

            function gtag(){
              dataLayer.push(arguments);
            }

            gtag('js', new Date());

            gtag('config', 'G-S97DHBQ7EM', {
              page_path: window.location.pathname,
            });
          `}
        </Script>
      </head>

      <body className={font.className}>
        <AuthContextProvider>
          <AnalyticsTracker />

          {/* Idle session רק בתוך המערכת */}
          {shouldRunIdleSessionManager && (
            <IdleSessionManager />
          )}

          {/* לא להפעיל תזכורות בעמודי MagicTouch הציבוריים */}
          {!isMagicTouchPublicPage && (
            <TaskReminderWatcher />
          )}

          {/* OTP גלובלי */}
          {!isMagicTouchPublicPage &&
            !isOtpPage && (
              <GlobalPortalOtpWatcher />
            )}

          {/* TopBar */}
          {showTopBar && (
            <TopBar
              className="
                bg-custom-blue
                p-4
                fixed
                top-0
                right-0
                w-full
                h-16
                z-10
              "
            />
          )}

          <div className="flex flex-grow min-h-screen">

            {/* Navbar */}
            {showNavbar && (
              <Navbar
                items={pages}
                bottomPage={bottomPage}
                className="
                  custom-navbar
                  fixed
                  top-16
                  right-0
                  h-[calc(100vh-64px)]
                  w-52
                  z-10
                  shadow-lg
                "
              />
            )}

            <main
              className={`
                flex-grow

                ${
                  isOtpPage ||
                  isMagicTouchPage ||
                  isMagicTouchPublicPage
                    ? ''
                    : 'pt-16 bg-gray-50'
                }

                ${
                  showNavbar
                    ? 'mr-[210px]'
                    : ''
                }

                flex
                justify-center
                items-start

                ${
                  isOtpPage ||
                  isMagicTouchPage ||
                  isMagicTouchPublicPage
                    ? ''
                    : 'px-4'
                }
              `}
            >
              {wrapInBox ? (
                <div
                  className="
                    w-full
                    max-w-md
                    bg-white
                    rounded-xl
                    shadow-lg
                    p-8
                    mt-10
                  "
                >
                  {children}
                </div>
              ) : (
                <div className="w-full">
                  {children}
                </div>
              )}
            </main>
          </div>
        </AuthContextProvider>

        {/* WhatsApp CTA לא מוצג באזור MagicTouch */}
        {!isMagicTouchPage &&
          !isMagicTouchPublicPage && (
            <WhatsAppCta />
          )}

        <div id="menu-portal"></div>
      </body>
    </html>
  );
}