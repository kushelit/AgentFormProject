import { Suspense } from 'react';
import MagicTouchLoginClient from './MagicTouchLoginClient';

export default function MagicTouchLoginPage() {
  return (
    <Suspense fallback={null}>
      <MagicTouchLoginClient />
    </Suspense>
  );
}
