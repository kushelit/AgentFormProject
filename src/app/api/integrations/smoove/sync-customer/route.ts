import { NextRequest, NextResponse } from "next/server";
import { admin } from "@/lib/firebase/firebase-admin";

type SmooveFlags = {
  lifeRisk: boolean;
  healthPlan: boolean;
  savingsOrInvestment: boolean;
};

function normStr(v: any) {
  return String(v ?? "").trim();
}

function toMillisSafe(ts: any): number {
  if (ts && typeof ts.toMillis === "function") return ts.toMillis();
  return 0;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const agentId = normStr(body.agentId);
    const IDCustomer = normStr(body.IDCustomer);

    if (!agentId || !IDCustomer) {
      return NextResponse.json(
        { ok: false, error: "Missing agentId or IDCustomer" },
        { status: 400 }
      );
    }

    const db = admin.firestore();

    // 1) Load config
    const cfgSnap = await db.collection("integrations").doc("smooveConfig").get();
    const cfg = cfgSnap.exists ? (cfgSnap.data() as any) : null;

    if (!cfg?.enabled) {
      return NextResponse.json({ ok: true, skipped: "disabled" });
    }

    const allowed: string[] = Array.isArray(cfg.allowedAgentIds)
      ? cfg.allowedAgentIds
      : [];

    if (!allowed.includes(agentId)) {
      return NextResponse.json({ ok: true, skipped: "agent_not_allowed" });
    }

    const webhookUrl = normStr(cfg.webhookUrl);
    if (!webhookUrl) {
      return NextResponse.json(
        { ok: false, error: "Missing webhookUrl" },
        { status: 500 }
      );
    }

    // 2) Fetch customer
    const custQ = await db
      .collection("customer")
      .where("AgentId", "==", agentId)
      .where("IDCustomer", "==", IDCustomer)
      .limit(1)
      .get();

    if (custQ.empty) {
      return NextResponse.json(
        { ok: false, error: "Customer not found" },
        { status: 404 }
      );
    }

    const custDoc = custQ.docs[0];
    const customer = custDoc.data() as any;

    // 3) Fetch sales
    const salesSnap = await db
      .collection("sales")
      .where("AgentId", "==", agentId)
      .where("IDCustomer", "==", IDCustomer)
      .get();

    const sales = salesSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
    }));

    // 3a) Status → Event
    const hasActive = sales.some(
      (s) => normStr(s.statusPolicy) === "פעילה"
    );

    const event: "lead" | "activeCustomer" =
      hasActive ? "activeCustomer" : "lead";

    // 3b) Handler – latest sale
    sales.sort((a, b) => {
      const ta = toMillisSafe(a.lastUpdateDate) || toMillisSafe(a.createdAt) || 0;
      const tb = toMillisSafe(b.lastUpdateDate) || toMillisSafe(b.createdAt) || 0;
      return tb - ta;
    });

    const latestSale = sales[0];
    let handlerName = "";

    if (latestSale?.workerId) {
      const uSnap = await db
        .collection("users")
        .doc(normStr(latestSale.workerId))
        .get();

      if (uSnap.exists) {
        handlerName = normStr((uSnap.data() as any)?.name);
      }
    }

    // 4) Product → Smoove category
    const productsSnap = await db.collection("product").get();
    const productNameToCategory = new Map<string, string>();

    productsSnap.docs.forEach((d) => {
      const p = d.data() as any;
      if (p.productName && p.productSmooveCategory) {
        productNameToCategory.set(
          normStr(p.productName),
          normStr(p.productSmooveCategory)
        );
      }
    });

    // 5) Compute flags from ALL relevant sales (offer + active)
const flags: SmooveFlags = { lifeRisk: false, healthPlan: false, savingsOrInvestment: false };

const relevantStatuses = new Set(["פעילה", "הצעה"]);

for (const s of sales) {
  const st = normStr(s.statusPolicy);
  if (!relevantStatuses.has(st)) continue; // ignore canceled/other statuses

  const saleProductName = normStr(s.product);
  if (!saleProductName) continue;

  const cat = productNameToCategory.get(saleProductName) || "";
  if (cat === "lifeRisk") flags.lifeRisk = true;
  if (cat === "healthPlan") flags.healthPlan = true;
  if (cat === "savingsOrInvestment") flags.savingsOrInvestment = true;

  // optional micro-optimization: stop early if all true
  if (flags.lifeRisk && flags.healthPlan && flags.savingsOrInvestment) break;
}


    // 6) Payload
    const payload = {
      source: "magicsale",
      event,

      agentId,
      IDCustomer,

      firstName: normStr(customer.firstNameCustomer),
      lastName: normStr(customer.lastNameCustomer),
      mobile: normStr(customer.phone),
      email: normStr(customer.mail),

      address: normStr(customer.address), // ✅ כתובת

      birthDate: normStr(customer.birthday),
      gender: normStr(customer.gender),

      lifeRisk: flags.lifeRisk,
      healthPlan: flags.healthPlan,
      savingsOrInvestment: flags.savingsOrInvestment,

      customerType: "רגיל",
      handler: handlerName,
    };

    // 7) Send
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.secret ? { "x-magicsale-secret": String(cfg.secret) } : {}),
      },
      body: JSON.stringify(payload),
    });

    const respText = await res.text().catch(() => "");

    if (!res.ok) {
      await custDoc.ref.set(
        {
          smoove: {
            lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
            lastOk: false,
            lastError: respText || `HTTP ${res.status}`,
            lastEventAttempted: event,
          },
        },
        { merge: true }
      );

      return NextResponse.json(
        { ok: false, error: "Webhook failed", status: res.status },
        { status: 502 }
      );
    }

    // 8) Success
    await custDoc.ref.set(
      {
        smoove: {
          lastSentAt: admin.firestore.FieldValue.serverTimestamp(),
          lastOk: true,
          lastEventSent: event,
          lastAddressSent: normStr(customer.address),
          lastHandlerSent: handlerName,
          lastFlags: flags,
        },
      },
      { merge: true }
    );

    return NextResponse.json({
      ok: true,
      event,
      handler: handlerName,
      flags,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
