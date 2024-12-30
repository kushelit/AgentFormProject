import type { Metadata } from "next";
import { Rubik } from "next/font/google";
import { AuthContextProvider } from '@/lib/firebase/AuthContext';
import "./globals.css";
import Header from "@/components/Header";
import React from 'react';
import { SelectedAgentProvider } from '../context/SelectedAgentContext';
import Sidebar from "@/components/Sidebar"; // Import Sidebar component
import {TopBar} from "@/components/TopBar";
import { useDesignFlag } from  "@/hooks/useDesignFlag";


const isNewDesignEnabled = useDesignFlag();
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
              <Sidebar />
              <div className="flex-grow" style={{ backgroundColor: '#C6CFD4'  }}> {/* Adapt this if sidebar width changes */}
                {children} {/* Main content goes here */}
              </div>            </div>
          </div>
        </AuthContextProvider>
      </body>
    </html>
  );
}