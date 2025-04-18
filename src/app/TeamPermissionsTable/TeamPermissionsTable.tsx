'use client';

import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, updateDoc, arrayUnion, arrayRemove, where } from 'firebase/firestore';
import { useAuth } from '@/lib/firebase/AuthContext';
import { hasPermission } from '@/lib/permissions/hasPermission';
import { db } from '@/lib/firebase/firebase';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import { ToastNotification } from '@/components/ToastNotification';
import { useToast } from '@/hooks/useToast';

interface ExtendedWorker {
  id: string;
  name: string;
  role?: string;
  permissionOverrides?: {
    allow?: string[];
    deny?: string[];
  };
  [key: string]: any;
}

const TeamPermissionsTable = () => {
  const { user, detail } = useAuth();
  const {
    agents,
    selectedAgentId,
    setSelectedAgentId,
    handleAgentChange
  } = useFetchAgentData();

  const [loading, setLoading] = useState(true);
  const [workers, setWorkers] = useState<ExtendedWorker[]>([]);
  const [allPermissions, setAllPermissions] = useState<string[]>([]);
  const [rolePermissionsMap, setRolePermissionsMap] = useState<Record<string, string[]>>({});
  const [selectedAgentName, setSelectedAgentName] = useState('');
  const { toasts, addToast, setToasts } = useToast();

  const canEditPermissions = hasPermission({
    user,
    permission: 'edit_permissions',
    rolePermissions: ['*']
  });

  useEffect(() => {
    const fetchAllPermissions = async () => {
      const snapshot = await getDocs(collection(db, 'roles'));
      const permissionSet = new Set<string>();

      snapshot.forEach((doc) => {
        const data = doc.data();
        (data.permissions || []).forEach((perm: string) => permissionSet.add(perm));
      });

      setAllPermissions(Array.from(permissionSet).sort());
    };

    fetchAllPermissions();
  }, []);

  useEffect(() => {
    const fetchWorkersForAgent = async () => {
      if (!selectedAgentId && detail?.role !== 'admin') return;
      setLoading(true);

      const baseQuery = collection(db, 'users');
      const workersQuery = selectedAgentId && selectedAgentId !== 'all'
        ? query(baseQuery, where('agentId', '==', selectedAgentId), where('role', 'in', ['worker', 'agent']))
        : query(baseQuery, where('role', 'in', ['worker', 'agent']));

      try {
        const querySnapshot = await getDocs(workersQuery);
        const workersData: ExtendedWorker[] = [];

        querySnapshot.forEach(docSnap => {
          const data = docSnap.data();
          workersData.push({
            id: docSnap.id,
            name: data.name,
            role: data.role,
            permissionOverrides: data.permissionOverrides || {}
          });
        });

        setWorkers(workersData);
      } catch (error) {
        console.error('Failed to fetch workers:', error);
        setWorkers([]);
      } finally {
        setLoading(false);
      }
    };

    fetchWorkersForAgent();
  }, [selectedAgentId, detail?.role]);

  useEffect(() => {
    const fetchRolesForWorkers = async () => {
      const rolesSet = new Set<string>(workers.map((w) => w.role).filter((r): r is string => Boolean(r)));
      const permissionsMap: Record<string, string[]> = {};

      for (const role of rolesSet) {
        const roleDoc = await getDoc(doc(db, 'roles', role));
        if (roleDoc.exists()) {
          permissionsMap[role] = roleDoc.data().permissions || [];
        } else {
          permissionsMap[role] = [];
        }
      }

      if (!permissionsMap['admin']) {
        permissionsMap['admin'] = ['*'];
      }

      setRolePermissionsMap(permissionsMap);
    };

    if (workers.length) {
      fetchRolesForWorkers();
    }
  }, [workers]);

  useEffect(() => {
    const selected = agents.find(agent => agent.id === selectedAgentId);
    setSelectedAgentName(selected?.name || (selectedAgentId === 'all' ? 'כל הסוכנות' : ''));
  }, [selectedAgentId, agents]);

  const togglePermission = async (workerId: string, permission: string, has: boolean) => {
    const userRef = doc(db, 'users', workerId);
    const worker = workers.find(w => w.id === workerId);
    const rolePerms = rolePermissionsMap[worker?.role || ''] ?? [];
    const isInherited = rolePerms.includes(permission);

    const update: any = {};

    if (has) {
      if (!isInherited) {
        update[`permissionOverrides.allow`] = arrayRemove(permission);
      } else {
        update[`permissionOverrides.deny`] = arrayUnion(permission);
      }
    } else {
      if (!isInherited) {
        update[`permissionOverrides.allow`] = arrayUnion(permission);
        update[`permissionOverrides.deny`] = arrayRemove(permission);
      } else {
        update[`permissionOverrides.deny`] = arrayRemove(permission);
      }
    }

    try {
      await updateDoc(userRef, update);
      const refreshed = await getDoc(userRef);
      setWorkers(prev => prev.map(w => w.id === workerId ? {
        ...w,
        permissionOverrides: refreshed.data()?.permissionOverrides || {}
      } : w));

      addToast('success', 'העדכון בוצע בהצלחה');
    } catch (error) {
      console.error('שגיאה בעדכון הרשאה:', error);
      addToast('error', 'שגיאה בעדכון ההרשאה');
    }
  };

  if (loading) {
    return <div className="p-4">⏳ טוען נתוני עובדים...</div>;
  }

  return (
    <div className="p-4 overflow-auto">
      {!canEditPermissions && (
        <div className="mb-2 text-sm text-red-500">
          ⚠️ אין לך הרשאה לערוך הרשאות. ניתן רק לצפות.
        </div>
      )}

      <h2 className="text-xl font-bold mb-4">
        הרשאות עובדים של {detail?.role === 'admin' ? selectedAgentName || detail?.name : detail?.name}
      </h2>

      {detail?.role === 'admin' && (
        <div className="mb-4">
          <label className="mr-2 font-semibold">בחר סוכן:</label>
          <select onChange={handleAgentChange} value={selectedAgentId} className="select-input border px-2 py-1">
            <option value="">בחר סוכן</option>
            <option value="all">כל הסוכנות</option>
            {agents.map(agent => (
              <option key={agent.id} value={agent.id}>{agent.name}</option>
            ))}
          </select>
        </div>
      )}

      <table className="min-w-max border text-right">
        <thead>
          <tr className="bg-gray-100">
            <th className="border px-2 py-1">הרשאה</th>
            {workers.map((worker) => (
              <th key={worker.id} className="border px-2 py-1 whitespace-nowrap">
                {worker.name}<br />({worker.role || 'ללא תפקיד'})
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allPermissions.map((perm) => (
            <tr key={perm}>
              <td className="border px-2 py-1 font-semibold whitespace-nowrap">{perm}</td>
              {workers.map((worker) => {
                const rolePerms = rolePermissionsMap[worker.role || ''] ?? [];
                const has = hasPermission({
                  user: worker,
                  permission: perm,
                  rolePermissions: rolePerms
                });

                const isOverridden =
                  worker.permissionOverrides?.allow?.includes(perm) ||
                  worker.permissionOverrides?.deny?.includes(perm);

                return (
                  <td
                    key={worker.id + perm}
                    className={`border px-2 py-1 text-center ${canEditPermissions ? 'cursor-pointer hover:bg-blue-100' : 'text-gray-400 cursor-not-allowed'} ${isOverridden ? 'bg-yellow-100' : ''}`}
                    onClick={() => canEditPermissions && togglePermission(worker.id, perm, has)}
                    title={
                      canEditPermissions
                        ? `לחץ כדי ${has ? 'לבטל הרשאה' : 'לאפשר הרשאה'}`
                        : 'אין לך הרשאת עריכה'
                    }
                  >
                    {has ? '✅' : '❌'}{isOverridden && ' *'}{canEditPermissions && <span className="ml-1 text-gray-400">✏️</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {toasts.length > 0  && toasts.map((toast) => (
        <ToastNotification 
          key={toast.id}  
          type={toast.type}
          className={toast.isHiding ? "hide" : ""} 
          message={toast.message}
          onClose={() => setToasts((prevToasts) => prevToasts.filter((t) => t.id !== toast.id))}
        />
      ))}
    </div>
  );
};

export default TeamPermissionsTable;
