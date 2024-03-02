import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AuthContextProvider } from '@/lib/firebase/AuthContext';
import "./globals.css";
import Header from "@/components/Header";
import Link from 'next/link';
import styles from './Sidebar.module.css'; // Import CSS module for styling



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

type SidebarProps = {
  className?: string;
};

const Sidebar: React.FC<SidebarProps> = ({ className }) => {
  return (
    <div className={`${className} ${styles.sidebar} bg-custom-blue`}>
      <nav>
        <ul>
          <li><Link href="/" className="text-custom-white">ניהול עסקאות</Link></li>
          <li><Link href="/" className="text-custom-white">דף מרכז</Link></li>
          <li><Link href="/about" className="text-custom-white">ניהול עובדים</Link></li>
          <li><Link href="/contact" className="text-custom-white">ניהול יעדים ומבצעים</Link></li>
          <li><Link href="/contact" className="text-custom-white">ניהול עמלות </Link></li>
          {/* Additional list items with the class applied */}
        </ul>
      </nav>
    </div>
  );
};


