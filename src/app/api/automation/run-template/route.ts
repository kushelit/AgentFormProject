import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    const { templateId, options } = await req.json();
    const db = admin.firestore();

    const templateDoc = await db.collection('commissionTemplates').doc(templateId).get();
    if (!templateDoc.exists) {
      return NextResponse.json({ error: 'תבנית לא קיימת' }, { status: 404 });
    }

    const className = templateDoc.data()?.automationClass;
    if (!className || !/^[a-zA-Z0-9_\-]+$/.test(className)) {
      return NextResponse.json({ error: 'שם קלאס לא תקני או חסר' }, { status: 400 });
    }

    console.log(`🚀 Running automation: ${className} for template ${templateId}`);

    const ClassModule = await import(`@/automation/${className}`);
    if (!ClassModule?.default) {
      return NextResponse.json({ error: 'מחלקת אוטומציה לא קיימת בקובץ' }, { status: 500 });
    }

    const automationInstance = new ClassModule.default();
    await automationInstance.run(options);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('❌ שגיאה בהרצה:', error);
    return NextResponse.json({ error: 'שגיאה כללית בהרצה' }, { status: 500 });
  }
}
