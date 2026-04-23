import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    // 🔐 בדיקת SECRET

    //Name: PROSAAS_WEBHOOK_SECRET
    //Value: prosaas_8fK39xL2pQ7

    
    const apiKey = req.headers.get('x-api-key');
    const expectedKey = process.env.PROSAAS_WEBHOOK_SECRET;

    if (!expectedKey) {
      console.error('Missing PROSAAS_WEBHOOK_SECRET in env');
      return NextResponse.json(
        { ok: false, error: 'Server misconfigured' },
        { status: 500 }
      );
    }

    if (apiKey !== expectedKey) {
      console.warn('Unauthorized webhook attempt');
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const contentType = req.headers.get('content-type') || '';

    console.log('=== PROSAAS WEBHOOK START ===');
    console.log('Content-Type:', contentType);

    // 🧼 לא מדפיסים headers מלאים כדי לא לחשוף סודות
    console.log('Has API Key:', !!apiKey);

    // ===== JSON =====
    if (contentType.includes('application/json')) {
      const body = await req.json();
      console.log('JSON BODY:', body);

      return NextResponse.json({
        ok: true,
        receivedAs: 'json',
      });
    }

    // ===== MULTIPART =====
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();

      const fields: Record<string, string> = {};
      const files: Array<{
        fieldName: string;
        fileName: string;
        mimeType: string;
        size: number;
      }> = [];

      for (const [key, value] of formData.entries()) {
        if (value instanceof File) {
          files.push({
            fieldName: key,
            fileName: value.name,
            mimeType: value.type,
            size: value.size,
          });
        } else {
          fields[key] = String(value);
        }
      }

      console.log('FORM FIELDS:', fields);
      console.log('FILES:', files);

      return NextResponse.json({
        ok: true,
        receivedAs: 'multipart',
        fieldsCount: Object.keys(fields).length,
        filesCount: files.length,
      });
    }

    return NextResponse.json(
      {
        ok: false,
        error: 'Unsupported content-type',
      },
      { status: 400 }
    );
  } catch (error) {
    console.error('PROSAAS WEBHOOK ERROR:', error);

    return NextResponse.json(
      {
        ok: false,
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}