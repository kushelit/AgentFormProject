// app/api/subscription-plans/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest) {
  try {
    const db = admin.firestore();

    const { searchParams } = new URL(req.url);
    const channel = searchParams.get('channel');

    const snapshot = await db
      .collection('subscriptions_permissions')
      .where('isActive', '==', true)
      .get();

    const plans = snapshot.docs
      .map((doc) => {
        const data = doc.data();

        return {
          id: doc.id,
          name: data.name || doc.id,
          price: data.price || 0,
          description:
            data.description ||
            `כולל ${data.permissions?.length || 0} הרשאות, עד ${data.maxUsers || 1} משתמשים`,
          permissions: data.permissions || [],
          maxUsers: data.maxUsers || 1,
          signupChannels: data.signupChannels || ['sale'],
        };
      })
      .filter((plan) => {
        // בלי channel - שומר התנהגות קיימת
        if (!channel) {
          return true;
        }

        return plan.signupChannels.includes(channel);
      });

    return NextResponse.json(plans, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
        'Surrogate-Control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to load plans' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  }
}