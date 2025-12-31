"use client";
import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/firebase/AuthContext";
import {
  hasSeenAnnouncement,
  markAnnouncementSeen,
} from "@/services/announcementService";
import AnnouncementV10 from "./messages/Announcement_v10";

const GlobalAnnouncementPopup = () => {
  const { user } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    const checkSeen = async () => {
      if (user?.uid) {
        const seen = await hasSeenAnnouncement(user.uid, "v10");
        setShow(!seen); // רק אם לא ראה – נציג את הפופאפ
      }
    };
    checkSeen();
  }, [user]);

  const handleAcknowledge = async () => {
    if (user?.uid) {
      await markAnnouncementSeen(user.uid, "v10");
    }
    setShow(false); // סגירה אחרי אישור
  };

  const handleClose = () => {
    setShow(false); // סגירה רגילה (X)
  };

  if (!show) return null;

  return (
    <AnnouncementV10
      onAcknowledge={handleAcknowledge}
      onClose={handleClose}
    />
  );
};

export default GlobalAnnouncementPopup;
