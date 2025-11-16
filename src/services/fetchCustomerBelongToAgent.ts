import { doc, getDoc, updateDoc, query, collection, where, getDocs } from "firebase/firestore";
import { db } from '@/lib/firebase/firebase';
import { CustomersTypeForFetching } from '@/types/Customer';


 
export const fetchCustomerBelongToAgent = async (
  idNumber: string,
  agentId: string
): Promise<CustomersTypeForFetching | null> => {
  if (!idNumber || idNumber.length < 8 || !agentId) return null;
  // console.log("🔍 Fetching customer from Firestore: ID:", idNumber, "Agent:", agentId);

  try {
    const customerQuery = query(
      collection(db, "customer"),
      where("IDCustomer", "==", idNumber),
      where("AgentId", "==", agentId)
    );

    const customerSnapshot = await getDocs(customerQuery);

    if (!customerSnapshot.empty) {
      const doc = customerSnapshot.docs[0];
      return { id: doc.id, ...doc.data() } as CustomersTypeForFetching; // החזרת מזהה הלקוח כחלק מהאובייקט
    } else {
      return null; // אם לא נמצא לקוח, נחזיר null
    }
  } catch (error) {
    // console.error("Error fetching customer details:", error);
    return null;
  }
};

export default fetchCustomerBelongToAgent;
