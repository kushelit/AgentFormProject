'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  collection, query, where, orderBy, startAt, endAt, limit, getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';

interface CustomerHit {
  id: string;
  firstNameCustomer?: string;
  lastNameCustomer?: string;
  fullNameCustomer?: string;
  IDCustomer?: string;
}

// שימי לב: הקומפוננטה הזו מסתמכת על class names (.customer-search-*) שמוגדרים
// ב-style.css של ה-TopBar (../style.css) ולא מייבאת CSS משלה - היא מיועדת לרוץ
// בתוך TopBar בלבד, שכבר טוען את הקובץ הזה גלובלית.

interface Props {
  agentId: string | null | undefined;
}

// ── חיפוש "מתחיל ב-" (prefix) בלבד — לא "מכיל" — כדי לא לטעון את כל הלקוחות של הסוכן בכל טעינת עמוד.
// שתי שאילתות מקבילות: שם מלא (fullNameCustomer) ות"ז (IDCustomer), עם דה-דופ לפי doc id. ──
export default function CustomerSearchBox({ agentId }: Props) {
  const router = useRouter();
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<CustomerHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── מיקום הדרופדאון: מחושב ב-position:fixed לפי הקואורדינטות בפועל של שדה הקלט,
  // כדי לעקוף לגמרי את ה-stacking context של .top-bar (z-index: 1050) — אחרת
  // כל z-index שנקבע כאן כלוא בתוך ה-1050 הזה ולא באמת מתחרה מול הסיידבר. ──
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const updateCoords = () => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setCoords({ top: rect.bottom + 6, left: rect.left, width: rect.width });
  };

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const inContainer = containerRef.current?.contains(e.target as Node);
      const inDropdown = dropdownRef.current?.contains(e.target as Node);
      if (!inContainer && !inDropdown) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    updateCoords();
    const onReposition = () => updateCoords();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = term.trim();
    if (!trimmed || !agentId) {
      setResults([]);
      setErrorMsg(null);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const merged = new Map<string, CustomerHit>();
        const addDocs = (docs: any[]) => {
          docs.forEach((d) => merged.set(d.id, { id: d.id, ...(d.data() as any) }));
        };

        const prefixQuery = (field: string, val: string, lim = 15) => query(
          collection(db, 'customer'),
          where('AgentId', '==', agentId),
          orderBy(field),
          startAt(val),
          endAt(val + '\uf8ff'),
          limit(lim),
        );

        const parts = trimmed.split(/\s+/).filter(Boolean);

        if (parts.length >= 2) {
          // ── שתי מילים ומעלה: מניחים "פרטי משפחה" — ובודקים גם את הכיוון ההפוך ("משפחה פרטי") ──
          const w1 = parts[0];
          const w2 = parts.slice(1).join(' ');

          const [firstA, lastA, firstB, lastB] = await Promise.all([
            getDocs(prefixQuery('firstNameCustomer', w1, 30)),
            getDocs(prefixQuery('lastNameCustomer', w2, 30)),
            getDocs(prefixQuery('lastNameCustomer', w1, 30)),
            getDocs(prefixQuery('firstNameCustomer', w2, 30)),
          ]);

          const firstAIds = new Set(firstA.docs.map((d) => d.id));
          const firstBIds = new Set(firstB.docs.map((d) => d.id));

          addDocs(lastA.docs.filter((d) => firstAIds.has(d.id))); // פרטי=w1 וגם משפחה=w2
          addDocs(lastB.docs.filter((d) => firstBIds.has(d.id))); // משפחה=w1 וגם פרטי=w2
        } else {
          // ── מילה אחת: שם פרטי / שם משפחה / ת"ז - כל התאמה ──
          const [firstSnap, lastSnap, idSnap] = await Promise.all([
            getDocs(prefixQuery('firstNameCustomer', trimmed, 15)),
            getDocs(prefixQuery('lastNameCustomer', trimmed, 15)),
            getDocs(prefixQuery('IDCustomer', trimmed, 15)),
          ]);
          addDocs(firstSnap.docs);
          addDocs(lastSnap.docs);
          addDocs(idSnap.docs);
        }

        setResults(Array.from(merged.values()).slice(0, 20));
      } catch (e: any) {
        // eslint-disable-next-line no-console
        console.error('[CustomerSearchBox] search failed:', e);
        setResults([]);
        setErrorMsg(
          e?.code === 'failed-precondition'
            ? 'חסר אינדקס ב-Firestore לחיפוש הזה — פרטים בקונסול (F12), יש שם קישור ליצירתו'
            : 'שגיאה בחיפוש — נסי שוב',
        );
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [term, agentId]);

  const goToCustomer = (id: string) => {
    setOpen(false);
    setTerm('');
    setResults([]);
    router.push(`/customers/${id}`);
  };

  const displayName = (c: CustomerHit) =>
    c.fullNameCustomer || `${c.firstNameCustomer ?? ''} ${c.lastNameCustomer ?? ''}`.trim();

  return (
    <div ref={containerRef} className="customer-search-wrap" style={{ width: 260, flex: '0 0 260px' }}>
      <input
        type="text"
        value={term}
        onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
        onFocus={() => { setOpen(true); }}
        placeholder="חיפוש לקוח לפי שם או ת&quot;ז"
        disabled={!agentId}
        className="customer-search-input"
      />
      <svg
        className="customer-search-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>

      {open && term.trim() && coords && mounted && createPortal(
        <div
          ref={dropdownRef}
          className="customer-search-dropdown"
          style={{ top: coords.top, left: coords.left, width: Math.min(coords.width, 300) }}
        >
          {loading && (
            <div className="customer-search-empty">מחפש...</div>
          )}

          {!loading && errorMsg && (
            <div className="customer-search-empty customer-search-error">{errorMsg}</div>
          )}

          {!loading && !errorMsg && results.length === 0 && (
            <div className="customer-search-empty">לא נמצאו לקוחות</div>
          )}

          {!loading && !errorMsg && results.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => goToCustomer(c.id)}
              className="customer-search-result"
            >
              <div className="customer-search-result-name">{displayName(c) || '—'}</div>
              <div className="customer-search-result-id">{c.IDCustomer || ''}</div>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
