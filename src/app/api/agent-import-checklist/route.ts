import { NextRequest, NextResponse } from "next/server";
import { admin } from "@/lib/firebase/firebase-admin";

type RunDoc = {
  agentId: string;
  companyId?: string;     // string/number
  templateId?: string;    // doc id
  reportMonths?: string[]; // ["YYYY-MM", ...]
  reportMonth?: string;    // fallback ישן
  status?: string;
};

type TemplateDoc = {
  companyId?: string | number;
  Name?: string;   // ✅ זה השם שאת משתמשת בו ב-UI
  type?: string;   // fallback
  isactive?: boolean;
};

type CompanyDoc = {
  companyName?: string; // ✅ זה השם שאת משתמשת בו ב-UI
};

function buildMonthsForYear(year: number) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const maxMonth = year === currentYear ? now.getMonth() + 1 : 12;

  const months: string[] = [];
  for (let m = 1; m <= maxMonth; m++) {
    months.push(`${year}-${String(m).padStart(2, "0")}`);
  }
  return months;
}

export async function POST(req: NextRequest) {
  try {
    const { agentId, year } = await req.json();
    if (!agentId || !year) {
      return NextResponse.json(
        { ok: false, error: "missing agentId/year" },
        { status: 400 }
      );
    }

    const y = Number(year);
    const months = buildMonthsForYear(y);

    const db = admin.firestore();

    // 1) טמפלטים פעילים בלבד (כמו ב-UI)
    const templatesSnap = await db
      .collection("commissionTemplates")
      .where("isactive", "==", true)
      .get();

    const templates: Array<{
      templateId: string;      // docId
      templateName: string;    // Name || type || docId
      companyId: string;       // normalized string
    }> = [];

    const companyIdsSet = new Set<string>();


    const normMonth = (m: any) => {
      if (!m) return "";
      const s = String(m).replace(/\//g, "-").trim();
      if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7);
      return s;
    };
    

    templatesSnap.forEach((d) => {
      const data = d.data() as TemplateDoc;
      if (!data?.companyId) return;

      const companyId = String(data.companyId);
      companyIdsSet.add(companyId);

      templates.push({
        templateId: d.id,
        templateName: (data.Name || data.type || d.id).toString(),
        companyId,
      });
    });

    // 2) מפת חברות: company/{companyId}.companyName
    const companyNameById: Record<string, string> = {};
    const companyIds = Array.from(companyIdsSet);

    // getAll בבאצ'ים כדי לא לעשות await בתוך לולאה
    const CHUNK = 450;
    for (let i = 0; i < companyIds.length; i += CHUNK) {
      const slice = companyIds.slice(i, i + CHUNK);
      const refs = slice.map((id) => db.collection("company").doc(id));
      const snaps = await db.getAll(...refs);

      snaps.forEach((snap) => {
        if (!snap.exists) return;
        const data = snap.data() as CompanyDoc;
        const id = snap.id;
        companyNameById[id] = (data?.companyName || id).toString();
      });
    }

    // 3) Runs של אותו סוכן
    const runsSnap = await db
      .collection("commissionImportRuns")
      .where("agentId", "==", agentId)
      .get();

    const runs: RunDoc[] = [];
    runsSnap.forEach((d) => runs.push(d.data() as RunDoc));

    // 4) loadedByTemplateMonth: key = companyId__templateId => Set(month)
    const loadedByTemplateMonth = new Map<string, Set<string>>();

    for (const r of runs) {
      const companyId = r.companyId ? String(r.companyId) : "";
      const templateId = r.templateId ? String(r.templateId) : "";
      if (!companyId || !templateId) continue;

      // תומך גם בישן: reportMonth יחיד
      const reportMonths = Array.isArray(r.reportMonths) && r.reportMonths.length
        ? r.reportMonths
        : r.reportMonth
          ? [r.reportMonth]
          : [];

          for (const raw of reportMonths) {
            const m = normMonth(raw);
            if (!m) continue;
            if (!m.startsWith(`${y}-`)) continue;
          
            const key = `${companyId}__${templateId}`;
            if (!loadedByTemplateMonth.has(key)) loadedByTemplateMonth.set(key, new Set());
            loadedByTemplateMonth.get(key)!.add(m);
          }
          
    }

    // 5) Group templates by companyId
    const templatesByCompany: Record<
      string,
      Array<{ templateId: string; templateName: string }>
    > = {};

    for (const t of templates) {
      if (!templatesByCompany[t.companyId]) templatesByCompany[t.companyId] = [];
      templatesByCompany[t.companyId].push({
        templateId: t.templateId,
        templateName: t.templateName,
      });
    }

    // 6) Build rows: חברה -> חודשים (V/X) + דריל לתבניות
    const companyIdsSorted = Object.keys(templatesByCompany).sort((a, b) => {
      const an = companyNameById[a] || a;
      const bn = companyNameById[b] || b;
      return an.localeCompare(bn, "he");
    });

    const rows = companyIdsSorted.map((companyId) => {
      const companyName = companyNameById[companyId] || companyId;
      const tList = templatesByCompany[companyId] || [];

      const templatesMatrix = tList.map((t) => {
        const key = `${companyId}__${t.templateId}`;
        const set = loadedByTemplateMonth.get(key) || new Set<string>();

        const byMonth: Record<string, boolean> = {};
        for (const m of months) byMonth[m] = set.has(m);

        return {
          templateId: t.templateId,
          templateName: t.templateName,
          byMonth,
        };
      });

      const companyByMonth: Record<string, boolean> = {};
      for (const m of months) {
        companyByMonth[m] = tList.length > 0 && templatesMatrix.every((tm) => tm.byMonth[m]);
      }
      

      return {
        companyId,
        companyName,
        byMonth: companyByMonth,
        templates: templatesMatrix,
      };
    });

    return NextResponse.json({
      ok: true,
      agentId,
      year: y,
      months,
      rows,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "unknown" },
      { status: 500 }
    );
  }
}
