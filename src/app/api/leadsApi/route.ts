import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/firebase';
import { collection, addDoc, doc , getDoc} from 'firebase/firestore';
import { saveRequestLogToDB, RequestLog } from "@/utils/saveRequestLogToDB";


// Handle POST requests
export async function POST(req: Request) {



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

     // הפיכת ConsentForInformationRequest לערך בוליאני או הגדרת ברירת מחדל ל-false
     const ConsentForInformationRequest = leadData.ConsentForInformationRequest === true;

    // Transform `source` into `sourceValue` if provided
    if (leadData.source) {
      leadData.sourceValue = leadData.source; // Map source to sourceValue
      delete leadData.source; // Remove the redundant source field
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


    // Fetch the AgentId related to the sourceValue
    const sourceDocRef = doc(db, "sourceLead", leadData.sourceValue);
    const sourceDoc = await getDoc(sourceDocRef);

    if (!sourceDoc.exists()) {
      const log: RequestLog = {
        id: "N/A",
        status: "failure",
        message: "Invalid sourceValue: No matching document found in sourceLead",
        payload: { sourceValue: leadData.sourceValue },
        timestamp: new Date().toISOString(),
      };
      await saveRequestLogToDB(log);

      return NextResponse.json(
        { error: "Invalid sourceValue: No matching document found in sourceLead" },
        { status: 404 }
      );
    }


    const sourceData = sourceDoc.data();
    const agentId = sourceData.AgentId; 

    // if (!agentId) {
    //   const log: RequestLog = {
    //     id: "N/A",
    //     status: "failure",
    //     message: "Invalid sourceValue: Missing AgentId in sourceLead document",
    //     payload: { sourceValue: leadData.sourceValue },
    //     timestamp: new Date().toISOString(),
    //   };
    //   await saveRequestLogToDB(log);

    //   return NextResponse.json(
    //     { error: "Invalid sourceValue: Missing AgentId in sourceLead document" },
    //     { status: 400 }
    //   );
    // }

    // Add lead to Firestore
    const newLeadRef = await addDoc(collection(db, 'leads'), {
      ...leadData,
      ConsentForInformationRequest, 
      AgentId: agentId,
      workerID: leadData.workerID || null,
      createDate: new Date(),
      selectedStatusLead: 'JVhM7nnBrwNBfvrb4zH5',
    });

    const log: RequestLog = {
      id: newLeadRef.id,
      status: "success",
      message: "Lead created successfully",
      payload: leadData,
      timestamp: new Date().toISOString(),
    };
    await saveRequestLogToDB(log);


return NextResponse.json({ message: "Lead created successfully!", id: newLeadRef.id }, { status: 201 });
  } catch (error: unknown) {
    const log: RequestLog = {
      id: "N/A",
      status: "failure",
      message: "Internal Server Error",
      payload: { error: (error as Error).message },
      timestamp: new Date().toISOString(),
    };
    await saveRequestLogToDB(log);

    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}