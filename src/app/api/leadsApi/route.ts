// /app/api/leadsApi/route.ts  ✅ SERVER ONLY
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import { saveRequestLogToDB } from '@/utils/saveRequestLogToDB';
import { sendAppEmail } from '@/lib/server/sendAppEmail';

// שליחת מייל ישירות מהשרת (לא דרך /api/sendEmail, שמוגן לאדמין)
const sendEmail = (to: string, subject: string, text: string, html: string) =>
  sendAppEmail({ to, subject, text, html });

const normalizeBoolean = (value: any): boolean =>
  value === true || value === 'true' || value === 1;

const sanitizeString = (value: string): string =>
  value.replace(/["]/g, '').trim();

export async function POST(req: NextRequest) {
  const db = admin.firestore();

  try {
    // 🔐 API key
    const apiKey = req.headers.get('authorization')?.split('Bearer ')[1];
    if (!apiKey || apiKey !== process.env.API_SECRET_KEY) {
      await saveRequestLogToDB({
        id: 'N/A',
        status: 'failure',
        message: 'Unauthorized: Invalid API Key',
        timestamp: new Date().toISOString(),
      });
      return NextResponse.json({ error: 'Unauthorized: Invalid API Key' }, { status: 403 });
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { id, consentForInformationRequest, ...leadData } = body;

    // 🧼 ניקוי שדות מחרוזת
    Object.keys(leadData).forEach((key) => {
      if (typeof leadData[key] === 'string') leadData[key] = sanitizeString(leadData[key]);
    });

    const normalizedConsent =
      consentForInformationRequest !== undefined
        ? normalizeBoolean(consentForInformationRequest)
        : false;

    // ----- עדכון ליד קיים -----
    if (id) {
      const leadRef = db.collection('leads').doc(id);
      const leadDoc = await leadRef.get();
      if (!leadDoc.exists) {
        return NextResponse.json({ error: `Lead with id ${id} not found` }, { status: 404 });
      }

      const updateData: Record<string, any> = { ...leadData };
      updateData.consentForInformationRequest = normalizedConsent;

      await leadRef.update(updateData);

      // שליחת מייל לסוכן, אם יש AgentId
      let emailSent = false;
      let emailError: string | null = null;

      const agentId = (leadDoc.data() as any)?.AgentId;
      if (agentId) {
        const agentDoc = await db.collection('users').doc(agentId).get();
        if (agentDoc.exists) {
          const agentEmail = (agentDoc.data() as any)?.email;
          if (agentEmail) {
            const r = await sendEmail(
              agentEmail,
              'ליד עודכן במערכת',
              `ליד עם השם ${leadData.firstNameCustomer} ${leadData.lastNameCustomer} עודכן במערכת.`,
              `<p>ליד עם השם <strong>${leadData.firstNameCustomer} ${leadData.lastNameCustomer}</strong> עודכן במערכת.</p>
               <p><a href="https://agent-form-project.vercel.app/Leads" target="_blank">לחץ כאן לצפייה בלידים</a></p>`
            );
            emailSent = r.success;
            emailError = r.error || null;
          }
        }
      }

      await saveRequestLogToDB({
        id,
        status: emailSent ? 'success' : 'partial-success',
        message: emailSent
          ? `Lead with id ${id} updated and email sent successfully`
          : `Lead with id ${id} updated but email failed`,
        payload: { updatedFields: updateData, emailSent, ...(emailError && { emailError }) },
        timestamp: new Date().toISOString(),
      });

      return NextResponse.json({ message: `Lead with id ${id} updated successfully` }, { status: 200 });
    }

    // ----- יצירת ליד חדש -----
    // מיפוי source -> sourceValue
    if (leadData.source) {
      leadData.sourceValue = leadData.source;
      delete leadData.source;
    }

    // נירמול תאריך לידה
    if (leadData.birthday) {
      const d = new Date(leadData.birthday);
      if (!isNaN(d.getTime())) {
        leadData.birthday = d.toISOString().split('T')[0];
      } else {
        leadData.notes = leadData.notes
          ? `${leadData.notes} | תאריך לידה לא תקין: ${leadData.birthday}`
          : `תאריך לידה לא תקין: ${leadData.birthday}`;
        delete leadData.birthday;
      }
    }

    if (!leadData.firstNameCustomer || !leadData.lastNameCustomer || !leadData.phone || !leadData.sourceValue) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // ודא מקור
    const sourceRef = db.collection('sourceLead').doc(leadData.sourceValue);
    const sourceDoc = await sourceRef.get();
    if (!sourceDoc.exists) {
      return NextResponse.json({ error: 'Invalid sourceValue' }, { status: 404 });
    }

    const source = sourceDoc.data() as any;
    let agentId = source.AgentId;
    const pool: string[] = source.agentsPool || [];
    if (pool.length > 0) {
      const last = source.lastAssignedIndex ?? 0;
      const next = (last + 1) % pool.length;
      agentId = pool[next];
      await sourceRef.update({ lastAssignedIndex: next });
    }

    const newLeadRef = await db.collection('leads').add({
      ...leadData,
      consentForInformationRequest: normalizedConsent,
      AgentId: agentId,
      createDate: admin.firestore.FieldValue.serverTimestamp(),
      selectedStatusLead: 'JVhM7nnBrwNBfvrb4zH5',
    });

    // שליחת מייל לסוכן
    let emailSent = false;
    let emailError: string | null = null;

    if (agentId) {
      const agentDoc = await db.collection('users').doc(agentId).get();
      if (agentDoc.exists) {
        const agentEmail = (agentDoc.data() as any)?.email;
        if (agentEmail) {
          const r = await sendEmail(
            agentEmail,
            'ליד חדש הוקצה לך',
            `ליד חדש עם השם ${leadData.firstNameCustomer} ${leadData.lastNameCustomer} והטלפון ${leadData.phone} הוקצה אליך. לצפייה בלידים: https://agent-form-project.vercel.app/Leads`,
            `<p>ליד חדש עם השם <strong>${leadData.firstNameCustomer} ${leadData.lastNameCustomer}</strong> והטלפון <strong>${leadData.phone}</strong> הוקצה אליך.</p>
             <p><a href="https://agent-form-project.vercel.app/Leads" target="_blank">לחץ כאן לצפייה בלידים</a></p>`
          );
          emailSent = r.success;
          emailError = r.error || null;
        }
      }
    }

    await saveRequestLogToDB({
      id: newLeadRef.id,
      status: emailSent ? 'success' : 'partial-success',
      message: emailSent ? 'Lead created and email sent successfully' : 'Lead created but email failed',
      payload: { ...leadData, emailSent, ...(emailError && { emailError }) },
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({ message: 'Lead created successfully!', id: newLeadRef.id }, { status: 201 });
  } catch (e: any) {
    const msg = e?.message || 'Unknown error';
    // console.error('Error:', msg);

    await saveRequestLogToDB({
      id: 'N/A',
      status: 'failure',
      message: 'Internal Server Error',
      payload: { error: msg },
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
