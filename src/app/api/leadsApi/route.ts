import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/firebase';
import { collection, addDoc, doc , getDoc} from 'firebase/firestore';

// Handle POST requests
export async function POST(req: Request) {
  try {
    const apiKey = req.headers.get('Authorization')?.split('Bearer ')[1];
    // console.log("Received API Key:", apiKey);
    // console.log("Expected API Key:", process.env.API_SECRET_KEY);
    // console.log("Loaded API Key:", process.env.API_SECRET_KEY);
    // Check for a valid API key
    if (!apiKey || apiKey !== process.env.API_SECRET_KEY) {
      return NextResponse.json({ error: 'Unauthorized: Invalid API Key' }, { status: 403 });
    }

    const leadData = await req.json();

    // Transform `source` into `sourceValue` if provided
    if (leadData.source) {
      leadData.sourceValue = leadData.source; // Map source to sourceValue
      delete leadData.source; // Remove the redundant source field
    }


    // Validate required fields
    if (!leadData.firstName || !leadData.phone || !leadData.lastName || ! leadData.sourceValue) {
      return NextResponse.json(
        { error: 'Missing required fields: sourceValue, phone, firstName, lastName ' },
        { status: 400 }
      );
    }


    // Fetch the AgentId related to the sourceValue
    const sourceDocRef = doc(db, "sourceLead", leadData.sourceValue);
    const sourceDoc = await getDoc(sourceDocRef);

    if (!sourceDoc.exists()) {
      return NextResponse.json(
        { error: 'Invalid sourceValue: No matching document found in sourceLead' },
        { status: 404 }
      );
    }

    const sourceData = sourceDoc.data();
    const agentId = sourceData.AgentId; 

    if (!agentId) {
      return NextResponse.json(
        { error: 'Invalid sourceValue: Missing AgentId in sourceLead document' },
        { status: 400 }
      );
    }

    // Add lead to Firestore
    const newLeadRef = await addDoc(collection(db, 'leads'), {
      ...leadData,
      AgentId: agentId,
      workerID: leadData.workerID || null,
      createDate: new Date(),
      selectedStatusLead: 'JVhM7nnBrwNBfvrb4zH5',
    });

    return NextResponse.json({ message: 'Lead created successfully!', id: newLeadRef.id },
     { status: 201 });
  } catch (error) {
    console.error('Error creating lead:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
