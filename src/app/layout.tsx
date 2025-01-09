
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
        <AuthContextProvider>
          <div className="flex flex-col min-h-screen relative">
            {/* בחירת TopBar או Header לפי ה-flag */}
            {isNewDesignEnabled ? (
              <TopBar className="bg-custom-blue p-4" />
            ) : (
              <Header />
            )}
            <div className="flex flex-grow">
              {isNewDesignEnabled ? (
             <Navbar items={pages} bottomPage={bottomPage} className="custom-navbar" />
) : (
                <Sidebar />
              )}
              <div
  className="flex-grow"
  style={{
    backgroundColor: isNewDesignEnabled ? "var(--clrgray1)" : "#C6CFD4",
  }}
>
  {children}
</div>
            </div>
          </div>
        </AuthContextProvider>
      </body>
    </html>
  );
}
