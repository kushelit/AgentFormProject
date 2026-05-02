/**
 * app/api/gemelnet/data/route.ts
 *
 * GET — מחזיר Map מאוחד של גמל נט + פנסיה נט לצד הלקוח
 */

import { NextResponse } from "next/server";
import { loadCombinedMapFromFirestore } from "@/lib/pension/gemelNetStorage";

export async function GET() {
  try {
    const result = await loadCombinedMapFromFirestore();

    if (result.totalEntries === 0) {
      return NextResponse.json({ exists: false }, { status: 404 });
    }

    const entries = Array.from(result.map.values());

    return NextResponse.json({
      exists: true,
      entries,
      gemelUpdatedAt: result.gemelUpdatedAt?.toISOString() ?? null,
      pensiaUpdatedAt: result.pensiaUpdatedAt?.toISOString() ?? null,
      totalEntries: result.totalEntries,
    });
  } catch (err) {
    // console.error("GemelNet data GET error:", err);
    return NextResponse.json({ error: "שגיאה" }, { status: 500 });
  }
}