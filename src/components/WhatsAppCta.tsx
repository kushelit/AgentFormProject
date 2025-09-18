// components/WhatsAppCta.tsx
'use client';
import Link from 'next/link';
import { useMemo } from 'react';
import { buildWhatsAppUrl } from '../utils/whatsapp';
import { MessageCircle } from 'lucide-react';

export default function WhatsAppCta({
  message = 'אני מתעניין במערכת. אפשר פרטים?',
  ariaLabel = 'צ׳אט וואטסאפ',
}: { message?: string; ariaLabel?: string }) {
  const href = useMemo(() => buildWhatsAppUrl({
    text: message,
    utm: { utm_source: 'website', utm_medium: 'whatsapp', utm_campaign: 'floating_button' }
  }), [message]);

  if (!href) return null;

  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener"
      aria-label={ariaLabel}
      className="fixed left-4 bottom-4 z-[1000] h-14 w-14 rounded-full flex items-center justify-center bg-green-500 hover:bg-green-600 shadow-xl transition"
    >
      <MessageCircle className="w-7 h-7 text-white" />
    </Link>
  );
}
