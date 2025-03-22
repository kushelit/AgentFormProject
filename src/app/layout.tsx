
import type { Metadata } from "next";
import { Rubik } from "next/font/google";
import { AuthContextProvider } from "@/lib/firebase/AuthContext";
import "./globals.css";
import Header from "@/components/Header";
import React from "react";
import Sidebar from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { useDesignFlag } from "@/hooks/useDesignFlag";
import { Navbar } from "@/components/Navbar";
import pages, { bottomPage } from '@/config/pagesConfig';
// import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// const queryClient = new QueryClient()

const font = Rubik({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Magic Sales",
  description: "Magic Sales is a sales management system for insurance agents.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isNewDesignEnabled = useDesignFlag(); // קריאה ל-hook בתוך גוף הקומפוננטה


  return (
    <html lang="he" dir="rtl">
      <body className={font.className}>
      {/* <QueryClientProvider client={queryClient}> */}
        <AuthContextProvider>
          <div className="flex flex-col min-h-screen relative">
            {/* בחירת TopBar או Header לפי ה-flag */}
            {isNewDesignEnabled ? (
              <TopBar className="bg-custom-blue p-4 fixed top-0 right-0 w-full h-16 z-10" />
            ) : (
              <Header />
            )}
            <div className="flex flex-grow">
              {isNewDesignEnabled ? (
             <Navbar items={pages} bottomPage={bottomPage} 
             className="custom-navbar fixed top-16 right-0 h-[calc(100vh-64px)] w-52 z-10 bg-custom-blue shadow-lg"
             />
) : (
                <Sidebar />
              )}
              <div
  className="flex-grow"
  style={{
    marginRight: "210px", // התאמה דינמית למרווח ה-Navbar
    marginTop: "60px", // ריווח מה-TopBar
    backgroundColor: isNewDesignEnabled ? "var(--clrgray1)" : "#C6CFD4",
  }}
>
  {children}
</div>
            </div>
          </div>
        </AuthContextProvider>
        {/* </QueryClientProvider> */}
            {/* האלמנט של ה-Portal לתפריט */}
            <div id="menu-portal"></div>
      </body>
    </html>
  );
}
