// src/hooks/useHoverPrefetch.ts
// טעינה מוקדמת אחרי השהייה קצרה של העכבר — לא יורה בקשה על כל מעבר מהיר על הטבלה.
import { useCallback, useEffect, useRef } from 'react';

export default function useHoverPrefetch(delayMs = 300) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  /** מחזיר props ל-onMouseEnter / onMouseLeave */
  return useCallback(
    (fn: () => void) => ({
      onMouseEnter: () => {
        cancel();
        timer.current = setTimeout(fn, delayMs);
      },
      onMouseLeave: cancel,
    }),
    [cancel, delayMs]
  );
}
