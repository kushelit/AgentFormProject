'use client';

import { useEffect, useState, useMemo } from 'react';
import { collection, doc, getDoc, getDocs, query, updateDoc, arrayUnion, arrayRemove, where } from 'firebase/firestore';
import { useAuth } from '@/lib/firebase/AuthContext';
import { hasPermission } from '@/lib/permissions/hasPermission';
import { db } from '@/lib/firebase/firebase';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import { ToastNotification } from '@/components/ToastNotification';
import { useToast } from '@/hooks/useToast';
import './TeamPermissionsTable.css';
import DialogNotification from "@/components/DialogNotification";
import type { UserDetail } from '@/lib/firebase/AuthContext';
import { PAID_PERMISSION_ADDONS, PaidPermission } from '@/utils/paidPermissions';
import type { MinimalUser } from '@/lib/permissions/hasPermission';


interface ExtendedWorker {
  id: string;
  uid: string;
  name: string;
  role: string;
  subscriptionId?: string;
  subscriptionType?: string;
  permissionOverrides?: {
    allow?: string[];
    deny?: string[];
  };
  [key: string]: any;
}

interface PermissionData {
  id: string;
  name: string;
  restricted?: boolean;
}


const TeamPermissionsTable = () => {
  const { user, detail } = useAuth();
  const { agents, selectedAgentId, setSelectedAgentId, handleAgentChange } = useFetchAgentData();
  const { toasts, addToast, setToasts } = useToast();

  const [loading, setLoading] = useState(true);
  const [workers, setWorkers] = useState<ExtendedWorker[]>([]);
  const [allPermissions, setAllPermissions] = useState<PermissionData[]>([]);
  const [restrictedPermissions, setRestrictedPermissions] = useState<string[]>([]);
  const [rolePermissionsMap, setRolePermissionsMap] = useState<Record<string, string[]>>({});
  const [selectedAgentName, setSelectedAgentName] = useState('');
  const [subscriptionPermissionsMap, setSubscriptionPermissionsMap] = useState<Record<string, string[]>>({});

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogData, setDialogData] = useState<{ workerId: string; permission: string; has: boolean } | null>(null);
 
  

const detailAsMinimalUser: MinimalUser | null = detail && user
? {
    uid: user.uid,
    role: detail.role,
    subscriptionId: detail.subscriptionId,
    subscriptionType: detail.subscriptionType,
    permissionOverrides: detail.permissionOverrides,
    addOns: detail.addOns,
  }
: null;

  
  useEffect(() => {
    const fetchSubscriptionPermissions = async () => {
      const snapshot = await getDocs(collection(db, 'subscriptions_permissions'));
      const result: Record<string, string[]> = {};
      snapshot.forEach((doc) => {
        const data = doc.data();
        result[doc.id] = data.permissions || [];
      });
      setSubscriptionPermissionsMap(result);
    };

    fetchSubscriptionPermissions();
  }, []);

  const rolePerms = rolePermissionsMap[detail?.role || ''] ?? [];

  const currentUser: MinimalUser = {
    uid: user?.uid || '',
    role: detail?.role || '',
    subscriptionId: detail?.subscriptionId,
    subscriptionType: detail?.subscriptionType,
    permissionOverrides: detail?.permissionOverrides,
    addOns: detail?.addOns,
  };
  
  const canEditPermissions = useMemo(() => {
    if (!rolePerms.length || !detail || !user?.uid) return null;
  
    const currentUser: MinimalUser = {
      uid: user.uid,
      role: detail.role,
      subscriptionId: detail.subscriptionId,
      subscriptionType: detail.subscriptionType,
      permissionOverrides: detail.permissionOverrides,
      addOns: detail.addOns,
    };
  
    return hasPermission({
      user: currentUser,
      permission: 'edit_permissions',
      rolePermissions: rolePerms,
      subscriptionPermissionsMap,
    });
  }, [detail, user?.uid, rolePerms, subscriptionPermissionsMap]);
  
  // const canTogglePermission = (permission: string, _worker: ExtendedWorker): boolean => {
  //   if (!canEditPermissions) return false;
  //   if (permission === '*') return false;
  //   if (restrictedPermissions.includes(permission) && detail?.role !== 'admin') return false;
  
  //   // רק המשתמש המחובר רלוונטי כאן
  //   const rolePerms = rolePermissionsMap[detail?.role || ''] ?? [];
  //   // const hasFromRole = rolePerms.includes(permission);
  //   const hasFromRole = rolePerms.includes('*') || rolePerms.includes(permission);

  //   const isSubscriber = !!detail?.subscriptionId && !!detail?.subscriptionType;
  
  //   const subscriptionPerms = isSubscriber && detail.subscriptionType
  //     ? subscriptionPermissionsMap[detail.subscriptionType] || []
  //     : [];
  
  //   const hasFromSubscription = subscriptionPerms.includes(permission);
  
  //   let hasAddon = false;

  //   if (permission in PAID_PERMISSION_ADDONS) {
  //     const addonKey = PAID_PERMISSION_ADDONS[permission as keyof typeof PAID_PERMISSION_ADDONS];
  //     hasAddon = !!detail?.addOns?.[addonKey];
  //   }
    
    
  //   // ✅ לוגיקה מיוחדת – רק אם מנוי ויש leadsModule => access_manageEnviorment
  //   if (
  //     isSubscriber &&
  //     detail?.addOns?.leadsModule &&
  //     (permission === 'access_manageEnviorment' || permission === 'access_flow')
  //   ) {
  //     hasAddon = true;
  //   }
    
  
  //   if (isSubscriber) {
  //     return (hasFromRole && hasFromSubscription) || hasAddon;
  //   }
  
  //   return hasFromRole || detail?.role === 'agent';
  // };
  
  
  const canTogglePermission = (permission: string, _worker: ExtendedWorker): boolean => {
    console.log('--- בדיקת canTogglePermission ---');
    console.log('🔒 permission:', permission);
    console.log('👤 current role:', detail?.role);
    console.log('🔐 canEditPermissions:', canEditPermissions);
  
    if (!canEditPermissions) {
      console.log('⛔ חסר הרשאת עריכה בסיסית');
      return false;
    }
  
    if (permission === '*') {
      console.log('⛔ לא ניתן לערוך הרשאת כוכבית');
      return false;
    }
  
    if (restrictedPermissions.includes(permission) && detail?.role !== 'admin') {
      console.log('⛔ ההרשאה מוגדרת כמוגבלת, ואת לא אדמין');
      return false;
    }
  
    const rolePerms = rolePermissionsMap[detail?.role || ''] ?? [];
    const hasFromRole = rolePerms.includes('*') || rolePerms.includes(permission);
    console.log('📦 rolePerms:', rolePerms);
    console.log('✅ hasFromRole:', hasFromRole);

    const hasExplicitAllow = detail?.permissionOverrides?.allow?.includes(permission) ?? false;
      console.log('🟢 hasExplicitAllow:', hasExplicitAllow);

  
    const isSubscriber = !!detail?.subscriptionId && !!detail?.subscriptionType;
    console.log('📄 isSubscriber:', isSubscriber);
    console.log('🧾 subscriptionType:', detail?.subscriptionType);
  
    const subscriptionPerms = isSubscriber && detail?.subscriptionType
      ? subscriptionPermissionsMap[detail.subscriptionType] || []
      : [];
  
    const hasFromSubscription = subscriptionPerms.includes(permission);
    console.log('🎫 subscriptionPerms:', subscriptionPerms);
    console.log('✅ hasFromSubscription:', hasFromSubscription);
  
    let hasAddon = false;
  
    if (permission in PAID_PERMISSION_ADDONS) {
      const addonKey = PAID_PERMISSION_ADDONS[permission as keyof typeof PAID_PERMISSION_ADDONS];
      hasAddon = !!detail?.addOns?.[addonKey];
      console.log('💎 addOn:', addonKey, '=>', hasAddon);
    }
  
    if (
      isSubscriber &&
      detail?.addOns?.leadsModule &&
      (permission === 'access_manageEnviorment' || permission === 'access_flow')
    ) {
      hasAddon = true;
      console.log('🎯 לוגיקה מיוחדת - leadsModule מוסיף את ההרשאה הזו');
    }
  
    if (isSubscriber) {
      const result = (hasFromRole && hasFromSubscription) || hasAddon;
      console.log('🔍 return:', result, '← לפי מנוי ותפקיד');
      return result;
    }
  
    const final = hasFromRole || ['agent', 'manager'].includes(detail?.role || '');
    console.log('🔍 return:', final, '← לפי תפקיד או override');
    return final;
    
  };
  

  useEffect(() => {
    const fetchAllPermissions = async () => {
      const rolesSnapshot = await getDocs(collection(db, 'roles'));
      const permsSnapshot = await getDocs(collection(db, 'permissions'));
      const permissionSet = new Set<string>();
      const restricted: string[] = [];
      const allPerms: PermissionData[] = [];

      permsSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.restricted) restricted.push(doc.id);
        allPerms.push({ id: doc.id, name: data.name || doc.id, restricted: data.restricted });
      });

      rolesSnapshot.forEach((doc) => {
        const data = doc.data();
        (data.permissions || []).forEach((perm: string) => {
          if (perm === '*' && detail?.role !== 'admin') return;
          permissionSet.add(perm);
        });
      });

      const filtered = allPerms.filter(p => permissionSet.has(p.id));
      const specialPermissionId = 'view_commissions_field';
      const normalPermissions = filtered.filter(p => p.id !== specialPermissionId);
      const specialPermission = filtered.find(p => p.id === specialPermissionId);

      const finalPermissions = specialPermission
        ? [...normalPermissions.sort((a, b) => a.name.localeCompare(b.name)), specialPermission]
        : normalPermissions.sort((a, b) => a.name.localeCompare(b.name));

      setAllPermissions(finalPermissions);
      setRestrictedPermissions(restricted);
    };

    fetchAllPermissions();
  }, [detail?.role]);

  useEffect(() => {
    const fetchWorkersForAgent = async () => {
      if (!selectedAgentId && detail?.role !== 'admin') return;
      setLoading(true);

      const baseQuery = collection(db, 'users');
      const isManager = detail?.role === 'manager';
      const isAgent = detail?.role === 'agent';
      const isWorker = detail?.role === 'worker';

      let workersQuery;
      if ((isAgent || isManager || isWorker) && selectedAgentId && selectedAgentId !== 'all') {
        workersQuery = query(baseQuery, where('agentId', '==', selectedAgentId));
      } else if (detail?.role === 'admin' && selectedAgentId && selectedAgentId !== 'all') {
        workersQuery = query(baseQuery, where('agentId', '==', selectedAgentId));
      } else {
        workersQuery = query(baseQuery, where('role', 'in', ['worker', 'agent', 'manager']));
      }

      try {
        const querySnapshot = await getDocs(workersQuery);
        const workersData: ExtendedWorker[] = [];

        querySnapshot.forEach(docSnap => {
          const data = docSnap.data();
          workersData.push({
            id: docSnap.id,
            uid: docSnap.id,
            name: data.name,
            role: data.role,
            isActive: data.isActive ?? true,
            subscriptionId: data.subscriptionId || '',
            subscriptionType: data.subscriptionType || '',
            permissionOverrides: data.permissionOverrides || {},
            addOns: data.addOns || {},
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
    const worker = workers.find(w => w.id === workerId);
    if (!worker) return;
  
    if (!canTogglePermission(permission, worker)) return;
  
    if (permission === 'view_commissions_field') {
      setDialogData({ workerId, permission, has });
      setDialogOpen(true);
      return;
    }
  
    await updatePermission(workerId, permission, has);
  };
  
  const updatePermission = async (workerId: string, permission: string, has: boolean) => {
    console.log('🔄 עדכון הרשאה:');
    const userRef = doc(db, 'users', workerId);
    const worker = workers.find(w => w.id === workerId);
    if (!worker) return;
  
    const canToggle = canTogglePermission(permission, worker);
    if (!canToggle) {
      addToast('error', 'אין לך הרשאה לערוך הרשאה זו');
      return;
    }
  
    const rolePerms = rolePermissionsMap[worker.role || ''] ?? [];

    const isInheritedFromRole = rolePerms.includes(permission);
    const isInheritedFromSubscriptionOrAddon = hasPermission({
      user: worker,
      permission,
      rolePermissions: rolePerms,
      subscriptionPermissionsMap,
    });

    const update: any = {};
    const isExplicitlyAllowed = worker.permissionOverrides?.allow?.includes(permission);

    if (!has) {
      // מוסיפים הרשאה
      if (!isInheritedFromRole && !isInheritedFromSubscriptionOrAddon) {
        console.log('➕ מוסיפה ל־allow');
        update['permissionOverrides.allow'] = arrayUnion(permission);
        update['permissionOverrides.deny'] = arrayRemove(permission);
      } else {
        console.log('🧹 רק מסירה מ־deny');
        update['permissionOverrides.deny'] = arrayRemove(permission);
      }
    } else {
      // מסירים הרשאה
      if (isExplicitlyAllowed) {
        console.log('➖ מסירה מ־allow בלבד');
        update['permissionOverrides.allow'] = arrayRemove(permission);
        update['permissionOverrides.deny'] = arrayRemove(permission); // ליתר ביטחון
      } else {
        console.log('⛔ חסימה עם deny');
        update['permissionOverrides.deny'] = arrayUnion(permission);
      }
    }
    
  
    try {
      await updateDoc(userRef, update);
      const refreshed = await getDoc(userRef);
      setWorkers(prev =>
        prev.map(w =>
          w.id === workerId
            ? {
                ...w,
                permissionOverrides: refreshed.data()?.permissionOverrides || {},
              }
            : w
        )
      );
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
      {canEditPermissions === false && (
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
    <tr key={perm.id} className={perm.id === 'view_commissions_field' ? 'special-permission-row' : ''}>
      <td className="border px-2 py-1 font-semibold whitespace-nowrap" title={perm.id}>
        {perm.name}
      </td>
      {workers.map((worker) => {
        const rolePerms = rolePermissionsMap[worker.role || ''] ?? [];
        const has = hasPermission({
          user: {
            uid: worker.uid,
            role: worker.role,
            subscriptionId: worker.subscriptionId,
            subscriptionType: worker.subscriptionType,
            permissionOverrides: worker.permissionOverrides,
            addOns: worker.addOns,
          },
          permission: perm.id,
          rolePermissions: rolePerms,
          subscriptionPermissionsMap,
        });        
        const isOverridden =
          worker.permissionOverrides?.allow?.includes(perm.id) ||
          worker.permissionOverrides?.deny?.includes(perm.id);

        const canToggle = canTogglePermission(perm.id, worker);

        return (
          <td
          key={worker.id + perm.id}
          className={`border px-2 py-1 text-center ${
            canToggle ? 'cursor-pointer hover:bg-blue-100' : 'text-gray-400 cursor-not-allowed'
          } ${isOverridden ? 'bg-yellow-100' : ''}`}
          onClick={() => {
            if (!canToggle) {
              const isPaid = perm.id in PAID_PERMISSION_ADDONS;
              const addonKey = isPaid ? PAID_PERMISSION_ADDONS[perm.id as PaidPermission] : null;
              const isMissingAddon = isPaid && addonKey && !detail?.addOns?.[addonKey];
        
              if (isMissingAddon) {
                addToast('error', 'על מנת לשנות הרשאה זו יש לרכוש את התוסף המתאים');
              }
        
              return;
            }
        
            togglePermission(worker.id, perm.id, has);
          }}
          title={
            !canToggle
              ? (() => {
                  const isPaid = perm.id in PAID_PERMISSION_ADDONS;
                  const addonKey = isPaid ? PAID_PERMISSION_ADDONS[perm.id as PaidPermission] : null;
                  const isMissingAddon = isPaid && addonKey && !detail?.addOns?.[addonKey];
        
                  return isMissingAddon
                    ? '⚠️ אין לך את התוסף המתאים לערוך הרשאה זו'
                    : 'אין לך הרשאה לערוך';
                })()
              : `לחץ כדי ${has ? 'לבטל הרשאה' : 'לאפשר הרשאה'}`
          }
        >
          {has ? '✅' : '❌'}
          {isOverridden && ' *'}
        </td>        
        );
      })}
    </tr>
  ))}
  <tr className="bg-gray-50 border-t-4 border-gray-400">
  <td className="border-t-4 border-gray-400 px-2 py-3 font-bold whitespace-nowrap text-center bg-white">
  סטטוס משתמש
  </td>
            {workers.map((worker) => {
              const canEdit = canEditPermissions;
              const toggleActiveStatus = async (workerId: string, currentStatus: boolean) => {
                try {
                  const newStatus = !currentStatus;
              
                  // 1. עדכון ב־Firestore
                  const userRef = doc(db, 'users', workerId);
                  await updateDoc(userRef, { isActive: newStatus });
              
                  // 2. עדכון ב־Firebase Auth דרך API
                  await fetch('/api/updateUserStatus', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ uid: workerId, disabled: !newStatus }),
                  });
              
                  // 3. עדכון ב־state מקומי
                  setWorkers(prev =>
                    prev.map(w => w.id === workerId ? { ...w, isActive: newStatus } : w)
                  );
              
                  addToast('success', 'סטטוס עודכן בהצלחה');
                } catch (err) {
                  console.error(err);
                  addToast('error', 'שגיאה בעדכון סטטוס');
                }
              };
              
  
              return (
                <td
                  key={worker.id + '-isActive'}
                  className={`border-t-4 border-gray-400 px-2 py-3 text-center font-semibold bg-white ${canEdit ? 'cursor-pointer hover:bg-blue-100' : 'text-gray-400 cursor-not-allowed'}`}
                  onClick={() => canEdit && toggleActiveStatus(worker.id, worker.isActive)}
                  title={canEdit ? 'לחץ לשינוי סטטוס פעיל' : 'אין הרשאה לעריכה'}
                >
                  {worker.isActive ? '🟢 פעיל' : '⛔ לא פעיל'}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
  
      {toasts.length > 0 && toasts.map((toast) => (
        <ToastNotification
          key={toast.id}
          type={toast.type}
          className={toast.isHiding ? "hide" : ""}
          message={toast.message}
          onClose={() => setToasts((prevToasts) => prevToasts.filter((t) => t.id !== toast.id))}
        />
      ))}
  
      {dialogOpen && dialogData && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <DialogNotification
            type="warning"
            title="אישור הרשאה רגישה"
            message={dialogData.has ? "האם את/ה בטוח/ה שברצונך להסיר את גישת צפייה בשדות עמלות?" : "הרשאת צפייה בשדות עמלות תאפשר צפייה בנתונים רגישים. האם לאשר?"}
            onConfirm={async () => {
              await updatePermission(dialogData.workerId, dialogData.permission, dialogData.has);
              setDialogOpen(false);
            }}
            onCancel={() => setDialogOpen(false)}
            confirmText="אשר"
            cancelText="ביטול"
          />
        </div>
      )}
    </div>
  );
  
};

export default TeamPermissionsTable;
