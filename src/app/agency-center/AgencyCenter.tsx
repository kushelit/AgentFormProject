// app/agency-center/AgencyCenter.tsx
'use client';

import React, { useState } from "react";
import AgencyGeneralInfo from "@/components/Agency/AgencyGeneralInfo";
import AgencyCommissionContractsManager from "@/components/Agency/AgencyCommissionContractsManager";
import "./AgencyCenter.css";

interface AgencyCenterProps {
  agencyId: string;
}

const AgencyCenter: React.FC<AgencyCenterProps> = ({ agencyId }) => {
  const [activeTab, setActiveTab] = useState<"info" | "contracts">("info");

  return (
    <div className="content-container agency-center-page" dir="rtl">
      <div className="agency-center-wrapper">
        <div className="table-header">
          <div className="table-title">מרכז סוכנות</div>
          <div className="table-subtitle">
            פרטי סוכנות והגדרת הסכמי עמלות למוצר לבית סוכן
          </div>

          <div className="tabs">
            <button
              className={`tab ${activeTab === "info" ? "selected" : "default"}`}
              onClick={() => setActiveTab("info")}
            >
              פרטי סוכנות
            </button>
            <button
              className={`tab ${
                activeTab === "contracts" ? "selected" : "default"
              }`}
              onClick={() => setActiveTab("contracts")}
            >
              הסכמי עמלות סוכנות
            </button>
          </div>
        </div>

        <div className="tab-content">
          <div
            id="agency-info-tab"
            className={activeTab === "info" ? "active" : ""}
          >
            {activeTab === "info" && <AgencyGeneralInfo agencyId={agencyId} />}
          </div>

          <div
            id="agency-contracts-tab"
            className={activeTab === "contracts" ? "active" : ""}
          >
            {activeTab === "contracts" && (
              <AgencyCommissionContractsManager agencyId={agencyId} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgencyCenter;
