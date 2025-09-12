'use client';

import { db } from '@/lib/firebase/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { createSaleAndLinkFromExternal } from '@/services/reconcileLinks';

export type NameOrder = 'firstNameFirst' | 'lastNameFirst';

const toPadded9 = (v: any) => {
  const d = String(v ?? '').replace(/\D/g, '');
  return d ? d.padStart(9, '0').slice(-9) : '';
};

export function splitFullName(fullNameRaw: string, structure: NameOrder) {
  const parts = String(fullNameRaw || '').trim().split(' ').filter(Boolean);
  let firstName = '', lastName = '';
  if (parts.length === 1) { firstName = parts[0]; }
  else if (parts.length === 2) {
    if (structure === 'firstNameFirst') { firstName = parts[0]; lastName = parts[1]; }
    else { firstName = parts[1]; lastName = parts[0]; }
  } else if (parts.length === 3) {
    if (structure === 'firstNameFirst') { firstName = parts[0]; lastName = parts.slice(1).join(' '); }
    else { firstName = parts.slice(2).join(' '); lastName = parts.slice(0, 2).join(' '); }
  } else if (parts.length > 3) {
    if (structure === 'firstNameFirst') { firstName = parts[0]; lastName = parts.slice(1).join(' '); }
    else { firstName = parts.slice(-1)[0]; lastName = parts.slice(0, -1).join(' '); }
  }
  return { firstName, lastName };
}

/** שליפת “הצעות הקמה” מתוך policyCommissionSummaries; companyId/templateId אופציונליים */
export async function fetchProposalsFromSummaries(ctx: {
  agentId: string;
  reportMonth: string;              // YYYY-MM
  companyId?: string;
  templateId?: string;
}) {
  const filters: any[] = [
    where('agentId', '==', ctx.agentId),
    where('reportMonth', '==', ctx.reportMonth),
  ];
  if (ctx.companyId)  filters.push(where('companyId', '==', ctx.companyId));
  if (ctx.templateId) filters.push(where('templateId', '==', ctx.templateId));

  const qy = query(collection(db, 'policyCommissionSummaries'), ...filters);
  const snap = await getDocs(qy);

  const byCustomer = new Map<string, { fullName?: string; policies: any[] }>();
  snap.forEach(d => {
    const x = d.data() as any;
    const customerId = toPadded9(x.customerId);
    if (!customerId) return;
    if (!byCustomer.has(customerId)) byCustomer.set(customerId, { fullName: x.fullName || '', policies: [] });
    byCustomer.get(customerId)!.policies.push({
      company: x.company,
      product: x.product ?? '',
      policyNumber: x.policyNumberKey,  // מספיק לשיוך
      validMonth: null,                 // בתקציר לרוב אין VALID – נשתמש ב-reportMonth
      reportMonth: x.reportMonth,
    });
  });

  return Array.from(byCustomer.entries()).map(([customerId, v]) => ({
    customerId, fullName: v.fullName, policies: v.policies
  }));
}

/** בדיקה מי מהלקוחות כבר קיימים תחת הסוכן */
export async function fetchExistingCustomerIds(agentId: string, customerIds: string[]) {
  const exist = new Set<string>();
  const uniq = Array.from(new Set(customerIds.filter(Boolean))).map(toPadded9);
  for (let i = 0; i < uniq.length; i += 10) {
    const qy = query(
      collection(db, 'customer'),
      where('AgentId', '==', String(agentId)),
      where('IDCustomer', 'in', uniq.slice(i, i + 10))
    );
    const snap = await getDocs(qy);
    snap.forEach(d => exist.add(String((d.data() as any).IDCustomer || '')));
  }
  return exist;
}

/** הקמת לקוח (אם חסר) + SALE-ים מהצעה אחת (מניעת כפילויות ב-SALE באמצעות האינדקס) */
export async function createCustomerAndSalesFromProposal(params: {
  agentId: string;
  nameOrder: NameOrder;
  proposal: { customerId: string; fullName?: string; policies: any[] };
}) {
  const { agentId, nameOrder, proposal } = params;
  const { firstName, lastName } = splitFullName(proposal.fullName || '', nameOrder);

  for (const p of proposal.policies) {
    await createSaleAndLinkFromExternal({
      external: {
        agentId,
        customerId: proposal.customerId,
        company: p.company,
        product: p.product || '',
        policyNumber: p.policyNumber,
        validMonth: p.validMonth,
        firstNameCustomer: firstName,
        lastNameCustomer: lastName,
      },
      reportYm: p.reportMonth,
    });
  }
}
