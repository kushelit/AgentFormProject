import { NextRequest, NextResponse } from 'next/server';
import { ReportRequest } from '@/app/Reports/types';
import { sendEmailWithAttachment } from '@/utils/email';

import { generateClientPremiumReport } from '@/app/Reports/generators/generateClientPremiumReport';




export async function POST(req: NextRequest) {
  try {
    const body: ReportRequest = await req.json();
    const { reportType, emailTo } = body;

    if (!reportType || !emailTo) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    let reportBuffer: Buffer;
    let filename = '';
    let subject = '';
    let description = '';

    switch (reportType) {
      case 'clientPremiumSummary':
        ({ buffer: reportBuffer, filename, subject, description } = await generateClientPremiumReport(body));
        break;

      // בעתיד:
      // case 'agentSalesReport':
      //   ({ buffer, filename, ... } = await generateAgentSalesReport(body));
      //   break;

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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error generating or sending report:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
