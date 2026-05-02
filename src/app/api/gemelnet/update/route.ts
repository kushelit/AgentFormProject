/**
 * app/api/gemelnet/update/route.ts
 *
 * POST — מקבל XML מגמל נט או פנסיה נט ושומר ל-Firestore
 *        query param: ?type=gemel (ברירת מחדל) או ?type=pensia
 *
 * GET  — מחזיר סטטוס שני הדוקומנטים
 */

import { NextRequest, NextResponse } from "next/server";
import { parseGemelNetXmlServer } from "@/lib/pension/parseGemelNet";
import {
  saveGemelNetToFirestore,
  savePensiaNetToFirestore,
  loadGemelNetFromFirestore,
  loadPensiaNetFromFirestore,
} from "@/lib/pension/gemelNetStorage";

export async function GET() {
  try {
    const [gemel, pensia] = await Promise.all([
      loadGemelNetFromFirestore(),
      loadPensiaNetFromFirestore(),
    ]);

    return NextResponse.json({
      gemel: gemel
        ? {
            exists: true,
            updatedAt: gemel.updatedAt?.toISOString() ?? null,
            entryCount: gemel.entryCount,
            periodFrom: gemel.periodFrom,
            periodTo: gemel.periodTo,
          }
        : { exists: false },
      pensia: pensia
        ? {
            exists: true,
            updatedAt: pensia.updatedAt?.toISOString() ?? null,
            entryCount: pensia.entryCount,
            periodFrom: pensia.periodFrom,
            periodTo: pensia.periodTo,
          }
        : { exists: false },
    });
  } catch (err) {
    // console.error("GemelNet GET error:", err);
    return NextResponse.json({ error: "שגיאה" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") ?? "gemel"; // "gemel" או "pensia"

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "לא נשלח קובץ" }, { status: 400 });
    }

    const xmlText = await (file as File).text();
    const map = await parseGemelNetXmlServer(xmlText);

    if (map.size === 0) {
      return NextResponse.json({ error: "לא נמצאו נתונים בקובץ" }, { status: 400 });
    }

    if (type === "pensia") {
      await savePensiaNetToFirestore(map);
    } else {
      await saveGemelNetToFirestore(map);
    }

    const firstEntry = map.values().next().value;

    return NextResponse.json({
      success: true,
      type,
      entryCount: map.size,
      periodFrom: firstEntry?.periodFrom ?? "",
      periodTo: firstEntry?.periodTo ?? "",
    });
  } catch (err) {
    // console.error("GemelNet POST error:", err);
    return NextResponse.json({ error: "שגיאה בעיבוד הקובץ" }, { status: 500 });
  }
}