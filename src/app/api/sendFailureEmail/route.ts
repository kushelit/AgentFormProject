// File: /app/api/sendFailureEmail/route.ts
import { NextRequest, NextResponse } from 'next/server';
import sgMail from '@sendgrid/mail';
import { admin } from '@/lib/firebase/firebase-admin';

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

export async function POST(req: NextRequest) {
  try {
    const { email, name } = await req.json();

    if (!email || !name) {
      return NextResponse.json({ error: 'Missing email or name' }, { status: 400 });
    }

    const msg = {
      to: email,
      from: {
        email: 'admin@magicsale.co.il',
        name: 'MagicSale',
      },
      subject: 'הודעה על כישלון בתשלום למערכת MagicSale',
      html: `
        שלום ${name},<br><br>
        ניסינו לחייב את אמצעי התשלום שלך עבור המנוי במערכת <strong>MagicSale</strong>, אך החיוב נכשל.<br>
        ייתכן שמדובר בפרטי כרטיס שגויים, אמצעי תשלום שפג תוקפו או בעיה זמנית מצד חברת האשראי.<br><br>
        כדי להמשיך ולהשתמש במערכת ללא הפרעה, אנא היכנס/י למערכת ועדכנ/י את אמצעי התשלום או צרו איתנו קשר לתמיכה.<br><br>
        <strong>שימי/שים לב:</strong> אם הנושא לא יטופל בזמן, ייתכן שניאלץ לבטל את המנוי ולהגביל את הגישה למערכת.<br><br>

        בברכה,<br>
        צוות MagicSale
      `,
    };

    await sgMail.send(msg);
    const db = admin.firestore();
await db.collection('emailLogs').add({
  to: email,
  subject: 'הודעה על כישלון בתשלום למערכת MagicSale',
  html: msg.html,
  meta: {
    type: 'payment-failure',
  },
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
});

    return NextResponse.json({ success: true });
  } catch (err) {
    // console.error('❌ Error sending failure email:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
