// services/onboardFromReports.ts
'use client';

import { db } from '@/lib/firebase/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { createSaleAndLinkFromExternal } from '@/services/reconcileLinks';
import { makeCompanyCanonical } from '@/utils/reconcile';

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
  } else {
    if (structure === 'firstNameFirst') { firstName = parts[0]; lastName = parts.slice(1).join(' '); }
    else { firstName = parts.slice(-1)[0]; lastName = parts.slice(0, -1).join(' '); }
  }
  return { firstName, lastName };
}

/** שליפת “הצעות הקמה” מתוך policyCommissionSummaries; companyId/templateId/customerId אופציונליים */
export async function fetchProposalsFromSummaries(ctx: {
  agentId: string;
  reportMonth: string;              // YYYY-MM
  companyId?: string;
  templateId?: string;
  customerId?: string;              // ✅ חדש: סינון לפי ת"ז
}) {
  const filters: any[] = [
    where('agentId', '==', ctx.agentId),
    where('reportMonth', '==', ctx.reportMonth),
  ];
  if (ctx.companyId)  filters.push(where('companyId', '==', ctx.companyId));
  if (ctx.templateId) filters.push(where('templateId', '==', ctx.templateId));
  if (ctx.customerId) filters.push(where('customerId', '==', toPadded9(ctx.customerId))); // ✅

  const qy = query(collection(db, 'policyCommissionSummaries'), ...filters);
  const snap = await getDocs(qy);

  type Bucket = { fullName?: string; policiesByKey: Map<string, any> };
  const byCustomer = new Map<string, Bucket>();

  snap.forEach(d => {
    const x = d.data() as any;
    const customerId = toPadded9(x.customerId);
    if (!customerId) return;

    const policyNumberKey = String(x.policyNumberKey || '').trim();
    if (!policyNumberKey) return;

    const compCanon = makeCompanyCanonical(String(x.company || ''));
    const uniqKey = `${compCanon}::${policyNumberKey}`;

    if (!byCustomer.has(customerId)) {
      byCustomer.set(customerId, { fullName: x.fullName || '', policiesByKey: new Map() });
    }
    const bucket = byCustomer.get(customerId)!;

    if (!bucket.policiesByKey.has(uniqKey)) {
      bucket.policiesByKey.set(uniqKey, {
        company: x.company,
        product: x.product ?? '',
        policyNumber: policyNumberKey,
        validMonth: null,
        reportMonth: x.reportMonth,
        templateId: x.templateId || null,
        totalPremiumAmount: Number(x.totalPremiumAmount) || 0,
      });
    }
  });

  return Array.from(byCustomer.entries()).map(([customerId, v]) => ({
    customerId,
    fullName: v.fullName,
    policies: Array.from(v.policiesByKey.values()),
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

export type CreateSalesResult = {
  created: number;
  skipped: number;
  saleIds: string[];
  errors: string[];
};

/** הקמת לקוח (אם חסר) + SALE-ים מהצעה אחת */
export async function createCustomerAndSalesFromProposal(params: {
  agentId: string;
  nameOrder: NameOrder;
  proposal: { customerId: string; fullName?: string; policies: any[] };
}): Promise<CreateSalesResult> {
  const { agentId, nameOrder, proposal } = params;
  const { firstName, lastName } = splitFullName(proposal.fullName || '', nameOrder);

  const result: CreateSalesResult = { created: 0, skipped: 0, saleIds: [], errors: [] };

  for (const p of proposal.policies) {
    try {
      const saleId = await createSaleAndLinkFromExternal({
        external: {
          agentId,
          customerId: proposal.customerId,
          company: p.company,
          product: p.product || '',
          policyNumber: p.policyNumber,
          validMonth: p.validMonth,
          firstNameCustomer: firstName,
          lastNameCustomer: lastName,
          templateId: p.templateId || null,
          totalPremiumAmount: typeof p.totalPremiumAmount === 'number' ? p.totalPremiumAmount : null,
        },
        reportYm: p.reportMonth,
      });
      result.created += 1;
      result.saleIds.push(saleId);
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (msg.includes('כבר מקושרת') || msg.toLowerCase().includes('already')) {
        result.skipped += 1;
      } else {
        result.errors.push(msg);
      }
    }
  }

  return result;
}
