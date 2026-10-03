'use client';

import Image from 'next/image';
import Link from 'next/link';

/**
 * מעטפת ממותגת לעמודי החשבון הציבוריים של MagicTouch:
 * התחברות, איפוס סיסמה ועמודי סיום תשלום.
 *
 * שומרת על השפה הגרפית של דף הנחיתה וההרשמה,
 * בלי TopBar / Navbar של MagicSale.
 */
export default function MagicTouchAuthShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main
      dir="rtl"
      className="relative flex min-h-screen flex-col overflow-hidden bg-[#050817] text-right text-white"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-[#050817] via-[#0b1230] to-[#211449]" />
      <div className="absolute -right-32 top-20 h-[520px] w-[520px] rounded-full bg-purple-500/20 blur-[130px]" />
      <div className="absolute -left-20 bottom-0 h-[420px] w-[420px] rounded-full bg-cyan-400/15 blur-[130px]" />

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 sm:px-6 md:px-10">
        <header className="flex items-center justify-between gap-4">
          <Link href="/MagicTouchLanding" aria-label="MagicTouch">
            <Image
              src="/static/img/MagicTouch/MagicTouchLogo.png"
              alt="MagicTouch"
              width={305}
              height={66}
              priority
              className="h-auto w-[170px] sm:w-[220px]"
            />
          </Link>

          <Link
            href="/MagicTouchLanding"
            className="rounded-xl border border-cyan-300/30 bg-cyan-300/5 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-300/10"
          >
            חזרה ל-MagicTouch
          </Link>
        </header>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur sm:p-8">
            {children}
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-400">
          <Link href="/MagicTouchTerms" className="hover:text-cyan-200">
            תנאי שימוש
          </Link>
          <Link href="/MagicTouchPrivacy" className="hover:text-cyan-200">
            מדיניות פרטיות
          </Link>
          <Link href="/MagicTouchSupport" className="hover:text-cyan-200">
            תמיכה
          </Link>
          <a
            href="https://www.unamix.co.il/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-cyan-200"
          >
            מבית Unamix
          </a>
        </footer>
      </div>
    </main>
  );
}

/**
 * מחלקות משותפות לשדות ולכפתורים בעמודים האלה.
 */
export const magicTouchInputClass =
  'w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-right text-white outline-none transition placeholder:text-slate-400 focus:border-cyan-300/60 focus:bg-white/[0.12] disabled:opacity-60';

export const magicTouchPrimaryButtonClass =
  'w-full rounded-xl bg-cyan-400 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-500 disabled:text-slate-200';

export const magicTouchSecondaryButtonClass =
  'w-full rounded-xl border border-white/20 bg-white/5 py-3 text-sm font-medium text-white transition hover:bg-white/10 disabled:opacity-60';

export const magicTouchErrorClass =
  'rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200';

export const magicTouchNoticeClass =
  'rounded-xl border border-amber-300/30 bg-amber-400/10 p-3 text-center text-sm text-amber-100';
