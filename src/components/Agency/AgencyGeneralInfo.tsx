'use client';

import React, { useEffect, useState } from "react";
import { db } from "@/lib/firebase/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { Button } from "@/components/Button/Button";

interface AgencyGeneralInfoProps {
  agencyId: string;
}

interface AgencyData {
  name: string;
  // כאן נוסיף שדות נוספים בעתיד: billingPlan, maxLicenses וכו'
}

const AgencyGeneralInfo: React.FC<AgencyGeneralInfoProps> = ({ agencyId }) => {
  const [agency, setAgency] = useState<AgencyData>({ name: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const ref = doc(db, "agencies", agencyId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data() as any;
          setAgency({
            name: data.name || "",
          });
        } else {
          setAgency({ name: "" });
        }
      } catch (e) {
        console.error("Failed to load agency info", e);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [agencyId]);

  const handleChange = (field: keyof AgencyData, value: any) => {
    setAgency((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const ref = doc(db, "agencies", agencyId);
      await setDoc(
        ref,
        {
          name: agency.name,
          // כאן נוסיף שדות נוספים בעתיד
        },
        { merge: true }
      );
    } catch (e) {
      console.error("Failed to save agency info", e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-4 text-gray-600">טוען פרטי סוכנות...</div>;
  }

  return (
    <div className="p-4 space-y-4" dir="rtl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col">
          <label className="mb-1 text-sm font-semibold">שם הסוכנות</label>
          <input
            type="text"
            className="border rounded px-2 py-1"
            value={agency.name}
            onChange={(e) => handleChange("name", e.target.value)}
          />
        </div>

        {/* כאן נוסיף מאוחר יותר עוד שדות – רישיונות, גבייה וכו' */}
      </div>

      <div className="mt-4">
        <Button
          onClick={handleSave}
          text={saving ? "שומר..." : "שמור פרטים"}
          type="primary"
          icon="off"
          state="default"
          disabled={saving}
        />
      </div>
    </div>
  );
};

export default AgencyGeneralInfo;
