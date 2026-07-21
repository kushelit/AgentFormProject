import { NextResponse } from "next/server";
import { admin } from "@/lib/firebase/firebase-admin";
import { generateElementaryTemplateExcel } from "@/utils/generateElementaryTemplateExcel";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agentId") || "";

    if (!agentId) {
      return NextResponse.json({ error: "missing agentId" }, { status: 400 });
    }

    const db = admin.firestore();

    // ⚠️ agentId שווה תמיד ל-uid של הסוכן עצמו (גם כשהצופה הנוכחי הוא עובד שלו),
    // ולכן users/{agentId} הוא תמיד מסמך הסוכן, עם agencies נכון ברמת הסוכנות.
    // זה מקור אמת מהשרת — לא תלוי במה שהלקוח שולח.
    const userDoc = await db.collection("users").doc(agentId).get();
    const agencyId = String(userDoc.data()?.agencies ?? "");
    const isAgency4 = agencyId === "4";

    const [companySnap, groupSnap, productSnap, referrersSnap, statusSnap] = await Promise.all([
      db.collection("company").where("supportsElementary", "==", true).get(),
      db.collection("elementaryProductGroups").orderBy("order").get(),
      db.collection("elementaryProducts").orderBy("order").get(),
      isAgency4
        ? db.collection("agentReferrers").where("agentId", "==", agentId).get()
        : Promise.resolve(null),
      isAgency4
        ? db.collection("statusPolicy").where("isActive", "==", "1").get()
        : Promise.resolve(null),
    ]);

    const companies = companySnap.docs.map((d) => ({
      id: d.id,
      companyName: String(d.data().companyName || ""),
      elementaryManual: d.data().elementaryManual ?? false,
    }));

    const groups = groupSnap.docs.map((d) => ({
      id: d.id,
      label: String(d.data().label || ""),
      order: d.data().order,
    }));

    const products = productSnap.docs.map((d) => ({
      id: d.id,
      label: String(d.data().label || ""),
      productGroupId: String(d.data().productGroupId || ""),
      hasMozalTrack: d.data().hasMozalTrack ?? false,
      isManual: d.data().isManual ?? false,
      order: d.data().order,
    }));

    const referrers = referrersSnap
      ? referrersSnap.docs.map((d) => ({
          id: d.id,
          name: String(d.data().name || ""),
          active: d.data().active ?? false,
        }))
      : [];

    const statusPolicies = statusSnap
      ? statusSnap.docs.map((d) => String(d.data().statusName || "")).filter(Boolean)
      : [];

    const { buffer, filename } = await generateElementaryTemplateExcel({
      agentId,
      isAgency4,
      companies,
      groups,
      products,
      statusPolicies,
      referrers,
    });

    const fileBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as ArrayBuffer);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="elementary-template.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("elementary-template download error:", error);
    return NextResponse.json(
      { error: "Failed to generate elementary template" },
      { status: 500 }
    );
  }
}