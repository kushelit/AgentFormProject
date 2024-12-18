"use client";
import React, { useEffect, useState } from "react";
import { db } from "@/lib/firebase/firebase";
import { collection, getDocs, updateDoc, doc, query, where, QueryDocumentSnapshot, DocumentData, getDoc } from "firebase/firestore";
import useFetchAgentData from "@/hooks/useFetchAgentData";

type SourceLead = {
  id: string;
  sourceLead: string;
  statusLead: boolean;
  AgentId: string;
  agentName?: string;
  agentsPool?: string[];
};

const ManagePoolAgents = () => {
  const [sourceLeads, setSourceLeads] = useState<SourceLead[]>([]);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const { agents } = useFetchAgentData();

  const fetchActiveSourceLeads = async () => {
    try {
      const q = query(collection(db, "sourceLead"), where("statusLead", "==", true)
      , where("isAPILead", "==", true)
    );
      const querySnapshot = await getDocs(q);
  
      const sourceLeadList = await Promise.all(
        querySnapshot.docs.map(async (snapshot) => {
          const data = snapshot.data();
          let agentName = "סוכן לא נמצא";
          
          if (data.AgentId) {
            const agentDocRef = doc(db, "users", data.AgentId); // יצירת הפניה למסמך
            const agentDocSnap = await getDoc(agentDocRef); // שליפת המסמך
            if (agentDocSnap.exists()) {
              const agentData = agentDocSnap.data();
              agentName = agentData?.name || "ללא שם"; // שם הסוכן אם קיים
            }
          }
  
          return {
            id: snapshot.id,
            sourceLead: data.sourceLead || "Unknown Source",
            statusLead: data.statusLead || false,
            AgentId: data.AgentId || "",
            agentName,
            agentsPool: Array.isArray(data.agentsPool) ? data.agentsPool : [],
          };
        })
      );
  
      setSourceLeads(sourceLeadList);
    } catch (error) {
      console.error("Error fetching active source leads:", error);
    }
  };

  const handleAgentToggle = (sourceId: string, agentId: string) => {
    setSourceLeads((prevSourceLeads) =>
      prevSourceLeads.map((source) =>
        source.id === sourceId
          ? {
              ...source,
              agentsPool: source.agentsPool?.includes(agentId)
                ? source.agentsPool.filter((id) => id !== agentId)
                : [...(source.agentsPool || []), agentId],
            }
          : source
      )
    );
  };

  const saveAgentsPool = async (sourceId: string, agentsPool: string[]) => {
    try {
      const sourceRef = doc(db, "sourceLead", sourceId);
      await updateDoc(sourceRef, { agentsPool });
      console.log("Agents pool updated successfully");
    } catch (error) {
      console.error("Error updating agents pool:", error);
    }
  };

  useEffect(() => {
    fetchActiveSourceLeads();
  }, []);

  return (
    <div className="content-container">
      <table style={{ width: "100%", textAlign: "center", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th>סוכן אחראי</th>
            <th>מקור ליד</th>
            <th>סטטוס</th>
            <th>פול סוכנים</th>
            <th>הוספת סוכנים</th>
            <th>שמור</th>
          </tr>
        </thead>
        <tbody>
          {sourceLeads.map((source) => (
            <tr key={source.id}>
              <td>{source.agentName || "ללא סוכן"}</td>
              <td>{source.sourceLead || "ללא שם"}</td>
              <td>{source.statusLead ? "פעיל" : "לא פעיל"}</td>
              <td>
                {source.agentsPool?.length
                  ? source.agentsPool
                      .map((agentId) => agents.find((a) => a.id === agentId)?.name || "סוכן לא נמצא")
                      .join(", ")
                  : "אין סוכנים"}
              </td>
              <td>
                <button onClick={() => setOpenDropdownId((prev) => (prev === source.id ? null : source.id))}>
                  בחר סוכנים ▼
                </button>
                {openDropdownId === source.id && (
                  <div style={{ position: "absolute", zIndex: 10, background: "white", border: "1px solid #ccc" }}>
                    {agents.map((agent) => (
                      <label key={agent.id} style={{ display: "block" }}>
                        <input
                          type="checkbox"
                          checked={source.agentsPool?.includes(agent.id) || false}
                          onChange={() => handleAgentToggle(source.id, agent.id)}
                        />
                        {agent.name}
                      </label>
                    ))}
                  </div>
                )}
              </td>
              <td>
                <button onClick={() => saveAgentsPool(source.id, source.agentsPool || [])}>שמור</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ManagePoolAgents;
