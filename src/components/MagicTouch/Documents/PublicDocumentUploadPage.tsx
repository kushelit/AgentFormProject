"use client";

import React, {useCallback, useEffect, useMemo, useState} from "react";
import {httpsCallable} from "firebase/functions";
import {functions} from "@/lib/firebase/firebase";

type DocumentType = "identity_card_front" | "identity_card_back";

type RequestInfo = {
  contactName: string;
  status: string;
  uploadedDocuments: Record<string, {documentId?: string}>;
};

async function compressImage(file: File): Promise<{mimeType: string; base64Data: string}> {
  const image = await createImageBitmap(file);
  const maxSide = 1800;
  const ratio = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * ratio));
  canvas.height = Math.max(1, Math.round(image.height * ratio));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("לא ניתן לעבד את התמונה");
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.86)
  );
  if (!blob) throw new Error("לא ניתן לעבד את התמונה");
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("לא ניתן לקרוא את התמונה"));
    reader.readAsDataURL(blob);
  });
  return {mimeType: "image/jpeg", base64Data: dataUrl.split(",")[1] || ""};
}

function UploadCard({
  title,
  subtitle,
  uploaded,
  busy,
  onFile,
}: {
  title: string;
  subtitle: string;
  uploaded: boolean;
  busy: boolean;
  onFile: (file: File) => void;
}) {
  const inputId = useMemo(() => `file_${Math.random().toString(36).slice(2)}`, []);
  return (
    <label
      htmlFor={inputId}
      className={`block cursor-pointer rounded-2xl border-2 border-dashed p-5 transition ${
        uploaded ? "border-emerald-300 bg-emerald-50" : "border-blue-200 bg-blue-50/40 hover:border-blue-400"
      } ${busy ? "pointer-events-none opacity-60" : ""}`}
    >
      <input
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = "";
        }}
      />
      <div className="flex items-center gap-4">
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl text-xl ${uploaded ? "bg-emerald-100" : "bg-white"}`}>
          {busy ? "⏳" : uploaded ? "✓" : "📷"}
        </div>
        <div>
          <div className="font-bold text-slate-900">{title}</div>
          <div className="mt-1 text-sm text-slate-500">
            {busy ? "מעלה את התמונה..." : uploaded ? "התמונה הועלתה. ניתן ללחוץ לצילום מחדש." : subtitle}
          </div>
        </div>
      </div>
    </label>
  );
}

export default function PublicDocumentUploadPage({agentId, requestId, token}: {
  agentId: string;
  requestId: string;
  token: string;
}) {
  const [info, setInfo] = useState<RequestInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyType, setBusyType] = useState<DocumentType | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const callable = httpsCallable(functions, "getMagicTouchDocumentRequestPublic");
      const response: any = await callable({agentId, requestId, token});
      setInfo(response.data as RequestInfo);
    } catch (err: any) {
      setError(err?.message || "הקישור אינו זמין או שפג תוקפו");
    } finally {
      setLoading(false);
    }
  }, [agentId, requestId, token]);

  useEffect(() => {
    load();
  }, [load]);

  const upload = async (documentType: DocumentType, file: File) => {
    setBusyType(documentType);
    setError("");
    try {
      const compressed = await compressImage(file);
      const callable = httpsCallable(functions, "uploadMagicTouchDocumentPublic");
      await callable({
        agentId,
        requestId,
        token,
        documentType,
        mimeType: compressed.mimeType,
        base64Data: compressed.base64Data,
      });
      await load();
    } catch (err: any) {
      setError(err?.message || "העלאת התמונה נכשלה. נסו שוב.");
    } finally {
      setBusyType(null);
    }
  };

  const completed = info?.status === "completed";
  const frontUploaded = Boolean(info?.uploadedDocuments?.identity_card_front?.documentId);
  const backUploaded = Boolean(info?.uploadedDocuments?.identity_card_back?.documentId);

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-8 font-sans">
      <div className="mx-auto max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
        <div className="bg-gradient-to-l from-blue-700 to-blue-600 px-6 py-7 text-white">
          <div className="text-sm text-blue-100">העלאת מסמכים מאובטחת</div>
          <h1 className="mt-1 text-2xl font-bold">צילום תעודת זהות</h1>
          <p className="mt-2 text-sm leading-6 text-blue-100">
            יש לצלם תמונה ברורה של הצד הקדמי ושל הצד האחורי. התמונות מועברות באופן מאובטח לסוכן המטפל.
          </p>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="py-16 text-center text-slate-500">טוען את הבקשה...</div>
          ) : error && !info ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-center text-red-700">{error}</div>
          ) : completed ? (
            <div className="py-10 text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-4xl text-emerald-700">✓</div>
              <h2 className="mt-5 text-xl font-bold text-slate-900">המסמכים התקבלו בהצלחה</h2>
              <p className="mt-2 text-sm text-slate-500">תודה, אין צורך בפעולה נוספת.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="mb-5 text-sm text-slate-600">
                שלום {info?.contactName || ""}, לחצו על כל אזור כדי לפתוח את המצלמה.
              </div>

              <UploadCard
                title="צד קדמי של תעודת הזהות"
                subtitle="צלמו את הצד שבו מופיעים התמונה והפרטים"
                uploaded={frontUploaded}
                busy={busyType === "identity_card_front"}
                onFile={(file) => upload("identity_card_front", file)}
              />

              <UploadCard
                title="צד אחורי של תעודת הזהות"
                subtitle="צלמו את הצד האחורי באופן מלא וברור"
                uploaded={backUploaded}
                busy={busyType === "identity_card_back"}
                onFile={(file) => upload("identity_card_back", file)}
              />

              {error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
              ) : null}

              <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
                לפני הצילום ודאו שכל התעודה נמצאת בתוך המסגרת, ללא השתקפות וללא טשטוש.
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
