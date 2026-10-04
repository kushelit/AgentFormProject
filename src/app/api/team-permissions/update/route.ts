// app/api/team-permissions/update/route.ts
// Toggle one permission override for a user in the caller's tree (TeamPermissionsTable).
// The rules that were enforced only in the browser are enforced here; Firestore rules block
// browser writes to permissionOverrides (except admin).
//
// Allowed when:
//   • the caller has edit_permissions,
//   • the permission is not '*', not planLocked, and not restricted (restricted: admin only),
//   • the target is the caller, an agent the caller may access (group / agency),
//     or a worker of such an agent.
// Always enforced (not subject to API_AUTH_MODE log mode).

import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import { canAccessAgent, getAuthUser, isAdminUser } from '@/lib/server/auth';
import { hasPermission } from '@/lib/permissions/hasPermission';

const s = (v: unknown) => String(v ?? '').trim();

async function loadPermissionContext() {
  const db = admin.firestore();
  const [rolesSnap, plansSnap] = await Promise.all([
    db.collection('roles').get(),
    db.collection('subscriptions_permissions').get(),
  ]);
  const rolePermissionsMap: Record<string, string[]> = {};
  rolesSnap.forEach((d) => { rolePermissionsMap[d.id] = d.data()?.permissions || []; });
  const subscriptionPermissionsMap: Record<string, string[]> = {};
  plansSnap.forEach((d) => { subscriptionPermissionsMap[d.id] = d.data()?.permissions || []; });
  return { rolePermissionsMap, subscriptionPermissionsMap };
}

function asMinimalUser(uid: string, data: any, overrides?: any) {
  return {
    uid,
    role: s(data?.role),
    subscriptionId: data?.subscriptionId,
    subscriptionType: data?.subscriptionType,
    permissionOverrides: overrides ?? data?.permissionOverrides,
    addOns: data?.addOns,
  };
}

export async function POST(req: NextRequest) {
  const caller = await getAuthUser(req);
  if (!caller) return NextResponse.json({ error: 'נדרשת התחברות' }, { status: 401 });

  try {
    const body = await req.json().catch(() => null);
    const targetUid = s(body?.targetUid);
    const permission = s(body?.permission);
    if (!targetUid || targetUid.includes('/') || !permission || permission.includes('/')) {
      return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
    }
    if (permission === '*') return NextResponse.json({ error: 'אין אפשרות לשנות הרשאה זו' }, { status: 403 });

    const db = admin.firestore();
    const ctx = await loadPermissionContext();

    // 1) The caller may edit permissions at all.
    const callerCanEdit = hasPermission({
      user: asMinimalUser(caller.uid, caller.data),
      permission: 'edit_permissions',
      rolePermissions: ctx.rolePermissionsMap[caller.role] ?? [],
      subscriptionPermissionsMap: ctx.subscriptionPermissionsMap,
    });
    if (!callerCanEdit) return NextResponse.json({ error: 'אין לך הרשאה לערוך הרשאות' }, { status: 403 });

    // 2) The permission itself may be overridden by this caller.
    const permDoc = (await db.collection('permissions').doc(permission).get()).data();
    if (permDoc?.planLocked) return NextResponse.json({ error: 'הרשאה זו נעולה למסלול' }, { status: 403 });
    if (permDoc?.restricted && !isAdminUser(caller)) {
      return NextResponse.json({ error: 'רק אדמין יכול לשנות הרשאה זו' }, { status: 403 });
    }

    // 3) The target is in the caller's tree.
    const targetRef = db.collection('users').doc(targetUid);
    const target = (await targetRef.get()).data();
    if (!target) return NextResponse.json({ error: 'המשתמש לא נמצא' }, { status: 404 });
    const inTree =
      targetUid === caller.uid ||
      (await canAccessAgent(caller, targetUid)) ||
      (s(target.role) === 'worker' && (await canAccessAgent(caller, target.agentId)));
    if (!inTree) return NextResponse.json({ error: 'אין לך הרשאה לעדכן משתמש זה' }, { status: 403 });

    // 4) Same toggle logic as TeamPermissionsTable.updatePermission.
    const role = s(target.role);
    const rolePerms = ctx.rolePermissionsMap[role] ?? [];
    const isPlanBased = role === 'agent' || role === 'manager';
    const has = hasPermission({
      user: asMinimalUser(targetUid, target),
      permission,
      rolePermissions: rolePerms,
      subscriptionPermissionsMap: ctx.subscriptionPermissionsMap,
    });
    const hasFromRoleBase = !isPlanBased && (rolePerms.includes('*') || rolePerms.includes(permission));
    const hasFromPlanOrAddonBase = isPlanBased && hasPermission({
      user: asMinimalUser(targetUid, target, { allow: [], deny: [] }),
      permission,
      rolePermissions: rolePerms,
      subscriptionPermissionsMap: ctx.subscriptionPermissionsMap,
    });
    const isInheritedFromBase = hasFromRoleBase || hasFromPlanOrAddonBase;
    const isExplicitlyAllowed = (target.permissionOverrides?.allow || []).includes(permission);

    const { arrayUnion, arrayRemove } = admin.firestore.FieldValue;
    const update: Record<string, any> = {};
    if (!has) {
      if (!isInheritedFromBase) {
        update['permissionOverrides.allow'] = arrayUnion(permission);
        update['permissionOverrides.deny'] = arrayRemove(permission);
      } else {
        update['permissionOverrides.deny'] = arrayRemove(permission);
        update['permissionOverrides.allow'] = arrayRemove(permission);
      }
    } else if (isExplicitlyAllowed) {
      update['permissionOverrides.allow'] = arrayRemove(permission);
      update['permissionOverrides.deny'] = arrayRemove(permission);
    } else {
      update['permissionOverrides.deny'] = arrayUnion(permission);
    }

    await targetRef.update(update);
    const refreshed = (await targetRef.get()).data();
    return NextResponse.json({ ok: true, permissionOverrides: refreshed?.permissionOverrides || {} });
  } catch (e) {
    console.error('[team-permissions/update]', e);
    return NextResponse.json({ error: 'שגיאה בעדכון ההרשאה' }, { status: 500 });
  }
}
