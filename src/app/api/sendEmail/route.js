import { NextResponse } from 'next/server';
import sgMail from '@sendgrid/mail';
import { captureRejectionSymbol } from 'events';

// הוסיפי את מפתח ה-API שקיבלת מ-SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

//recovery sgMail KNFSCFQR593PYVD9N1RCZD6U

export async function POST(req) {
  try {
    const body = await req.json();
    const { to, subject, text, html } = body; // פרטי המייל
    console.log("body " + body)
    // ודא שכל השדות נשלחו
    if (!to || !subject || (!text && !html)) {
      return NextResponse.json(
        { error: 'Missing required fields: to, subject, and text or html' },
        { status: 400 }
      );
    }

    const msg = {
      to,
      from: 'magicSaleApp@gmail.com', 
      subject,
      text,
      html,
    };

    await sgMail.send(msg);
    return NextResponse.json({ message: 'Email sent successfully!' }, { status: 200 });
    captureRejectionSymbol.log("Email sent successfully!")

  } catch (error) {
    console.error('Error sending email:', error);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}
