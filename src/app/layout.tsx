import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AuthContextProvider } from '@/lib/firebase/AuthContext';
import "./globals.css";
import Header from "@/components/Header";
import React, { ReactNode } from 'react';
import { SelectedAgentProvider } from '../context/SelectedAgentContext';
import Sidebar from "@/components/Sidebar"; // Import Sidebar component


const inter = Inter({ subsets: ["latin"] });


export const metadata: Metadata = {
  title: "Create Next App",
  description: "Generated by create next app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthContextProvider>
          <div className="flex flex-col min-h-screen"> {/* Vertical stacking for overall layout */}
            <Header /> {/* Header at the top */}
            <div className="flex flex-row flex-grow"> {/* Sidebar and main content side by side */}
              <div className="flex-grow" style={{ paddingRight: '100px' }}> {/* Adapt this if sidebar width changes */}
                {children} {/* Main content goes here */}
              </div>
              <Sidebar /> {/* Ensure Sidebar is styled or has classes to appear correctly */}
            </div>
          </div>
        </AuthContextProvider>
      </body>
    </html>
  );
}