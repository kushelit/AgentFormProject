import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { Customer, Sale, CombinedData , AgentDataType } from '../types/Sales';

// ── זיהוי ת"ז ללא תלות בפורמט (עם/בלי 0 מוביל) - זהה לעיקרון idVariants/canonId
// ב-NewCustomer.tsx / DealFormModal.tsx / useEditableTable.ts ──
const canonId = (v: any): string => String(v ?? '').trim().replace(/\D/g, '').replace(/^0+/, '');

const fetchDataForAgent = async (UserAgentId: string): Promise<CombinedData[]> => {
  if (!UserAgentId) {
    // console.warn('No agent selected for admin, skipping data fetch.');
    return []; // מחזיר מערך ריק אם אין מזהה סוכן
  }

  // שליפת לקוחות
  const customerQuery = query(collection(db, 'customer'), where('AgentId', '==', UserAgentId));
  const customerSnapshot = await getDocs(customerQuery);
  const customers: Customer[] = customerSnapshot.docs.map((doc) => ({
    ...doc.data(), // שליפת כל השדות במסמך
    id: doc.id, // הוספת מזהה המסמך
    AgentId: doc.data()?.AgentId || '', // ערך ברירת מחדל אם AgentId חסר
    firstNameCustomer: doc.data()?.firstNameCustomer || 'Unknown',
    lastNameCustomer: doc.data()?.lastNameCustomer || 'Unknown',
    IDCustomer: doc.data()?.IDCustomer || '',
  }));

  // מיפוי לקוחות לפי ת"ז מנורמלת (canonId) - כדי שהצירוף לעסקאות לא ייפול על הבדלי
  // פורמט (עם/בלי 0 מוביל) בין sale.IDCustomer לבין customer.IDCustomer.
  const customersByCanonId = new Map<string, Customer>();
  customers.forEach((c) => {
    const key = canonId(c.IDCustomer);
    if (key && !customersByCanonId.has(key)) {
      customersByCanonId.set(key, c);
    }
  });

  // שליפת מכירות
  const salesQuery = query(collection(db, 'sales'), where('AgentId', '==', UserAgentId));
  const salesSnapshot = await getDocs(salesQuery);
  const sales: Sale[] = salesSnapshot.docs.map((doc) => ({
    ...doc.data(),
    id: doc.id,
    AgentId: doc.data()?.AgentId || '',
    IDCustomer: doc.data()?.IDCustomer || '',
    company: doc.data()?.company || '',
    product: doc.data()?.product || '',
    insPremia: doc.data()?.insPremia || 0,
    pensiaPremia: doc.data()?.pensiaPremia || 0,
    pensiaZvira: doc.data()?.pensiaZvira || 0,
    finansimPremia: doc.data()?.finansimPremia || 0,
    finansimZvira: doc.data()?.finansimZvira || 0,
    mounth: doc.data()?.mounth || '',
    statusPolicy: doc.data()?.statusPolicy || '',
    minuySochen: doc.data()?.minuySochen || false,
    workerName: doc.data()?.workerName || '',
    workerId: doc.data()?.workerId || '',
    notes: doc.data()?.notes || '',
  }));

  // שילוב הנתונים - התאמה לפי ת"ז מנורמלת, לא לפי מחרוזת מדויקת
  const combinedData: CombinedData[] = sales.map((sale) => {
    const customer = customersByCanonId.get(canonId(sale.IDCustomer));
    return {
      ...sale,
      firstNameCustomer: customer?.firstNameCustomer || 'Unknown',
      lastNameCustomer: customer?.lastNameCustomer || 'Unknown',
      sourceValue: customer?.sourceValue || '', // ← זה חשוב לחישוב הפיצול
    };
  });

  // מיון לפי חודש ושנה
  return combinedData.sort((a, b) => {
    const [monthA, yearA] = a.mounth.split('/').map(Number);
    const [monthB, yearB] = b.mounth.split('/').map(Number);
    return (yearB + 2000) - (yearA + 2000) || monthB - monthA;
  });
};
export default fetchDataForAgent;