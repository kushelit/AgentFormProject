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
import { Link } from 'lucide-react';


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
  planLocked?: boolean;
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
 
  const isAgentOrManager = detail?.role === 'agent' || detail?.role === 'manager';

  const [planLockedPermissions, setPlanLockedPermissions] = useState<string[]>([]);

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
    if (!detail || !user?.uid) return null;
  
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
  
 
  
  const canTogglePermission = (permission: string, _worker: ExtendedWorker): boolean => {
    if (!canEditPermissions) return false;            // חייב יכולת עריכה כללית
    if (permission === '*') return false;   // אסור לגעת בכוכבית
     // ✅ חדש: אם ההרשאה נעולה למסלול - אף אחד לא יכול לעשות override
  if (planLockedPermissions.includes(permission)) return false;
    if (restrictedPermissions.includes(permission) && detail?.role !== 'admin') return false;
    return true;                                      // תני ל-override לעבוד
  };
  

  useEffect(() => {
    const fetchAllPermissions = async () => {
      const rolesSnapshot = await getDocs(collection(db, 'roles'));
      const permsSnapshot = await getDocs(collection(db, 'permissions'));
  
      // קטלוג permissions (label + restricted)
      const allPermsMap = new Map<string, PermissionData>();
      const restricted: string[] = [];
      const planLocked: string[] = [];

      permsSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const perm: PermissionData = {
          id: docSnap.id,
          name: data.name || docSnap.id,
          restricted: !!data.restricted,
          planLocked: !!data.planLocked,
        };
        allPermsMap.set(docSnap.id, perm);
        if (perm.restricted) restricted.push(docSnap.id);
        if (perm.planLocked) planLocked.push(docSnap.id);
      });
  
      // ===== אדמין רואה הכל =====
      if (detail?.role === 'admin') {
        const displayIds = new Set<string>();
  
        // 1) כל מה שבקטלוג permissions
        allPermsMap.forEach((_, id) => displayIds.add(id));
  
        // 2) כל מה שמופיע ב-roles (למעט '*')
        rolesSnapshot.forEach((roleDoc) => {
          (roleDoc.data().permissions || []).forEach((p: string) => {
            if (p !== '*') displayIds.add(p);
          });
        });
  
        // 3) כל מה שמופיע בכל המסלולים
        Object.values(subscriptionPermissionsMap).forEach((arr) => {
          (arr || []).forEach((p) => displayIds.add(p));
        });
  
        // 4) כל הרשאות ה-Add-ons
        Object.keys(PAID_PERMISSION_ADDONS).forEach((p) => displayIds.add(p));
  
        const specialPermissionId = 'view_commissions_field';
        const list: PermissionData[] = [];
        displayIds.forEach((id) => list.push(allPermsMap.get(id) ?? { id, name: id }));
  
        const normal = list
          .filter((p) => p.id !== specialPermissionId)
          .sort((a, b) => a.name.localeCompare(b.name));
        const special = list.find((p) => p.id === specialPermissionId);
        const finalPermissions = special ? [...normal, special] : normal;
  
        setAllPermissions(finalPermissions);
        setRestrictedPermissions(restricted);
        setPlanLockedPermissions(planLocked);
        return;
      }
  
      // ===== לא-אדמין (agent/manager/worker) =====
      const relevantPlans = new Set<string>();
  
      if (detail?.subscriptionType) relevantPlans.add(detail.subscriptionType);
      workers.forEach((w) => {
        if (w.subscriptionType) relevantPlans.add(w.subscriptionType);
      });
  
      const displayIds = new Set<string>();
      relevantPlans.forEach((plan) => {
        (subscriptionPermissionsMap[plan] || []).forEach((permId) => displayIds.add(permId));
      });
  
      // ✅ הוספת הרשאות שקיבלתי ב-ALLOW, רק אם לא מוגדרות כ-restricted
      // (אם תרצי להגביל רק ל-agent/manager, עטפי ב-if על detail.role)
      const myAllows = (detail?.permissionOverrides?.allow || []).filter(
        (p) => !restricted.includes(p)
      );
      myAllows.forEach((p) => displayIds.add(p));
  
      // Add-ons להצגה תמיד (גם לשדרוג)
      Object.keys(PAID_PERMISSION_ADDONS).forEach((permId) => displayIds.add(permId));
  
      const specialPermissionId = 'view_commissions_field';
      const list: PermissionData[] = [];
      displayIds.forEach((id) => list.push(allPermsMap.get(id) ?? { id, name: id }));
  
      const normal = list
        .filter((p) => p.id !== specialPermissionId)
        .sort((a, b) => a.name.localeCompare(b.name));
      const special = list.find((p) => p.id === specialPermissionId);
      const finalPermissions = special ? [...normal, special] : normal;
  
      setAllPermissions(finalPermissions);
      setRestrictedPermissions(restricted);
      setPlanLockedPermissions(planLocked);
    };
  
    fetchAllPermissions();
  }, [detail?.role, detail?.subscriptionType, workers, subscriptionPermissionsMap]);
  

  // useEffect(() => {
  //   const fetchWorkersForAgent = async () => {
  //     if (!selectedAgentId && detail?.role !== 'admin') return;
  //     setLoading(true);
  
  //     const baseRef = collection(db, 'users');
  //     const isManager = detail?.role === 'manager';
  //     const isAgent = detail?.role === 'agent';
  //     const isWorker = detail?.role === 'worker';
  
  //     // עזר: חלוקה למנות (מגבלת in של Firestore עד 10 פריטים)
  //     const chunk = <T,>(arr: T[], size: number) =>
  //       Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
  //         arr.slice(i * size, i * size + size)
  //       );
  
  //     try {
  //       let workersData: ExtendedWorker[] = [];
  
  //       if (detail?.role === 'admin') {
  //         // שליפת ה-agencies (string) של האדמין
  //         const adminDoc = await getDoc(doc(db, 'users', user!.uid));
  //         const adminAgency: string | undefined = adminDoc.exists()
  //           ? (adminDoc.data() as any)?.agencies
  //           : undefined;
  
  //         if (!adminAgency) {
  //           setWorkers([]);
  //           setLoading(false);
  //           return;
  //         }
  
  //         if (selectedAgentId && selectedAgentId !== 'all') {
  //           // וידוא שה-agent/manager הנבחר הוא מאותה סוכנות
  //           const agentDoc = await getDoc(doc(db, 'users', selectedAgentId));
  //           const agentOk =
  //             agentDoc.exists() &&
  //             ['agent', 'manager'].includes((agentDoc.data() as any)?.role) &&
  //             (agentDoc.data() as any)?.agencies === adminAgency;
  
  //           if (!agentOk) {
  //             setWorkers([]);
  //             setLoading(false);
  //             return;
  //           }
  
  //           // כל המשתמשים תחת agentId הזה (הסוכן/מנג’ר עצמו + עובדים שלו)
  //           const qs = await getDocs(query(baseRef, where('agentId', '==', selectedAgentId)));
  //           workersData = qs.docs.map((d) => {
  //             const data = d.data() as any;
  //             return {
  //               id: d.id,
  //               uid: d.id,
  //               name: data.name,
  //               role: data.role,
  //               isActive: data.isActive ?? true,
  //               subscriptionId: data.subscriptionId || '',
  //               subscriptionType: data.subscriptionType || '',
  //               permissionOverrides: data.permissionOverrides || {},
  //               addOns: data.addOns || {},
  //             };
  //           });
  //         } else {
  //           // "כל הסוכנות": קודם מביאים את כל ה-agent/manager של adminAgency
  //           const agentsSnap = await getDocs(
  //             query(
  //               baseRef,
  //               where('role', 'in', ['agent', 'manager']),
  //               where('agencies', '==', adminAgency) // ייתכן ותידרש אינדקסה מרוכבת
  //             )
  //           );
  
  //           const agentDocs = agentsSnap.docs.filter((d) => (d.data() as any).isActive !== false);
  //           const allowedAgentIds = agentDocs.map((d) => d.id);
  
  //           // מוסיפים לרשימה גם את הסוכנים/מנהלים עצמם
  //           workersData.push(
  //             ...agentDocs.map((d) => {
  //               const data = d.data() as any;
  //               return {
  //                 id: d.id,
  //                 uid: d.id,
  //                 name: data.name,
  //                 role: data.role,
  //                 isActive: data.isActive ?? true,
  //                 subscriptionId: data.subscriptionId || '',
  //                 subscriptionType: data.subscriptionType || '',
  //                 permissionOverrides: data.permissionOverrides || {},
  //                 addOns: data.addOns || {},
  //               } as ExtendedWorker;
  //             })
  //           );
  
  //           // עכשיו מביאים את ה-workers לפי agentId במנות של 10
  //           for (const batch of chunk(allowedAgentIds, 10)) {
  //             const wsnap = await getDocs(
  //               query(baseRef, where('role', '==', 'worker'), where('agentId', 'in', batch))
  //             );
  //             wsnap.forEach((docSnap) => {
  //               const data = docSnap.data() as any;
  //               if (data.isActive === false) return;
  //               workersData.push({
  //                 id: docSnap.id,
  //                 uid: docSnap.id,
  //                 name: data.name,
  //                 role: data.role,
  //                 isActive: data.isActive ?? true,
  //                 subscriptionId: data.subscriptionId || '',
  //                 subscriptionType: data.subscriptionType || '',
  //                 permissionOverrides: data.permissionOverrides || {},
  //                 addOns: data.addOns || {},
  //               });
  //             });
  //           }
  //         }
  //       } else {
  //         // לא-אדמין: לוגיקה קיימת
  //         let workersQuery: any;
  //         if ((isAgent || isManager || isWorker) && selectedAgentId && selectedAgentId !== 'all') {
  //           workersQuery = query(baseRef, where('agentId', '==', selectedAgentId));
  //         } else {
  //           workersQuery = query(baseRef, where('role', 'in', ['worker', 'agent', 'manager']));
  //         }
  
  //         const qs = await getDocs(workersQuery);
  //         workersData = qs.docs.map((docSnap) => {
  //           const data = docSnap.data() as any;
  //           return {
  //             id: docSnap.id,
  //             uid: docSnap.id,
  //             name: data.name,
  //             role: data.role,
  //             isActive: data.isActive ?? true,
  //             subscriptionId: data.subscriptionId || '',
  //             subscriptionType: data.subscriptionType || '',
  //             permissionOverrides: data.permissionOverrides || {},
  //             addOns: data.addOns || {},
  //           };
  //         });
  //       }
  
  //       setWorkers(workersData);
  //     } catch (error) {
  //       // console.error('Failed to fetch workers:', error);
  //       setWorkers([]);
  //     } finally {
  //       setLoading(false);
  //     }
  //   };
  
  //   fetchWorkersForAgent();
  // }, [selectedAgentId, detail?.role, user?.uid]);


  useEffect(() => {
    const fetchWorkersForAgent = async () => {
      if (!selectedAgentId && detail?.role !== 'admin') return;
      setLoading(true);
  
      const baseRef = collection(db, 'users');
      const isManager = detail?.role === 'manager';
      const isAgent = detail?.role === 'agent';
      const isWorker = detail?.role === 'worker';
  
      const chunk = <T,>(arr: T[], size: number) =>
        Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
          arr.slice(i * size, i * size + size)
        );
  
      try {
        let workersData: ExtendedWorker[] = [];
  
        if (detail?.role === 'admin') {
          // ✅ חדש: isSystem מדלג על הגבלת ה-agency, בדיוק כמו ב-useFetchAgentData
          const isSystem = detail?.isSystem === true;

          // שליפת ה-agencies (string) של האדמין - לא נדרש אם isSystem
          const adminDoc = await getDoc(doc(db, 'users', user!.uid));
          const adminAgency: string | undefined = adminDoc.exists()
            ? (adminDoc.data() as any)?.agencies
            : undefined;
  
          if (!isSystem && !adminAgency) {
            setWorkers([]);
            setLoading(false);
            return;
          }
  
          if (selectedAgentId && selectedAgentId !== 'all') {
            // וידוא שה-agent/manager הנבחר הוא מאותה סוכנות - אלא אם isSystem
            const agentDoc = await getDoc(doc(db, 'users', selectedAgentId));
            const agentOk =
              agentDoc.exists() &&
              ['agent', 'manager'].includes((agentDoc.data() as any)?.role) &&
              (isSystem || (agentDoc.data() as any)?.agencies === adminAgency);
  
            if (!agentOk) {
              setWorkers([]);
              setLoading(false);
              return;
            }
  
            // כל המשתמשים תחת agentId הזה (הסוכן/מנג'ר עצמו + עובדים שלו)
            const qs = await getDocs(query(baseRef, where('agentId', '==', selectedAgentId)));
            workersData = qs.docs.map((d) => {
              const data = d.data() as any;
              return {
                id: d.id,
                uid: d.id,
                name: data.name,
                role: data.role,
                isActive: data.isActive ?? true,
                subscriptionId: data.subscriptionId || '',
                subscriptionType: data.subscriptionType || '',
                permissionOverrides: data.permissionOverrides || {},
                addOns: data.addOns || {},
              };
            });
          } else {
            // "כל הסוכנות": אם isSystem - כל ה-agent/manager בלי סינון agencies
            const agentsSnap = await getDocs(
              isSystem
                ? query(baseRef, where('role', 'in', ['agent', 'manager']))
                : query(
                    baseRef,
                    where('role', 'in', ['agent', 'manager']),
                    where('agencies', '==', adminAgency)
                  )
            );
  
            const agentDocs = agentsSnap.docs.filter((d) => (d.data() as any).isActive !== false);
            const allowedAgentIds = agentDocs.map((d) => d.id);
  
            workersData.push(
              ...agentDocs.map((d) => {
                const data = d.data() as any;
                return {
                  id: d.id,
                  uid: d.id,
                  name: data.name,
                  role: data.role,
                  isActive: data.isActive ?? true,
                  subscriptionId: data.subscriptionId || '',
                  subscriptionType: data.subscriptionType || '',
                  permissionOverrides: data.permissionOverrides || {},
                  addOns: data.addOns || {},
                } as ExtendedWorker;
              })
            );
  
            for (const batch of chunk(allowedAgentIds, 10)) {
              const wsnap = await getDocs(
                query(baseRef, where('role', '==', 'worker'), where('agentId', 'in', batch))
              );
              wsnap.forEach((docSnap) => {
                const data = docSnap.data() as any;
                if (data.isActive === false) return;
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
            }
          }
        } else {
          // לא-אדמין: ללא שינוי
          let workersQuery: any;
          if ((isAgent || isManager || isWorker) && selectedAgentId && selectedAgentId !== 'all') {
            workersQuery = query(baseRef, where('agentId', '==', selectedAgentId));
          } else {
            workersQuery = query(baseRef, where('role', 'in', ['worker', 'agent', 'manager']));
          }
  
          const qs = await getDocs(workersQuery);
          workersData = qs.docs.map((docSnap) => {
            const data = docSnap.data() as any;
            return {
              id: docSnap.id,
              uid: docSnap.id,
              name: data.name,
              role: data.role,
              isActive: data.isActive ?? true,
              subscriptionId: data.subscriptionId || '',
              subscriptionType: data.subscriptionType || '',
              permissionOverrides: data.permissionOverrides || {},
              addOns: data.addOns || {},
            };
          });
        }
  
        setWorkers(workersData);
      } catch (error) {
        setWorkers([]);
      } finally {
        setLoading(false);
      }
    };
  
    fetchWorkersForAgent();
  }, [selectedAgentId, detail?.role, user?.uid, detail?.isSystem]);
  
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
    // לסוכן – לבחור את עצמו כברירת מחדל
    if (detail?.role === 'agent' && user?.uid && !selectedAgentId) {
      setSelectedAgentId(user.uid);
    }
  
    // למנהל – אם יש בדיוק סוכן אחד זמין, לבחור אותו אוטומטית
    if (detail?.role === 'manager' && agents.length === 1 && !selectedAgentId) {
      setSelectedAgentId(agents[0].id);
    }
  }, [detail?.role, user?.uid, agents, selectedAgentId, setSelectedAgentId]);
  


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
    // console.log('🔄 עדכון הרשאה:');
    const userRef = doc(db, 'users', workerId);
    const worker = workers.find(w => w.id === workerId);
    if (!worker) return;
  
    const canToggle = canTogglePermission(permission, worker);
    if (!canToggle) {
      addToast('error', 'אין לך הרשאה לערוך הרשאה זו');
      return;
    }
  
    const rolePerms = rolePermissionsMap[worker.role || ''] ?? [];
  
    // AGENT/MANAGER = plan-based (ללא ירושה מ-role)
    const isPlanBased = (worker.role === 'agent' || worker.role === 'manager');
  
    // 🔎 בודקים ירושה בסיסית *בלי* overrides (כדי לא ליפול ל"מצב שלישי")
    const baseUser = {
      ...worker,
      permissionOverrides: { allow: [], deny: [] }, // מנקים overrides לבדיקה
    };
  
    // ירושה מ-role (רק ללא plan-based)
    const hasFromRoleBase = !isPlanBased && (rolePerms.includes('*') || rolePerms.includes(permission));
  
    // ירושה ממסלול/תוסף (רק ל-plan-based)
    const hasFromPlanOrAddonBase = isPlanBased ? hasPermission({
      user: baseUser,
      permission,
      rolePermissions: rolePerms, // לא רלוונטי ל-plan-based, אבל נשאיר חתימה אחידה
      subscriptionPermissionsMap,
    }) : false;
  
    const isInheritedFromBase = hasFromRoleBase || hasFromPlanOrAddonBase;
  
    const update: any = {};
    const isExplicitlyAllowed = worker.permissionOverrides?.allow?.includes(permission);
  
    if (!has) {
      // המשתמש כרגע *לא* מחזיק בהרשאה → נלחץ כדי להוסיף
      if (!isInheritedFromBase) {
        // אין מקור בסיס → צריך ALLOW מפורש
        // console.log('➕ מוסיפה ל־allow (אין מקור בסיס)');
        update['permissionOverrides.allow'] = arrayUnion(permission);
        update['permissionOverrides.deny'] = arrayRemove(permission);
      } else {
        // יש מקור בסיס (מסלול/תוסף/role) → מספיק להסיר DENY
        // console.log('🧹 הסרת deny בלבד (יש מקור בסיס)');
        update['permissionOverrides.deny'] = arrayRemove(permission);
        // ניקוי מיותר: אם בטעות נשאר ALLOW היסטורי, ננקה (כי יש ירושה בסיסית)
        update['permissionOverrides.allow'] = arrayRemove(permission);
      }
    } else {
      // המשתמש כרגע *כן* מחזיק בהרשאה → נלחץ כדי להסיר
      if (isExplicitlyAllowed) {
        // console.log('➖ מסירה מ־allow (הייתה מפורשת)');
        update['permissionOverrides.allow'] = arrayRemove(permission);
        update['permissionOverrides.deny'] = arrayRemove(permission); // ניקוי ביטחון
      } else {
        // console.log('⛔ מוסיפה ל־deny (חוסם מעל הבסיס)');
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
      // console.error('שגיאה בעדכון הרשאה:', error);
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
      {(detail?.role === 'admin' || detail?.role === 'manager') && (
  <div className="mb-4">
    <label className="mr-2 font-semibold">בחר סוכן:</label>
    <select
      onChange={handleAgentChange}
      value={selectedAgentId}
      className="select-input border px-2 py-1"
    >
      <option value="">בחר סוכן</option>

      {/* רק לאדמין יש "כל הסוכנות" */}
      {detail?.role === 'admin' && <option value="all">כל הסוכנות</option>}

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
              // 🔒 קודם כל: נעול למסלול
              if (planLockedPermissions.includes(perm.id)) {
                addToast('error', 'הרשאה זו נקבעת לפי סוג מנוי בלבד (לא ניתנת לשינוי ידני)');
                return;
              }
        
              // 💳 בדיקת תוסף בתשלום
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
              ? planLockedPermissions.includes(perm.id)
                ? '🔒 הרשאה זו נקבעת לפי סוג מנוי בלבד (לא ניתנת לשינוי ידני)'
                : (() => {
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
              const toggleActiveStatus = async (
                workerId: string,
                currentStatus: boolean,
                workerAgentId?: string
              ) => {
                try {
                  const newStatus = !currentStatus;
              
                  // ✅ 1. מביאים Firebase ID Token של המשתמש המחובר
                  const token = await user?.getIdToken();
                  if (!token) {
                    addToast('error', 'לא ניתן לאמת משתמש');
                    return;
                  }
              
                  // ✅ 2. קריאה אחת ל־API המאובטח
                  const res = await fetch('/api/setWorkerActive', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${token}`, // ⭐ זה החלק החשוב
                    },
                    body: JSON.stringify({
                      uid: workerId,
                      isActive: newStatus,
                      agentId: selectedAgentId || workerAgentId,
                    }),
                  });
              
                  const data = await res.json();
              
                  if (!res.ok) {
                    addToast('error', data.error || 'שגיאה בעדכון סטטוס');
                    return;
                  }
              
                  // ✅ 3. עדכון state מקומי
                  setWorkers(prev =>
                    prev.map(w => (w.id === workerId ? { ...w, isActive: newStatus } : w))
                  );
              
                  addToast('success', 'סטטוס עודכן בהצלחה');
                } catch (err) {
                  addToast('error', 'שגיאה בעדכון סטטוס');
                }
              };
              
              const isWorkerRow = worker.role === 'worker';
              const canToggleStatus = Boolean(canEdit) && isWorkerRow;

              return (
               <td
  key={worker.id + '-isActive'}
  className={`border-t-4 border-gray-400 px-2 py-3 text-center font-semibold bg-white ${
    canToggleStatus ? 'cursor-pointer hover:bg-blue-100' : 'text-gray-400 cursor-not-allowed'
  }`}
  onClick={() => {
    if (!canToggleStatus) return;
    toggleActiveStatus(worker.id, worker.isActive, worker.agentId); // נוסיף agentId
  }}
  title={
    !isWorkerRow
      ? 'לא משנים סטטוס לסוכן/מנהל כאן'
      : canToggleStatus
      ? 'לחץ לשינוי סטטוס פעיל'
      : 'אין הרשאה לעריכה'
  }
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
      {isAgentOrManager && (
 <a
 href={`/auth/sign-up/${user?.uid}`}
 style={{
   display: 'inline-block',
   marginTop: '2rem', // ריווח מעל הטבלה
   backgroundColor: '#3b82f6', // כחול רך (Tailwind: blue-500)
   color: '#ffffff',
   padding: '10px 20px',
   borderRadius: '999px', // כפתור עגול ואלגנטי
   textDecoration: 'none',
   fontWeight: 500,
   fontSize: '1rem',
   boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
   transition: 'background-color 0.3s ease'
 }}
 onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')} // כחול מעט כהה
 onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#3b82f6')}
>
 ➕ צור עובד חדש
</a>

)}
    </div>
  );
  
};

export default TeamPermissionsTable;
