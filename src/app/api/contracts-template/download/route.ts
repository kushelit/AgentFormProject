import { NextResponse } from "next/server";
import { admin } from "@/lib/firebase/firebase-admin";
import { CONTRACTS_TABLES_CONFIG } from "@/config/contractsTablesConfig";
import { generateContractsTemplateExcel } from "@/components/NewManageContractsTables/generateContractsTemplateExcel";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agentId") || "";

    const db = admin.firestore();

    const [companySnap, groupSnap, productSnap] = await Promise.all([
      db.collection("company").get(),
      db.collection("productsGroup").get(),
      db.collection("product").get(),
    ]);

    const companies = companySnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    const groups = groupSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    const products = productSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    let contracts: any[] = [];
    if (agentId) {
      const contractsSnap = await db
        .collection("contracts")
        .where("AgentId", "==", agentId)
        .get();
      contracts = contractsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }

    const companiesById = new Map(
      companies.map((company: any) => [String(company.id), company])
    );

    const companiesByGroup: Record<string, any[]> = {};

    groups.forEach((group: any) => {
      companiesByGroup[String(group.id)] = Array.isArray(group.companyIds)
        ? group.companyIds
            .map((id: string) => companiesById.get(String(id)))
            .filter(Boolean)
        : [];
    });

    const { buffer, filename } = await generateContractsTemplateExcel({
      tables: CONTRACTS_TABLES_CONFIG,
      companiesByGroup,
      contracts,
      agentId,
      products,
    });

    const fileBuffer = Buffer.isBuffer(buffer)
      ? buffer
      : Buffer.from(buffer as ArrayBuffer);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    // console.error("contracts-template download error:", error);
    return NextResponse.json(
      { error: "Failed to generate contracts template" },
      { status: 500 }
    );
  }
}