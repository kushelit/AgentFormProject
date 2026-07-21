import { NextResponse } from "next/server";
import { admin } from "@/lib/firebase/firebase-admin";
import { generateRiskTemplateExcel } from "@/utils/generateRiskTemplateExcel";

export const runtime = "nodejs";

const PENSION_FINANCE_GROUPS = ["1", "4", "6"]; // כל השאר = סיכונים

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agentId") || "";

    if (!agentId) {
      return NextResponse.json({ error: "missing agentId" }, { status: 400 });
    }

    const db = admin.firestore();

    const userDoc = await db.collection("users").doc(agentId).get();
    const agencyId = String(userDoc.data()?.agencies ?? "");
    const isAgency4 = agencyId === "4";

    const [
      companySnap, productSnap, statusSnap, workerSnap, sourceLeadSnap,
      referrersSnap, paymentSnap, depositSnap,
    ] = await Promise.all([
      db.collection("company").get(),
      db.collection("product").get(),
      db.collection("statusPolicy").where("isActive", "==", "1").get(),
      db.collection("users").where("agentId", "==", agentId).where("role", "in", ["worker", "agent", "manager"]).get(),
      db.collection("sourceLead").where("AgentId", "==", agentId).where("statusLead", "==", true).get(),
      isAgency4 ? db.collection("agentReferrers").where("agentId", "==", agentId).get() : Promise.resolve(null),
      !isAgency4 ? db.collection("mdPaymentStatus").get() : Promise.resolve(null),
      !isAgency4 ? db.collection("mdDepositStatus").get() : Promise.resolve(null),
    ]);

    const companies = companySnap.docs.map((d) => String(d.data().companyName || "")).filter(Boolean);

    const products = productSnap.docs
      .map((d) => ({
        id: d.id,
        name: String(d.data().productName || ""),
        productGroup: String(d.data().productGroup ?? ""),
      }))
      .filter((p) => !PENSION_FINANCE_GROUPS.includes(p.productGroup));

    const statusPolicies = statusSnap.docs.map((d) => String(d.data().statusName || "")).filter(Boolean);

    const workerNames = workerSnap.docs.map((d) => String(d.data().name || "")).filter(Boolean);

    const sourceLeadNames = sourceLeadSnap.docs.map((d) => String(d.data().sourceLead || "")).filter(Boolean);

    const referrers = referrersSnap
      ? referrersSnap.docs.map((d) => ({ id: d.id, name: String(d.data().name || ""), active: d.data().active ?? false }))
      : [];

    const paymentStatusOptions = paymentSnap
      ? paymentSnap.docs.map((d) => ({ id: d.id, name: String(d.data().name || "") }))
      : [];

    const depositStatusOptions = depositSnap
      ? depositSnap.docs.map((d) => ({ id: d.id, name: String(d.data().name || "") }))
      : [];

    const { buffer, filename } = await generateRiskTemplateExcel({
      agentId,
      isAgency4,
      companies,
      products,
      statusPolicies,
      workerNames,
      sourceLeadNames,
      paymentStatusOptions,
      depositStatusOptions,
      referrers,
    });

    const fileBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as ArrayBuffer);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="risk-template.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("risk-template download error:", error);
    return NextResponse.json({ error: "Failed to generate risk template" }, { status: 500 });
  }
}