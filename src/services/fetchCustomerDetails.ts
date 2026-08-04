import { doc, getDoc, updateDoc, query, collection, where, getDocs, DocumentSnapshot } from "firebase/firestore";
import { db } from '@/lib/firebase/firebase';
import { CustomersTypeForFetching } from '@/types/Customer';

// ── זיהוי ת"ז ללא תלות בפורמט (עם/בלי 0 מוביל) - אותו עיקרון בכל שאר הקבצים
// (NewCustomer.tsx / DealFormModal.tsx / useEditableTable.ts / customerTiers.ts) ──
const canonId = (v: any): string => String(v ?? '').trim().replace(/\D/g, '').replace(/^0+/, '');

export const fetchCustomersForAgent = async (UserAgentId: string): Promise<CustomersTypeForFetching[]> => {
  const q = query(collection(db, 'customer'), where('AgentId', '==', UserAgentId));
  const querySnapshot = await getDocs(q);

  // ── דה-דופ לפי ת"ז מנורמלת - אותה שיטה כמו ב-customerTiers.ts: בין שתי רשומות
  // עם אותה ת"ז מנורמלת (עם/בלי 0 מוביל), מוצגת רק זו שעודכנה לאחרונה.
  // הרשומה השנייה לא נמחקת ב-DB - היא רק לא מוצגת ברשימה הזו.
  const primaryByKey = new Map<string, DocumentSnapshot>();
  querySnapshot.docs.forEach((docSnapshot) => {
    const data = docSnapshot.data() as any;
    const key = canonId(data.IDCustomer) || `__noId_${docSnapshot.id}`; // אין ת"ז - לא ניתן לזהות כפילות, נשארת לבד

    const existing = primaryByKey.get(key);
    if (!existing) {
      primaryByKey.set(key, docSnapshot);
      return;
    }

    const existingData = existing.data() as any;
    const existingTime = existingData?.lastUpdateDate?.toMillis?.() ?? existingData?.createdAt?.toMillis?.() ?? 0;
    const currentTime = data?.lastUpdateDate?.toMillis?.() ?? data?.createdAt?.toMillis?.() ?? 0;

    if (currentTime > existingTime) {
      primaryByKey.set(key, docSnapshot);
    }
  });

  const dedupedDocs = Array.from(primaryByKey.values());

  const data = await Promise.all(
    dedupedDocs.map(async (docSnapshot) => {
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