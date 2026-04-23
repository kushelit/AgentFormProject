import { NextRequest, NextResponse } from "next/server";
import { parseMeslekaPdfBuffer } from "@/lib/pension/parseMeslekaPdfBuffer";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing PDF file" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const rows = await parseMeslekaPdfBuffer(buffer);

    return NextResponse.json({ rows });
  } catch (error) {
    console.error("parse-pdf route error", error);

    const message =
      error instanceof Error ? error.message : "Unknown parse PDF error";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}