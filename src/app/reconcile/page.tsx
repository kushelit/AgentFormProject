// app/reconcile/page.tsx
import ReconcilePageClient from './reconcile-client';

type PageProps = {
  // App Router: ערכים יכולים להיות string | string[] | undefined
  searchParams?: { [key: string]: string | string[] | undefined };
};

export default function ReconcilePage({ searchParams }: PageProps) {
  // נרמול ל-Record<string,string> לפני שמעבירים ל-Client
  const sp: Record<string, string> = Object.fromEntries(
    Object.entries(searchParams ?? {}).map(([k, v]) => [
      k,
      Array.isArray(v) ? v[0] ?? '' : v ?? '',
    ])
  );

  return <ReconcilePageClient searchParams={sp} />;
}
