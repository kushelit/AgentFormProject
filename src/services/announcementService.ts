import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from '@/lib/firebase/firebase';

export const hasSeenAnnouncement = async (userId: string, version: string) => {
  const ref = doc(db, "announcementReads", version, "users", userId);
  const snap = await getDoc(ref);
  return snap.exists();
};

export const markAnnouncementSeen = async (userId: string, version: string) => {
  const ref = doc(db, "announcementReads", version, "users", userId);
  await setDoc(ref, {
    read: true,
    timestamp: serverTimestamp(),
  });
};
