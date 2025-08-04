import { NextRequest, NextResponse } from 'next/server';
import { ReportRequest } from '@/types';
import { sendEmailWithAttachment } from '@/utils/email';

import { generateInsurancePremiumSummaryReport  } from '@/app/Reports/generators/generateInsurancePremiumReport';
import { generateClientPoliciesReport } from '@/app/Reports/generators/generateClientPoliciesReport';
import { generateClientNifraimSummaryReport } from '@/app/Reports/generators/generateClientNifraimSummaryReport';
import { generateFinancialAccumulationReport } from '@/app/Reports/generators/generateFinancialAccumulationReport';


import { admin } from '@/lib/firebase/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    const body: ReportRequest = await req.json();
    console.log('📥 Got body:', JSON.stringify(body, null, 2));

    const { reportType, emailTo, uid } = body;

    if (!reportType || !emailTo) {
      console.warn('⚠️ Missing fields:', { reportType, emailTo });
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    let reportBuffer: Buffer;
    let filename = '';
    let subject = '';
    let description = '';

    switch (reportType) {
      case 'insurancePremiumReport':
        console.log('📄 Generating insurancePremiumReport...');
        ({ buffer: reportBuffer, filename, subject, description } = await generateInsurancePremiumSummaryReport (body));
        console.log('✅ Report generated');
        break;
        
        case 'clientPoliciesReport':
          ({ buffer: reportBuffer, filename, subject, description } = await generateClientPoliciesReport(body));
          break;
      
          case 'clientNifraimSummaryReport':
            console.log('📊 Generating clientNifraimSummaryReport...');
            ({ buffer: reportBuffer, filename, subject, description } = await generateClientNifraimSummaryReport(body));
            console.log('✅ clientNifraimSummaryReport generated');
            break;
            case 'clientFinancialAccumulationReport':
              console.log('📊 Generating clientFinancialAccumulationReport...');
              ({ buffer: reportBuffer, filename, subject, description } = await generateFinancialAccumulationReport(body));
              console.log('✅ clientFinancialAccumulationReport generated');
              break;
            
      default:
        console.warn('⚠️ Unsupported report type:', reportType);
        return NextResponse.json({ error: 'Unsupported report type' }, { status: 400 });
    }

    console.log('📧 Sending email...');
    await sendEmailWithAttachment({
      to: emailTo,
      subject,
      text: description,
      filename,
      fileBuffer: reportBuffer,
    });
    console.log('📤 Email sent!');

    console.log('📝 Writing to Firestore...');
    await admin.firestore().collection('reportLogs').add({
      reportType,
      emailTo,
      createdAt: new Date(),
      createdBy: uid || 'system',
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('❌ Full error object:', error);

    if (error instanceof Error) {
      console.error('❌ Error generating or sending report:', error.message);
      console.error('🔎 Stack trace:', error.stack);
    } else {
      console.error('❌ Unknown non-Error object thrown:', JSON.stringify(error));
    }

    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
