import {
  collection,
  getDocs,
  query,
  where,
  type Firestore,
} from "firebase/firestore";
import type { MultiSheetImportProfile } from "@/types/MultiSheetImportProfile";

export async function getMultiSheetProfiles(
  db: Firestore,
  params?: {
    agentId?: string;
    agencyId?: string;
  }
): Promise<MultiSheetImportProfile[]> {
  const snap = await getDocs(
    query(
      collection(db, "multiSheetImportProfiles"),
      where("isActive", "==", true)
    )
  );

  const all = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<MultiSheetImportProfile, "id">),
  }));

  const { agentId = "", agencyId = "" } = params || {};

  return all.filter((profile) => {
    const allowedAgents = profile.scope?.agentId || [];
    const allowedAgencies = profile.scope?.agencyId || [];

    const agentOk =
      allowedAgents.length === 0 || allowedAgents.includes(agentId);

    const agencyOk =
      allowedAgencies.length === 0 || allowedAgencies.includes(agencyId);

    return agentOk && agencyOk;
  });
}