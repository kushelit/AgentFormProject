import { doc, getDoc, type Firestore } from "firebase/firestore";

const decodeFirestoreFieldKey = (s: string) =>
  String(s).replaceAll("__SLASH__", "/");

export type CommissionTemplateConfig = {
  id: string;
  fields: Record<string, string>;
  fallbackProduct: string;
  companyId?: string;
  companyName?: string; // ✅ חדש
  Name?: string;
  type?: string;
  commissionIncludesVAT?: boolean;
};

export async function getCommissionTemplateConfig(
  db: Firestore,
  templateId: string
): Promise<CommissionTemplateConfig | null> {
  if (!templateId) {
    throw new Error("getCommissionTemplateConfig called without templateId");
  }

  const snap = await getDoc(doc(db, "commissionTemplates", templateId));
  if (!snap.exists()) return null;

  const data: any = snap.data() || {};
  const rawFields = data.fields || {};

  const finalFields =
    templateId === "meitav_insurance"
      ? Object.fromEntries(
          Object.entries(rawFields).map(([excelCol, systemField]) => [
            decodeFirestoreFieldKey(excelCol),
            systemField,
          ])
        )
      : rawFields;

  // ✅ שליפת שם החברה
  let companyName = "";
  if (data.companyId) {
    try {
      const companySnap = await getDoc(
        doc(db, "company", String(data.companyId))
      );
      if (companySnap.exists()) {
        companyName = String(companySnap.data()?.companyName || "").trim();
      }
    } catch (err) {
      console.error(
        "[getCommissionTemplateConfig] failed to load company name",
        err
      );
    }
  }

  return {
    id: snap.id,
    fields: finalFields,
    fallbackProduct: String(data.fallbackProduct || "").trim(),
    companyId: data.companyId,
    companyName, // ✅ כאן חוזר בפועל
    Name: data.Name,
    type: data.type,
    commissionIncludesVAT: !!data.commissionIncludesVAT,
  };
}