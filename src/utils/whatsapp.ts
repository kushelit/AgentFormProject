// utils/whatsapp.ts
export function sanitizeE164NoPlus(num?: string) {
  return (num ?? '').replace(/[^\d]/g, '');
}

export function buildWhatsAppUrl(opts?: {
  text?: string; // לא חובה, יגיע מהקומפוננטה
  utm?: Record<string, string | number | boolean>;
}) {
  const phone = sanitizeE164NoPlus(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER);
  if (!phone) return '';
  const base = `https://wa.me/${phone}`;

  const text = opts?.text ?? ''; // בלי דיפולט מה-ENV
  const params = new URLSearchParams();
  if (text) params.set('text', text);
  if (opts?.utm) Object.entries(opts.utm).forEach(([k, v]) => params.append(k, String(v)));

  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
