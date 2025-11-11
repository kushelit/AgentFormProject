// services/server/checkServerPermission.ts
import { admin } from '@/lib/firebase/firebase-admin';
import { hasPermission } from '@/lib/permissions/hasPermission'; // אותו קובץ מהקליינט – קוד טהור, רץ גם בשרת

type FullUser = {
  uid: string;
  role: string;
  subscriptionId?: string;
  subscriptionType?: string;
  permissionOverrides?: { allow?: string[]; deny?: string[] };
  addOns?: Record<string, any>;
  email?: string;
};

async function loadUserByUidOrEmail(uid?: string, email?: string): Promise<FullUser | null> {
  const db = admin.firestore();

  // 1) לפי UID
  if (uid) {
    const snap = await db.collection('users').doc(uid).get();
    if (snap.exists) return { uid, ...(snap.data() as any) };
  }

  // 2) Fallback לפי אימייל (במקרה של חוסר תאום פרויקטים)
  if (email) {
    const q = await db.collection('users').where('email', '==', String(email).trim()).limit(1).get();
    if (!q.empty) {
      const doc = q.docs[0];
      return { uid: doc.id, ...(doc.data() as any) };
    }
  }

  return null;
}

async function loadSubscriptionsPermissionsMap(): Promise<Record<string, string[]>> {
  const db = admin.firestore();
  const snap = await db.collection('subscriptions_permissions').get();
  const out: Record<string, string[]> = {};
  snap.forEach(d => { out[d.id] = (d.data() as any)?.permissions || []; });
  return out;
}

async function loadRolePermissions(role?: string): Promise<string[]> {
  // אם אצלך rolePermissions מגיע מה־AuthContext ולא קיים בקולקשן—נחזיר ריק, וזה תואם ללוגיקה:
  // agent/manager לא תלויים בזה בכלל.
  if (!role) return [];
  const db = admin.firestore();
  // אם יש לך קולקשן של הרשאות תפקיד (לא חובה):
  // למשל: roles_permissions/{role} => { permissions: [...] }
  const doc = await db.collection('roles_permissions').doc(role).get().catch(() => null);
  const arr = doc?.exists ? ((doc.data() as any)?.permissions || []) : [];
  return Array.isArray(arr) ? arr : [];
}

/** בדיקה שרתית תואמת usePermission(permission) */
export async function checkServerPermission({
  permission,
  uid,
  userEmail,
}: {
  permission: string;
  uid?: string;
  userEmail?: string;
}): Promise<boolean> {
  const user = await loadUserByUidOrEmail(uid, userEmail);
  if (!user) return false;

  // אדמין תמיד מותר — זהה ל-hasPermission
  if (user.role === 'admin') return true;

  // Agent/Manager → מבוסס מסלול; אחרים → לפי rolePermissions
  const isPlanBased = user.role === 'agent' || user.role === 'manager';

  const [subscriptionPermissionsMap, rolePermissions] = await Promise.all([
    loadSubscriptionsPermissionsMap(),
    isPlanBased ? Promise.resolve<string[]>([]) : loadRolePermissions(user.role),
  ]);

  return hasPermission({
    user: {
      uid: user.uid,
      role: user.role as any,
      subscriptionId: user.subscriptionId,
      subscriptionType: user.subscriptionType,
      permissionOverrides: user.permissionOverrides,
      addOns: user.addOns,
    },
    permission,
    rolePermissions,
    subscriptionPermissionsMap,
  });
}
