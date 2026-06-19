'use client';

import React, { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { Button } from '@/components/Button/Button';
import AdminGuard from '@/app/admin/_components/AdminGuard';
import DialogNotification from '@/components/DialogNotification';

type Agent = { id: string; name: string };
type DialogKind = 'info' | 'warning' | 'success' | 'error';
type DialogState = { type: DialogKind; title: string; message: string };

export default function WhatsAppConfigPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [updateGlobalToken, setUpdateGlobalToken] = useState(false);
  const [accessToken, setAccessToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, 'users'));
      const list: Agent[] = snap.docs.map((d) => {
        const data: any = d.data();
        return {
          id: d.id,
          name: data.fullName || data.displayName || data.name || d.id,
        };
      });
      list.sort((a, b) => a.name.localeCompare(b.name, 'he'));
      setAgents(list);
    })();
  }, []);

  const canSave =
    !!selectedAgentId &&
    !!phoneNumberId &&
    (!updateGlobalToken || !!accessToken) &&
    !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const fn = httpsCallable(functions, 'saveAgentWhatsAppConfig');
      await fn({
        agentId: selectedAgentId,
        phoneNumberId,
        templateName: templateName.trim() || undefined,
        accessToken: updateGlobalToken ? accessToken : undefined,
      });
      setDialog({
        type: 'success',
        title: 'נשמר בהצלחה',
        message: updateGlobalToken
          ? 'הוגדרו פרטי הסוכן וגם עודכן הטוקן הגלובלי לכל הסוכנים.'
          : 'הוגדרו פרטי WhatsApp עבור הסוכן.',
      });
      setPhoneNumberId('');
      setTemplateName('');
      setAccessToken('');
      setUpdateGlobalToken(false);
      setSelectedAgentId('');
    } catch (e: any) {
      setDialog({ type: 'error', title: 'שגיאה', message: String(e?.message || e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminGuard>
      <div className="p-6 max-w-2xl mx-auto text-right" dir="rtl">
        <h1 className="text-2xl font-bold mb-4">⚙️ הגדרת WhatsApp לסוכן</h1>

        <div className="border rounded p-4 bg-white space-y-4">

          <div>
            <label className="block font-semibold mb-1">סוכן:</label>
            <select
              className="border rounded px-2 py-2 w-full"
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
            >
              <option value="">בחר/י סוכן</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold mb-1">Phone Number ID:</label>
            <input
              className="border rounded px-2 py-2 w-full font-mono"
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              placeholder="1076301525576644"
            />
            <p className="text-xs text-gray-400 mt-1">
              נמצא ב: Meta for Developers → WhatsApp → API Setup → Phone Number ID
            </p>
          </div>

          <div>
            <label className="block font-semibold mb-1">שם תבנית (Template Name):</label>
            <input
              className="border rounded px-2 py-2 w-full font-mono"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="meir_reengagement_initial"
            />
            <p className="text-xs text-gray-400 mt-1">
              שם ה-template המאושר עבור ה-WABA של הסוכן הזה
            </p>
          </div>

          <div className="border-t pt-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={updateGlobalToken}
                onChange={(e) => setUpdateGlobalToken(e.target.checked)}
              />
              <span className="font-semibold">עדכן את הטוקן הגלובלי (משותף לכל הסוכנים)</span>
            </label>

            {updateGlobalToken && (
              <div className="mt-2">
                <textarea
                  className="border rounded px-2 py-2 w-full font-mono text-xs"
                  rows={3}
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="הדבק/י את ה-Permanent Access Token"
                />
                <p className="text-xs text-gray-400 mt-1">
                  נמצא ב: Meta Business Suite → System Users → Generate Token
                </p>
                <p className="text-xs text-red-500 mt-1">
                  ⚠️ זה ישנה את הטוקן עבור כל הסוכנים במערכת, לא רק עבור הסוכן הנבחר.
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button
              text={saving ? '⏳ שומר...' : 'שמור'}
              type="primary"
              onClick={handleSave}
              disabled={!canSave}
            />
          </div>
        </div>

        {dialog && (
          <DialogNotification
            type={dialog.type}
            title={dialog.title}
            message={dialog.message}
            onConfirm={() => setDialog(null)}
            confirmText="סגור"
            hideCancel
          />
        )}
      </div>
    </AdminGuard>
  );
}
