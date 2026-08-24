import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.redirect(
    'https://firebasestorage.googleapis.com/v0/b/agentsale-693e8.firebasestorage.app/o/public-marketing%2Fcommissions%2Fautomatic-commissions.mp4?alt=media&token=e4b3d4d5-c8f3-4064-9a56-a354325e6e7d'
  );
}