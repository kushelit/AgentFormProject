import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "לא נשלח קובץ" }, { status: 400 });

    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
    "Content-Type": "application/json",
    "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",  // ✅ הוסיפי שורה זו
    "anthropic-version": "2023-06-01",                  // ✅ הוסיפי שורה זו
  },
      body: JSON.stringify({
       model: "claude-sonnet-4-5",
        max_tokens: 4000,
        system: `אתה מומחה לניתוח פוליסות ביטוח ישראליות. החזר תמיד JSON בלבד ללא טקסט נוסף.`,
        messages: [{
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
            { type: "text", text: `נתח את דף פרטי הביטוח והחזר JSON במבנה:
{
  "policyNumber": "מספר פוליסה",
  "companyName": "שם חברה",
  "insuredName": "שם מבוטח",
  "idNumber": "ת.ז",
  "coverageAmount": 1500000,
  "coverageStart": "05/2022",
  "coverageEnd": "04/2057",
  "premiumMonthly": 82.47,
  "discountPercent": 65,
  "discountExpiryDate": "12/2026",
  "futurePremiums": [{"date": "05/2027", "premium": 91.21}],
  "irrevocableBeneficiary": "בנק מזרחי טפחות",
  "smokerStatus": "לא מעשן",
  "exclusions": null,
  "coverages": [{"coverageType": "ריסק", "coverageName": "ריסק יסודי", "coverageAmount": 1500000, "premium": 82.47, "premiumType": "חודשית", "startDate": "05/2022", "endDate": "04/2057"}],
  "reportDate": "27/04/2026",
  "parseConfidence": "high"
}` }
          ]
        }]
      })
    });

    const data = await response.json();
    const text = data.content?.filter((b: any) => b.type === "text").map((b: any) => b.text).join("") ?? "";
   
    const clean = text.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();

    const parsed = JSON.parse(clean);

return NextResponse.json({
  ...parsed,
  _usage: {
    input_tokens: data.usage?.input_tokens ?? 0,
    output_tokens: data.usage?.output_tokens ?? 0,
    model: "claude-sonnet-4-5",
  },
});

  } catch (err) {
     console.error("parse-policy error:", err);
    return NextResponse.json({ error: "שגיאה" }, { status: 500 });
  }
}