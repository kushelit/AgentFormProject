import { doc, getDoc, updateDoc, query, collection, where, getDocs } from "firebase/firestore";
import { db } from '@/lib/firebase/firebase';
import { CustomersTypeForFetching } from '@/types/Customer';


 
export const fetchCustomersForAgent = async (UserAgentId: string): Promise<CustomersTypeForFetching[]> => {
  const q = query(collection(db, 'customer'), where('AgentId', '==', UserAgentId));
  const querySnapshot = await getDocs(q);

  const data = await Promise.all(
    querySnapshot.docs.map(async (docSnapshot) => {
      const customerData = docSnapshot.data() as CustomersTypeForFetching;

      let parentFullName = '';
      if (customerData.parentID) {
        if (customerData.parentID === docSnapshot.id) {
          parentFullName = `${customerData.firstNameCustomer || ''} ${customerData.lastNameCustomer || ''}`.trim();
        } else {
          const parentRef = doc(db, 'customer', customerData.parentID);
          const parentDoc = await getDoc(parentRef);
          if (parentDoc.exists()) {
            const parentData = parentDoc.data() as CustomersTypeForFetching;
            parentFullName = `${parentData.firstNameCustomer || ''} ${parentData.lastNameCustomer || ''}`.trim();
          }
        }
      }

      return {
        ...customerData,
        id: docSnapshot.id,
        parentFullName,
      };
    })
  );
  return data; // הפונקציה מחזירה את המידע שה-hook משתמש בו
};


export default fetchCustomersForAgent;
