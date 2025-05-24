'use client';

import { usePathname } from 'next/navigation';
import { Rubik } from 'next/font/google';
import { AuthContextProvider } from '@/lib/firebase/AuthContext';
import { TopBar } from '@/components/TopBar';
import { Navbar } from '@/components/Navbar';
import pages, { bottomPage } from '@/config/pagesConfig';
import '@/app/globals.css';

const font = Rubik({ subsets: ['latin'] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // תנאים לוגיים
  const isAuthPage = pathname.startsWith('/auth');
  const isHomePage = pathname === '/home';
  const isLandingPage = pathname === '/' || pathname === '/landing';
  const isMainPage = !isAuthPage && !isHomePage && !isLandingPage;

  const showTopBar = isMainPage || isAuthPage || isHomePage;
  const showNavbar = isMainPage;
  const wrapInBox = isAuthPage;

  return (
    <html lang="he" dir="rtl">
      <body className={font.className}>
        <AuthContextProvider>
          {showTopBar && (
            <TopBar className="bg-custom-blue p-4 fixed top-0 right-0 w-full h-16 z-10" />
          )}

          <div className="flex flex-grow min-h-screen">
            {showNavbar && (
            <Navbar
            items={pages}
            bottomPage={bottomPage}
            className="custom-navbar fixed top-16 right-0 h-[calc(100vh-64px)] w-52 z-10 shadow-lg"
          />          
            )}

            <main
              className={`flex-grow pt-16 bg-gray-50 ${
                showNavbar ? 'mr-[210px]' : ''
              } flex justify-center items-start px-4`}
            >
              {wrapInBox ? (
                <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8 mt-10">
                  {children}
                </div>
              ) : (
                <div className="w-full">{children}</div>
              )}
            </main>
          </div>
        </AuthContextProvider>
        <div id="menu-portal"></div>
      </body>
    </html>
  );
}
