import { doc, getDoc, updateDoc, query, collection, where, getDocs } from "firebase/firestore";
import { db } from '@/lib/firebase/firebase';
import { CustomersTypeForFetching } from '@/types/Customer';

// ── זיהוי ת"ז ללא תלות בפורמט (עם/בלי 0 מוביל) - זהה לעיקרון idVariants ב-NewCustomer.tsx/DealFormModal.tsx ──
const normIdDigits = (v: any) => String(v ?? '').trim().replace(/\D/g, '');
const pad9 = (v: string) => v.padStart(9, '0');
const stripLeadingZeros = (v: string) => v.replace(/^0+/, '');
const idVariants = (v: any): string[] => {
  const d = normIdDigits(v);
  if (!d) return [];
  return Array.from(new Set([d, pad9(d), stripLeadingZeros(d)].filter(Boolean)));
};

export const fetchCustomerBelongToAgent = async (
  idNumber: string,
  agentId: string
): Promise<CustomersTypeForFetching | null> => {
  if (!idNumber || idNumber.length < 6 || !agentId) return null;
  //  console.log("🔍 Fetching customer from Firestore: ID:", idNumber, "Agent:", agentId);

  try {
    const variants = idVariants(idNumber);
    if (!variants.length) return null;

    const customerQuery = query(
      collection(db, "customer"),
      where("IDCustomer", "in", variants.slice(0, 10)),
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