import type { ValueMode, VatMode } from '@/types/contractsTables';

export function cleanNumericInput(value: string) {
  return String(value || '')
    .replace(/,/g, '')
    .replace(/[^0-9.]/g, '')
    .replace(/(\..*?)\..*/g, '$1');
}

export function normalizeCommissionForSave(
  rawValue: string,
  inputMode: ValueMode,
  vatMode: VatMode,
  vatRate = 0.18
) {
  const cleaned = cleanNumericInput(rawValue);

  if (!cleaned) {
    return {
      normalizedPercentNet: '',
      percentBeforeVat: '',
      helperText: '',
    };
  }

  const num = Number(cleaned);

 let percentBeforeVat: number;

if (inputMode === 'per_million') {
  if (num <= 100) {
    // המשתמש התכוון לאחוז
    percentBeforeVat = num;
  } else {
    percentBeforeVat = (num / 1_000_000) * 100;
  }
} else {
  percentBeforeVat = num;
}

  const normalizedPercentNet = vatMode === 'includes_vat'
    ? percentBeforeVat / (1 + vatRate)
    : percentBeforeVat;

const format = (num: number) =>
  Number(num.toFixed(2)).toString();

const beforeStr = format(percentBeforeVat);
const netStr = format(normalizedPercentNet);

 const helperText =
  normalizedPercentNet
    ? `נטו: ${netStr}%`
    : "";
    
  
  return {
    normalizedPercentNet: netStr,
    percentBeforeVat: beforeStr,
    helperText,
  };
}