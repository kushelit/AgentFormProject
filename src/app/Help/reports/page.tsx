'use client';

import React, { useEffect, useState } from "react";
import Image from "next/image";
import './reports.css';
import HelpNavigation from "@/components/HelpNavigation/HelpNavigation";

const reportsHelp = () => {

  const [isClient, setIsClient] = useState(false);

useEffect(() => {
  setIsClient(true);
}, []);

if (!isClient) return null;



  return (
    <div className="help-container">
      <h1>📖 ניהול עסקאות ועמידה ביעדים</h1>

      <h2>📊 עמידה ביעדים</h2>
      <Image src="/static/img/filters.png" alt="סינון ומיון עסקאות" width={800} height={400} />

      {/* 🔗 הוספת הניווט לעמודים נוספים */}
      <HelpNavigation />
    </div>
  );
};

export default reportsHelp;