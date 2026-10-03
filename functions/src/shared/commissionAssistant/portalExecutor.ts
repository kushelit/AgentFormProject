/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */
export type PortalExecutionMode = "runner" | "extension";
export async function getAgentPortalExecutionMode(db: FirebaseFirestore.Firestore, agentId: string): Promise<PortalExecutionMode> {
  const snap = await db.doc("users/" + agentId).get();
  if (!snap.exists) throw new Error("COMMISSION_ASSISTANT_AGENT_NOT_FOUND");
  const mode = snap.data()?.portalExecutionMode;
  if (mode == null || mode === "" || mode === "runner") return "runner";
  if (mode === "extension") return "extension";
  throw new Error("COMMISSION_ASSISTANT_EXECUTION_MODE_INVALID");
}
