// File: /app/api/sendCancelEmail/route.ts
import { NextRequest, NextResponse } from 'next/server';
import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);


export async function POST(req: NextRequest) {
  try {
    const { email, name , refunded} = await req.json();

    if (!email || !name) {
      return NextResponse.json({ error: 'Missing email or name' }, { status: 400 });
    }
    const refundMessage = refunded
    ? `<br>לאחר בדיקה אושרה החזרת תשלום בהתאם למדיניות הביטולים.`
    : ``;

    const msg = {
      to: email,
      from: {
        email: 'admin@magicsale.co.il',
        name: 'MagicSale'
      },
      subject: 'ביטול המנוי שלך במערכת MagicSale',
      html: `
        שלום ${name},<br><br>
        המנוי שלך במערכת MagicSale בוטל בהצלחה.${refundMessage}<br>
        אם זה נעשה בטעות או ברצונך לחדש את המנוי, אנא צרו קשר עם צוות התמיכה.<br><br>
        בברכה,<br>
        צוות MagicSale
      `
    };

    await sgMail.send(msg);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('❌ Error sending cancel email:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
