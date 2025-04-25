import { NextResponse } from 'next/server';
import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY as string);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userEmail, userName, message } = body;

    if (!message) {
      return NextResponse.json({ error: 'שדה ההודעה ריק' }, { status: 400 });
    }

    // if (!userEmail) {
    //   return NextResponse.json({ error: 'שדה האימייל ריק' }, { status: 400 });
    // }
    const msg = {
      to: "admin@magicsale.co.il",
      from: { email: "admin@magicsale.co.il", name: "MagicSale - פניות משתמשים" },
      ...(userEmail ? { replyTo: userEmail } : {}), // ✅ רק אם יש אימייל
      subject: `פנייה חדשה מאת ${userName || "משתמש לא ידוע"}`,
      text: `משתמש ${userName || "משתמש לא ידוע"} (${userEmail || "ללא אימייל"}) שלח הודעה:\n\n${message}`,
      html: `<p><strong>משתמש:</strong> ${userName || "משתמש לא ידוע"} (${userEmail || "ללא אימייל"})</p>
             <p><strong>תוכן הפנייה:</strong> ${message}</p>`,
    };

    await sgMail.send(msg);
    return NextResponse.json({ message: 'הפנייה נשלחה בהצלחה!' }, { status: 200 });

  } catch (error) {
    console.error('Error sending email:', error);
    return NextResponse.json({ error: 'שגיאה בשליחת המייל' }, { status: 500 });
  }
}
