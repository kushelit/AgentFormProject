// ═══════════════════════════════════════════════════════════════════
// app/api/nifraimFromLoadReport/route.ts
// הורדה ישירה של "דוח נפרעים מטעינות" (אותו generator של sendReport, בלי מייל).
// משמש את דף סיכום העמלות.
//
// GET ?agentId=...&dateBasis=ym|reportMonth&month=YYYY-MM&company=...&company=...
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { generateNifraimFromLoadReport } from '@/app/Reports/generators/generateNifraimFromLoadReport';
import { checkServerPermission } from '@/services/server/checkServerPermission';
import { getAuthUser, guardAgentAccess } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ROUTE = 'nifraimFromLoadReport';
const REQUIRED_PERMISSION = 'access_commission_import';

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const agentId = String(sp.get('agentId') || '').trim();
    const month = String(sp.get('month') || '').trim();
    const dateBasis = sp.get('dateBasis') === 'reportMonth' ? 'reportMonth' : 'ym';
    const company = sp.getAll('company').map((c) => c.trim()).filter(Boolean);

    const denied = await guardAgentAccess(req, agentId, ROUTE);
    if (denied) return denied;

    // ההרשאה נבדקת לפי המשתמש מהטוקן — לא לפי uid מהלקוח
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: 'נדרשת התחברות' }, { status: 401 });
    const ok = await checkServerPermission({ permission: REQUIRED_PERMISSION, uid: user.uid });
    if (!ok) return NextResponse.json({ error: 'אין לך הרשאה לדוח זה' }, { status: 403 });

    if (!agentId) return NextResponse.json({ error: 'נדרש לבחור סוכן' }, { status: 400 });
    if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: 'נדרש לבחור חודש' }, { status: 400 });

    const { buffer, filename } = await generateNifraimFromLoadReport({
      reportType: 'nifraimFromLoadReport',
      emailTo: '',
      agentId,
      dateBasis,
      month,
      company: company.length ? company : undefined,
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="nifraim-report.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    console.error(`[${ROUTE}]`, err);
    return NextResponse.json({ error: err?.message ?? 'server error' }, { status: 500 });
  }
}
