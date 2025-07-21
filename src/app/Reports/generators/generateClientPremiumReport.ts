// import { db } from '@/lib/firebase/firebase';
// import { collection, getDocs, query, where } from 'firebase/firestore';
// import * as XLSX from 'xlsx';
// import { ReportRequest } from '../types';

// export async function generateClientPremiumReport(params: ReportRequest) {
//   const { fromDate, toDate, idNumber } = params;

//   const salesRef = collection(db, 'sales');
//   let q = query(salesRef);

//   if (idNumber) {
//     q = query(salesRef, where('IDCustomer', '==', idNumber));
//   }

//   const snapshot = await getDocs(q);
//   let filtered = snapshot.docs.map(doc => doc.data());

//   if (fromDate) {
//     filtered = filtered.filter(row => row.mounth && row.mounth >= fromDate);
//   }
//   if (toDate) {
//     filtered = filtered.filter(row => row.mounth && row.mounth <= toDate);
//   }

//   const rows = filtered.map(row => ({
//     "שם פרטי": row.firstNameCustomer || '',
//     "שם משפחה": row.lastNameCustomer || '',
//     "תז": row.IDCustomer || '',
//     "חברה": row.company || '',
//     "מוצר": row.product || '',
//     "חודש": row.mounth || '',
//     "פרמיה ביטוח": row.insPremia || 0,
//     "פרמיה פנסיה": row.pensiaPremia || 0,
//     "פרמיה פיננסים": row.finansimPremia || 0,
//   }));

//   const worksheet = XLSX.utils.json_to_sheet(rows);
//   const workbook = XLSX.utils.book_new();
//   XLSX.utils.book_append_sheet(workbook, worksheet, 'פרמיות');
//   const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

//   return {
//     buffer,
//     filename: 'דוח_פרמיות.xlsx',
//     subject: 'דוח פרמיות ללקוח ממערכת MagicSale',
//     description: 'מצורף דוח Excel המכיל את סיכום הפרמיות ללקוח.',
//   };
// }
