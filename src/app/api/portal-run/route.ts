import { NextRequest, NextResponse } from "next/server";

function normBase(v: string) {
  let s = String(v || "").trim();
  if (!s) return "";
  // allow "127.0.0.1:8080" בלי http
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  // remove trailing slash
  s = s.replace(/\/+$/, "");
  return s;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const runId = String(body?.runId || "").trim();
    if (!runId) {
      return NextResponse.json({ ok: false, error: "Missing runId" }, { status: 400 });
    }

    // ✅ מוצר: קודם ENV, ואם אין—fallback ל-localhost
    const base =
      normBase(process.env.PORTAL_RUNNER_URL || process.env.NEXT_PUBLIC_PORTAL_RUNNER_URL || "") ||
      "http://127.0.0.1:8080";

    // timeout כדי לא להיתקע
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 60_000);

    const res = await fetch(`${base}/process-run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId }),
      cache: "no-store",
      signal: ctrl.signal,
    }).finally(() => clearTimeout(t));

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: data?.error || `HTTP ${res.status}` },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch (e: any) {
    const msg = String(e?.message || e);
    const isAbort = /aborted|abort|timeout/i.test(msg);
    return NextResponse.json(
      { ok: false, error: isAbort ? "Runner timeout / not reachable" : msg },
      { status: isAbort ? 504 : 500 }
    );
  }
}
