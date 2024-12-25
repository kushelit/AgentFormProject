import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/firebase';
import { collection, addDoc, doc , getDoc, updateDoc, serverTimestamp} from 'firebase/firestore';
import { saveRequestLogToDB, RequestLog } from "@/utils/saveRequestLogToDB";


const sendEmail = async (to: string, subject: string, text: string, html: string): Promise<{ success: boolean; error?: string }> => {
  try {

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




// Handle POST requests
export async function POST(req: Request) {

//http://localhost:3000/api/leadsApi
//https://agent-form-project.vercel.app/api/leadsApi

  try {
    const apiKey = req.headers.get('Authorization')?.split('Bearer ')[1];
    // Check for a valid API key
    if (!apiKey || apiKey !== process.env.API_SECRET_KEY) {
      const log: RequestLog = {
        id: "N/A",
        status: "failure",
        message: "Unauthorized: Invalid API Key",
        timestamp: new Date().toISOString(),
      };
      await saveRequestLogToDB(log);

      return NextResponse.json({ error: "Unauthorized: Invalid API Key" }, { status: 403 });
    }

    const leadData = await req.json();

   // הפיכת consentForInformationRequest לערך בוליאני עם normalization
   const normalizedConsent = normalizeBoolean(leadData.consentForInformationRequest);
   console.log("Normalized consentForInformationRequest:", normalizedConsent);

   // עדכון הערך המנורמל באובייקט leadData
   leadData.consentForInformationRequest = normalizedConsent;


    // Transform `source` into `sourceValue` if provided
    if (leadData.source) {
      leadData.sourceValue = leadData.source; // Map source to sourceValue
      delete leadData.source; // Remove the redundant source field
    }

if (leadData.birthday) {
  const normalizedDate = new Date(leadData.birthday);
  if (!isNaN(normalizedDate.getTime())) {
    // אם תקין, שמור בפורמט ISO
    leadData.birthday = normalizedDate.toISOString().split('T')[0];
  } else {
    // אם לא תקין, שמור ב-notes
    leadData.notes = leadData.notes
      ? `${leadData.notes} | תאריך לידה לא תקין: ${leadData.birthday}`
      : `תאריך לידה לא תקין: ${leadData.birthday}`;
    delete leadData.birthday;
  }
}

    // Validate required fields
    if (!leadData.firstNameCustomer || !leadData.phone || !leadData.lastNameCustomer || !leadData.sourceValue) {
      const log: RequestLog = {
        id: "N/A",
        status: "failure",
        message: "Missing required fields",
        payload: { leadData },
        timestamp: new Date().toISOString(),
      };
      await saveRequestLogToDB(log);

      return NextResponse.json(
        { error: "Missing required fields: sourceValue, phone, firstName, lastName" },
        { status: 400 }
      );
    }


   // Fetch AgentId
   const sourceDocRef = doc(db, "sourceLead", leadData.sourceValue);
   const sourceDoc = await getDoc(sourceDocRef);
   if (!sourceDoc.exists()) {
     await saveRequestLogToDB({
       id: "N/A",
       status: "failure",
       message: "Invalid sourceValue: No matching document",
       payload: { sourceValue: leadData.sourceValue },
       timestamp: new Date().toISOString(),
     });
     return NextResponse.json({ error: "Invalid sourceValue" }, { status: 404 });
   }
    


    const sourceData = sourceDoc.data();
    let agentId = sourceData.AgentId; 

    let agentsPool = sourceData.agentsPool || []; // פול הסוכנים

    if (agentsPool.length > 0) {
      // אם יש פול סוכנים, בחר סוכן בצורה מעגלית
      const lastAssignedIndex = sourceData.lastAssignedIndex || 0;
      const nextAgentIndex = (lastAssignedIndex + 1) % agentsPool.length;
      agentId = agentsPool[nextAgentIndex];

      // עדכון ה-index במסמך המקור ליד
      await updateDoc(sourceDocRef, { lastAssignedIndex: nextAgentIndex });
    }
   

    // Add lead to Firestore
    const newLeadRef = await addDoc(collection(db, 'leads'), {
      ...leadData,
    //  ConsentForInformationRequest, 
      AgentId: agentId,
      workerID: leadData.workerID || null,
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
    agentEmail= "harelco2@gmail.com";
    if (agentEmail) {
      const emailResult = await sendEmail(
        agentEmail,
        'ליד חדש הוקצה לך',
        `ליד חדש עם השם ${leadData.firstNameCustomer} ${leadData.lastNameCustomer} הוקצה אליך. לצפייה בלידים: https://agent-form-project.vercel.app/Leads`,
        `<p>ליד חדש עם השם <strong>${leadData.firstNameCustomer} ${leadData.lastNameCustomer}</strong> הוקצה אליך.</p>
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