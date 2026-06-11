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

  const canSave = !!selectedAgentId && !!phoneNumberId && !!accessToken && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const fn = httpsCallable(functions, 'saveAgentWhatsAppConfig');
      await fn({ agentId: selectedAgentId, phoneNumberId, accessToken });
      setDialog({ type: 'success', title: 'נשמר בהצלחה', message: `הוגדר WhatsApp עבור הסוכן.` });
      setPhoneNumberId('');
      setAccessToken('');
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
            <label className="block font-semibold mb-1">Access Token (קבוע):</label>
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