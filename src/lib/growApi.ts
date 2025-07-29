import { GROW_BASE_URL } from './env';

export const GROW_ENDPOINTS = {
  createPayment: `${GROW_BASE_URL}/createPaymentProcess`,
  updateDirectDebit: `${GROW_BASE_URL}/updateDirectDebit`,
  refundTransaction: `${GROW_BASE_URL}/refundTransaction`,
};
