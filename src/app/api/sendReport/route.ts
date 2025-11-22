import { NextRequest, NextResponse } from 'next/server';
import { ReportRequest } from '@/types';
import { sendEmailWithAttachment } from '@/utils/email';

import { generateInsurancePremiumSummaryReport } from '@/app/Reports/generators/generateInsurancePremiumReport';
import { generateClientPoliciesReport } from '@/app/Reports/generators/generateClientPoliciesReport';
import { generateClientNifraimSummaryReport } from '@/app/Reports/generators/generateClientNifraimSummaryReport';
import { generateFinancialAccumulationReport } from '@/app/Reports/generators/generateFinancialAccumulationReport';
import { generateClientNifraimReportedVsMagic } from '@/app/Reports/generators/generateClientNifraimReportedVsMagic';
import { generateCommissionSummaryMultiYear } from '@/app/Reports/generators/generateCommissionSummaryMultiYear';


import { admin } from '@/lib/firebase/firebase-admin';
import { checkServerPermission } from '@/services/server/checkServerPermission';
export const runtime = 'nodejs';
export const maxDuration = 60;

const REPORTS_REQUIRING_ACCESS = new Set([
  'clientNifraimReportedVsMagic',
  'commissionSummaryMultiYear',
]);

const REQUIRED_PERMISSION = 'access_commission_import';


export async function POST(req: NextRequest) {
  try {
    const body: any = await req.json();
    let { reportType, emailTo, uid, userEmail } = body;

    if (!reportType) return NextResponse.json({ error: 'Missing reportType' }, { status: 400 });
    if (!emailTo)   return NextResponse.json({ error: 'Missing emailTo' }, { status: 400 });

    emailTo = String(emailTo).trim(); // ✅ ניקוי

    const isDev = process.env.NODE_ENV !== 'production';

    if (REPORTS_REQUIRING_ACCESS.has(reportType)) {
      if (isDev && !uid && !userEmail) {
        // console.warn('DEV: skipping permission check (no uid/email)');
      } else {
        const ok = await checkServerPermission({ permission: REQUIRED_PERMISSION, uid, userEmail });
        if (!ok) {
          return NextResponse.json(
            { error: 'אין לך הרשאה לדוח זה' },
            { status: 403 }
          );
        }
      }
    }

    let reportBuffer: Buffer;
    let filename = '';
    let subject = '';
    let description = '';

    switch (reportType) {
      case 'insurancePremiumReport':
        ({ buffer: reportBuffer, filename, subject, description } =
          await generateInsurancePremiumSummaryReport(body));
        break;
      case 'clientPoliciesReport':
        ({ buffer: reportBuffer, filename, subject, description } =
          await generateClientPoliciesReport(body));
        break;
      case 'clientNifraimSummaryReport':
        ({ buffer: reportBuffer, filename, subject, description } =
          await generateClientNifraimSummaryReport(body));
        break;
      case 'clientFinancialAccumulationReport':
        ({ buffer: reportBuffer, filename, subject, description } =
          await generateFinancialAccumulationReport(body));
        break;
      case 'clientNifraimReportedVsMagic':
        ({ buffer: reportBuffer, filename, subject, description } =
          await generateClientNifraimReportedVsMagic(body));
        break;
        case 'commissionSummaryMultiYear':
        ({ buffer: reportBuffer, filename, subject, description } =
          await generateCommissionSummaryMultiYear(body));
        break;
      default:
        return NextResponse.json({ error: 'Unsupported report type' }, { status: 400 });
    }

    await sendEmailWithAttachment({
      to: emailTo,
      subject,
      text: description,
      filename,
      fileBuffer: reportBuffer,
    });

    await admin.firestore().collection('reportLogs').add({
      reportType,
      emailTo,
      createdAt: new Date(),
      createdBy: uid || 'system',
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('sendReport error:', err);
  
    const message =
      err instanceof Error
        ? err.message
        : typeof err === 'string'
        ? err
        : 'Internal Server Error';
  
    return NextResponse.json({ error: message }, { status: 500 });
  }
  
}
