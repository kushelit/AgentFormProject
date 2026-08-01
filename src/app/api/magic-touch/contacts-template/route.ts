import { NextResponse } from 'next/server';

import {
  generateMagicTouchContactsTemplateExcel,
} from '@/utils/generateMagicTouchContactsTemplateExcel';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const {
      buffer,
      filename,
    } =
      await generateMagicTouchContactsTemplateExcel();

    const fileBuffer =
      Buffer.isBuffer(buffer)
        ? buffer
        : Buffer.from(
            buffer as ArrayBuffer
          );

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

        'Content-Disposition':
          `attachment; filename="magic-touch-contacts-template.xlsx"; filename*=UTF-8''${encodeURIComponent(
            filename
          )}`,

        'Cache-Control':
          'no-store',
      },
    });
  } catch (error) {
    console.error(
      '[MagicTouch contacts template] Failed',
      error
    );

    return NextResponse.json(
      {
        error:
          'Failed to generate Magic Touch contacts template',
      },
      {
        status: 500,
      }
    );
  }
}