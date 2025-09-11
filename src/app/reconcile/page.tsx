// app/reconcile/page.tsx
import ReconcileClient from "./reconcile-client";

export default function Page({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const sp: Record<string, string> = {};
  for (const k of Object.keys(searchParams)) {
    const v = searchParams[k];
    sp[k] = Array.isArray(v) ? v[0] ?? "" : v ?? "";
  }
  return <ReconcileClient searchParams={sp} />;
}
