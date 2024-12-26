import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/firebase';
import { collection, addDoc, doc , getDoc, updateDoc, serverTimestamp} from 'firebase/firestore';
import { saveRequestLogToDB, RequestLog } from "@/utils/saveRequestLogToDB";



//https://agent-form-project.vercel.app/api/leadsApi
//http://localhost:3000/api/leadsApi

const sendEmail = async (to: string, subject: string, text: string, html: string): Promise<{ success: boolean; error?: string }> => {
  try {
//env.NEXT_PUBLIC_BASE_URL change to process.env.NEXT_PUBLIC_BASE_URL
    const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/sendEmail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, text, html }),
    });
    if (!response.ok) {
      const errorData = await response.json();
      return { success: false, error: errorData.error || 'Unknown error' };
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};

const normalizeBoolean = (value: any): boolean => {
  console.log( "before change " + value);
  if (value === true || value === "true" || value === 1) {
    return true;
  }
  if (value === false || value === "false" || value === 0) {
    return false;
  }
  return false; // ברירת מחדל
  
};


export async function POST(req: Request) {
  try {
    const apiKey = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!apiKey || apiKey !== process.env.API_SECRET_KEY) {
      await saveRequestLogToDB({
        id: "N/A",
        status: "failure",
        message: "Unauthorized: Invalid API Key",
        timestamp: new Date().toISOString(),
      });
      return NextResponse.json({ error: "Unauthorized: Invalid API Key" }, { status: 403 });
    }

    const body = await req.json();
    const { id, consentForInformationRequest, ...leadData } = body;

    // Normalize `consentForInformationRequest`
    const normalizedConsent = consentForInformationRequest !== undefined
      ? normalizeBoolean(consentForInformationRequest)
      : false; // ברירת מחדל לערך false אם לא נשלח

    if (id) {
      // Update existing lead
      const leadRef = doc(db, 'leads', id);
      const leadDoc = await getDoc(leadRef);

      if (!leadDoc.exists()) {
        return NextResponse.json({ error: `Lead with id ${id} not found` }, { status: 404 });
      }

      const updateData: Record<string, any> = {
        ...leadData,
      };
      if (normalizedConsent !== undefined) {
        updateData.consentForInformationRequest = normalizedConsent;
      }

      await updateDoc(leadRef, updateData);

 // שליחת מייל במקרה של עדכון
 let emailSent = false;
 let emailError = null;

 const agentId = leadDoc.data().AgentId;
 if (agentId) {
   const agentDocRef = doc(db, "users", agentId);
   const agentDoc = await getDoc(agentDocRef);

   if (agentDoc.exists()) {
     const agentData = agentDoc.data();
     let agentEmail = agentData?.email;
     //agentEmail= "harelco2@gmail.com";
     if (agentEmail) {
       const emailResult = await sendEmail(
         agentEmail,
         'ליד עודכן במערכת',
         `ליד עם השם ${leadData.firstNameCustomer} ${leadData.lastNameCustomer} עודכן במערכת.`,
         `<p>ליד עם השם <strong>${leadData.firstNameCustomer} ${leadData.lastNameCustomer}</strong> עודכן במערכת.</p>
          <p><a href="https://agent-form-project.vercel.app/Leads" target="_blank">לחץ כאן לצפייה בלידים</a></p>`
       );

       emailSent = emailResult.success;
       emailError = emailResult.error;
     }
   }
 }

 // Log update
 await saveRequestLogToDB({
  id,
  status: emailSent ? "success" : "partial-success",
  message: emailSent
    ? `Lead with id ${id} updated and email sent successfully`
    : `Lead with id ${id} updated but email failed`,
  payload: { updatedFields: updateData, emailSent, ...(emailError && { emailError }) },
  timestamp: new Date().toISOString(),
});

      return NextResponse.json({ message: `Lead with id ${id} updated successfully` }, { status: 200 });
    } else {
      // Create new lead
      if (leadData.source) {
        leadData.sourceValue = leadData.source;
        delete leadData.source;
      }

      if (leadData.birthday) {
        const normalizedDate = new Date(leadData.birthday);
        if (!isNaN(normalizedDate.getTime())) {
          leadData.birthday = normalizedDate.toISOString().split('T')[0];
        } else {
          leadData.notes = leadData.notes
            ? `${leadData.notes} | תאריך לידה לא תקין: ${leadData.birthday}`
            : `תאריך לידה לא תקין: ${leadData.birthday}`;
          delete leadData.birthday;
        }
      }

      if (!leadData.firstNameCustomer || !leadData.phone || !leadData.lastNameCustomer || !leadData.sourceValue) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
      }

      leadData.consentForInformationRequest = normalizedConsent;



      const sourceDocRef = doc(db, "sourceLead", leadData.sourceValue);
      const sourceDoc = await getDoc(sourceDocRef);
      if (!sourceDoc.exists()) {
        return NextResponse.json({ error: "Invalid sourceValue" }, { status: 404 });
      }

      const sourceData = sourceDoc.data();
      let agentId = sourceData.AgentId;
      const agentsPool = sourceData.agentsPool || [];
      if (agentsPool.length > 0) {
        const lastAssignedIndex = sourceData.lastAssignedIndex || 0;
        const nextAgentIndex = (lastAssignedIndex + 1) % agentsPool.length;
        agentId = agentsPool[nextAgentIndex];
        await updateDoc(sourceDocRef, { lastAssignedIndex: nextAgentIndex });
      }

      const newLeadRef = await addDoc(collection(db, 'leads'), {
        ...leadData,
        consentForInformationRequest: normalizedConsent,
        AgentId: agentId,
        createDate: serverTimestamp(),
        selectedStatusLead: 'JVhM7nnBrwNBfvrb4zH5',
      });

      let emailSent = false;
      let emailError = null;
     
      if (agentId) {
       const agentDocRef = doc(db, "users", agentId);
       const agentDoc = await getDoc(agentDocRef);
     
       if (agentDoc.exists()) {
         const agentData = agentDoc.data();
         let agentEmail = agentData?.email;
        // agentEmail= "harelco2@gmail.com";
         if (agentEmail) {
           const emailResult = await sendEmail(
             agentEmail,
             'ליד חדש הוקצה לך',
             `ליד חדש עם השם ${leadData.firstNameCustomer} ${leadData.lastNameCustomer} והטלפון ${leadData.phone} הוקצה אליך. לצפייה בלידים: https://agent-form-project.vercel.app/Leads`,
             `<p>ליד חדש עם השם <strong>${leadData.firstNameCustomer} ${leadData.lastNameCustomer}</strong> והטלפון <strong>${leadData.phone}</strong> הוקצה אליך.</p>
              <p><a href="https://agent-form-project.vercel.app/Leads" target="_blank">לחץ כאן לצפייה בלידים</a></p>`
           );
     
           emailSent = emailResult.success;
           emailError = emailResult.error;
         }
       }
     }
      

     await saveRequestLogToDB({
      id: newLeadRef.id,
      status: emailSent ? "success" : "partial-success", // שימוש בסטטוס המתאים
      message: emailSent
        ? "Lead created and email sent successfully"
        : "Lead created but email failed",
      payload: {
        ...leadData,
        emailSent,
        ...(emailError !== undefined && { emailError }), // הוספת emailError רק אם הוא מוגדר
      },
      timestamp: new Date().toISOString(),
    });

      return NextResponse.json({ message: "Lead created successfully!", id: newLeadRef.id }, { status: 201 });
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error:', errorMessage);

    await saveRequestLogToDB({
      id: "N/A",
      status: "failure",
      message: "Internal Server Error",
      payload: { error: errorMessage },
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}