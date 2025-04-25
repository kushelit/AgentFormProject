'use client';

import { useEffect, useState } from 'react';
import { getDocs, collection, updateDoc, doc, deleteField, addDoc, deleteDoc, where, query, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { UserData, ManagerData } from '@/types/User';
import { ToastNotification } from '@/components/ToastNotification';
import { useToast } from '@/hooks/useToast';

export default function ManageManagersList() {
  const [managers, setManagers] = useState<ManagerData[]>([]);
const [agentsToPromote, setAgentsToPromote] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const { toasts, addToast, setToasts } = useToast();

  useEffect(() => {
    const fetchManagers = async () => {
      const querySnapshot = await getDocs(collection(db, 'users'));
      const allUsers = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as UserData[];

      const managerUsers = allUsers.filter(user => user.role === 'manager') as ManagerData[];
const agentUsers = allUsers.filter(user => user.role === 'agent' && !user.managerId);
      setManagers(managerUsers);
setAgentsToPromote(agentUsers);
      setLoading(false);
    };

    fetchManagers();
  }, []);

  const fetchAgentsByManager = async (managerId: string) => {
    const querySnapshot = await getDocs(collection(db, 'users'));
    const allUsers = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as UserData[];

    return allUsers.filter(user => user.role === 'agent' && user.managerId === managerId);
  };

  const demoteToAgent = async (managerId: string) => {
    try {
      const managerDoc = await getDoc(doc(db, 'users', managerId));
      const managerData = managerDoc.exists() ? managerDoc.data() : null;
      const agentGroupId = managerData?.agentGroupId;
  
      if (!agentGroupId) {
        console.error('❌ למנהל אין groupId מוגדר');
        addToast('error', 'לא נמצא מזהה קבוצת סוכנים.');
        return;
      }
  
      // שלוף את כל הסוכנים בקבוצה
      const querySnapshot = await getDocs(
        query(collection(db, 'users'), where('agentGroupId', '==', agentGroupId))
      );
      const agentsInGroup = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
  
      if (agentsInGroup.length > 0) {
        const confirmUnlink = confirm("לא ניתן להפוך את המנהל לסוכן כל עוד יש סוכנים מקושרים, האם ברצונך להמשיך ולנתק את הסוכנים?");
        if (!confirmUnlink) return;
  
        // מחק לכל הסוכנים את ה־managerId וה־agentGroupId
        await Promise.all(agentsInGroup.map(agent =>
          updateDoc(doc(db, 'users', agent.id), {
            managerId: deleteField(),
            agentGroupId: deleteField()
          })
        ));
  
        addToast('success', 'כל הסוכנים נותקו בהצלחה');
      }
  
      // מחק את קבוצת הסוכנים מהטבלה
      await deleteDoc(doc(db, 'agentsGroup', agentGroupId));
  
      // עדכן את המנהל עצמו
      await updateDoc(doc(db, 'users', managerId), {
        role: 'agent',
        agentGroupId: deleteField()
      });
  
      setManagers(prev => prev.filter(m => m.id !== managerId));
      addToast('success', 'המנהל הוחזר לסוכן בהצלחה');
  
    } catch (error) {
      console.error('❌ שגיאה בניתוק או בעדכון:', error);
      addToast('error', 'אירעה שגיאה בתהליך הורדת המנהל');
    }
  };
  

  const ManagerCard = ({ manager }: { manager: ManagerData }) => {
    const [linkedAgents, setLinkedAgents] = useState<UserData[]>([]);
    const [availableAgents, setAvailableAgents] = useState<UserData[]>([]);
    const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
    const [showAgents, setShowAgents] = useState(false);

    const loadLinkedAgents = async () => {
      const agents = await fetchAgentsByManager(manager.id);
      setLinkedAgents(agents);
      setShowAgents(true);
    };

    const loadAvailableAgents = async () => {
      const querySnapshot = await getDocs(collection(db, 'users'));
      const allUsers = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as UserData[];

      const freeAgents = allUsers
        .filter(user => user.role === 'agent' && !user.managerId)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      setAvailableAgents(freeAgents);
    };

    const handleUnlink = async (agentId: string) => {
      try {
        await updateDoc(doc(db, 'users', agentId), {
          managerId: deleteField(),
          agentGroupId: deleteField()
        });
    
        setLinkedAgents(prev => prev.filter(a => a.id !== agentId));
        addToast('success', 'הסוכן נותק בהצלחה מהמנהל והקבוצה');
      } catch (error) {
        console.error('שגיאה בניתוק הסוכן:', error);
        addToast('error', 'אירעה שגיאה בעת ניתוק הסוכן');
      }
    };
    
    const handleAssignAgents = async () => {
      try {
        const batchUpdates = selectedAgents.map(agentId =>
          updateDoc(doc(db, 'users', agentId), {
            managerId: manager.id,
            agentGroupId: manager.agentGroupId
          })
        );

        await Promise.all(batchUpdates);

        addToast("success", "הסוכנים שויכו בהצלחה");
        setSelectedAgents([]);
        setAvailableAgents(prev => prev.filter(a => !selectedAgents.includes(a.id)));
        loadLinkedAgents();
      } catch (error) {
        console.error("שגיאה בשיוך הסוכנים:", error);
        addToast("error", "אירעה שגיאה בעת השיוך");
      }
    };

    return (
      <div className="border p-4 rounded-lg bg-white shadow-sm mb-4">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-lg font-semibold">{manager.name}</div>
            <div className="text-sm text-gray-600">{manager.email}</div>
          </div>
          <button
            onClick={() => demoteToAgent(manager.id)}
            className="bg-blue-700 text-white px-4 py-1 rounded hover:bg-blue-800"
          >
            הפוך לסוכן
          </button>
        </div>

        <div className="flex gap-4 mt-4">
          <button
            className="text-blue-600 underline"
            onClick={loadLinkedAgents}
          >
            הצג סוכנים משויכים
          </button>

          <button
            className="text-blue-600 underline"
            onClick={loadAvailableAgents}
          >
            הצג סוכנים זמינים לשיוך
          </button>
        </div>

        {showAgents && (
          <ul className="mt-2 space-y-2">
            {linkedAgents.length === 0 ? (
              <li className="text-sm text-gray-500">אין סוכנים משויכים</li>
            ) : (
              linkedAgents.map(agent => (
                <li
                  key={agent.id}
                  className="flex justify-between items-center bg-gray-100 p-2 rounded"
                >
                  <span>{agent.name}</span>
                  <button
                    onClick={() => handleUnlink(agent.id)}
                    className="text-blue-700 hover:underline"
                  >
                    נתק
                  </button>
                </li>
              ))
            )}
          </ul>
        )}

        {availableAgents.length > 0 && (
          <div className="mt-4 border-t pt-2">
            <div className="font-semibold mb-2">בחר סוכנים לשיוך:</div>
            <ul className="space-y-2">
              {availableAgents.map(agent => (
                <li key={agent.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedAgents.includes(agent.id)}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setSelectedAgents(prev =>
                        checked ? [...prev, agent.id] : prev.filter(id => id !== agent.id)
                      );
                    }}
                  />
                  <span>{agent.name}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={handleAssignAgents}
              className="mt-2 bg-blue-700 text-white px-4 py-1 rounded hover:bg-blue-800"
              disabled={selectedAgents.length === 0}
            >
              שייך סוכנים נבחרים
            </button>
          </div>
        )}
      </div>
    );
  };

  if (loading) return <div>טוען מנהלים...</div>;

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">סוכן לבחירה להפוך למנהל</h2>
      <div className="flex items-center gap-4 mb-4">
  <select
    className="border rounded px-3 py-2 w-full max-w-md"
    value={selectedAgentId}
    onChange={(e) => setSelectedAgentId(e.target.value)}
  >
    <option value="">בחר סוכן...</option>
    {agentsToPromote.map(agent => (
      <option key={agent.id} value={agent.id}>{agent.name}</option>
    ))}
  </select>
  <button
  className="bg-blue-700 text-white px-4 py-1 rounded hover:bg-blue-800"
  onClick={async () => {
    if (!selectedAgentId) {
      addToast('error', 'נא לבחור סוכן לפני לחיצה על הכפתור');
      return;
    }
    const selectedAgent = agentsToPromote.find(a => a.id === selectedAgentId);
    if (!selectedAgent) return;

    try {
      // הפוך לסוכן ל-מנהל
      await updateDoc(doc(db, 'users', selectedAgentId), { role: 'manager' });

      // צור קבוצת סוכנים חדשה
      const agentsGroupRef = await addDoc(collection(db, 'agentsGroup'), {
        managerId: selectedAgentId,
        createdAt: new Date(),
        // agencyId: selectedAgent.agencyId || null // אם יש סוכנות, לשמור
      });

      // עדכן את המנהל עם groupId
      await updateDoc(doc(db, 'users', selectedAgentId), {
        agentGroupId: agentsGroupRef.id
      });

      // עדכן סטייטים
      setManagers(prev => [...prev, { ...selectedAgent, role: 'manager', agentGroupId: agentsGroupRef.id }]);
      setAgentsToPromote(prev => prev.filter(a => a.id !== selectedAgentId));
      setSelectedAgentId('');
      addToast('success', 'הסוכן עודכן למנהל וקבוצת סוכנים נוצרה בהצלחה');
    } catch (error) {
      console.error('שגיאה בשדרוג הסוכן:', error);
      addToast('error', 'אירעה שגיאה בעת הפיכת הסוכן למנהל');
    }
  }}
  disabled={!selectedAgentId}
>
  הפוך למנהל
</button>
</div>

      <h2 className="text-xl font-bold mb-4">מנהלים קיימים</h2>
      {managers.map(manager => (
        <ManagerCard key={manager.id} manager={manager} />
      ))}

      {toasts.length > 0 && toasts.map((toast) => (
        <ToastNotification
          key={toast.id}
          type={toast.type}
          className={toast.isHiding ? 'hide' : ''}
          message={toast.message}
          onClose={() => setToasts((prevToasts) => prevToasts.filter((t) => t.id !== toast.id))}
        />
      ))}
    </div>
  );
}
