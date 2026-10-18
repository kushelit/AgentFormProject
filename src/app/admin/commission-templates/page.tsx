'use client';

// app/admin/commission-templates/page.tsx
// ניהול תבניות טעינה (commissionTemplates): יצירה, שכפול, ייבוא JSON ועריכה.
// שומר רק את המפתחות שהמסך מנהל — שדות אחרים במסמך (productMap וכו') נשארים כמו שהם. אין מחיקה: מכבים עם "פעילה".

import React, { useEffect, useId, useMemo, useState } from 'react';
import { collection, deleteField, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/firebase';
import { useAuth } from '@/lib/firebase/AuthContext';
import AdminGuard from '@/app/admin/_components/AdminGuard';
import {
  EMPTY_DRAFT,
  HEKEF_TYPES,
  KNOWN_SYSTEM_FIELDS,
  changedKeys,
  draftFromData,
  draftFromJson,
  newRowId,
  payloadFromDraft,
  validateDraft,
  type TemplateDraft,
} from '@/components/admin/commissionTemplates/model';

type TemplateItem = { id: string; data: any; companyName: string };

const input = 'w-full border rounded-lg px-3 py-1.5 text-sm';
const label = 'block text-xs font-bold text-slate-500 mb-1';
const card = 'bg-white border border-slate-200 rounded-2xl p-4';

export default function CommissionTemplatesAdminPage() {
  const { detail } = useAuth() as any;

  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [showInactive, setShowInactive] = useState(true);

  const [selectedId, setSelectedId] = useState('');
  const [isNew, setIsNew] = useState(false);
  const [draft, setDraft] = useState<TemplateDraft>(EMPTY_DRAFT);
  const [initial, setInitial] = useState<TemplateDraft>(EMPTY_DRAFT);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // ─── טעינה ─────────────────────────────────────────────────────────
  const load = async () => {
    // בטעינה ישירה של הכתובת Firebase עוד משחזר את ההתחברות — בלי המתנה הבקשה יוצאת בלי זיהוי ונחסמת
    await auth.authStateReady();
    const [tSnap, cSnap] = await Promise.all([getDocs(collection(db, 'commissionTemplates')), getDocs(collection(db, 'company'))]);
    const cs = cSnap.docs.map((d) => ({ id: d.id, name: String((d.data() as any)?.companyName ?? d.id) }));
    cs.sort((a, b) => a.name.localeCompare(b.name, 'he'));
    const byId = Object.fromEntries(cs.map((c) => [c.id, c.name]));
    const list = tSnap.docs.map((d) => {
      const data: any = d.data();
      return { id: d.id, data, companyName: byId[String(data.companyId ?? '')] || '' };
    });
    list.sort((a, b) => `${a.companyName} ${a.data.Name || a.id}`.localeCompare(`${b.companyName} ${b.data.Name || b.id}`, 'he'));
    setCompanies(cs);
    setTemplates(list);
    return list;
  };

  useEffect(() => {
    load()
      .catch((e: any) => setMessage({ type: 'err', text: `טעינת התבניות נכשלה: ${e?.message ?? e}` }))
      .finally(() => setLoading(false));
  }, []);

  const changes = useMemo(() => changedKeys(initial, draft), [initial, draft]);
  const dirty = isNew ? true : changes.length > 0;
  const existingIds = useMemo(() => new Set(templates.map((t) => t.id)), [templates]);
  const issues = useMemo(() => validateDraft(draft, { isNew, existingIds }), [draft, isNew, existingIds]);
  const editing = isNew || !!selectedId;

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (!editing || !dirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [editing, dirty]);

  const systemFieldOptions = useMemo(() => {
    const set = new Set(Object.keys(KNOWN_SYSTEM_FIELDS));
    templates.forEach((t) => Object.values(t.data.fields || {}).forEach((v) => set.add(String(v))));
    return [...set];
  }, [templates]);

  const confirmLeave = () => !editing || !dirty || window.confirm('יש שינויים שלא נשמרו. להמשיך ולאבד אותם?');

  // ─── פעולות ────────────────────────────────────────────────────────
  const selectTemplate = (id: string) => {
    if (!confirmLeave()) return;
    const t = templates.find((x) => x.id === id);
    const d = t ? draftFromData(t.id, t.data) : EMPTY_DRAFT;
    setSelectedId(id);
    setIsNew(false);
    setDraft(d);
    setInitial(d);
    setMessage(null);
  };

  const startNew = (from?: TemplateItem) => {
    if (!confirmLeave()) return;
    const base = from ? { ...draftFromData('', from.data), id: '', automationClass: '', Name: `${from.data.Name || from.id} (העתק)` } : EMPTY_DRAFT;
    setSelectedId('');
    setIsNew(true);
    setDraft(base);
    setInitial(EMPTY_DRAFT);
    setMessage(null);
  };

  const set = <K extends keyof TemplateDraft>(k: K, v: TemplateDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const setId = (id: string) =>
    setDraft((d) => ({ ...d, id, automationClass: !d.automationClass || d.automationClass === d.id ? id : d.automationClass }));

  const importJson = () => {
    try {
      const d = draftFromJson(jsonText, draft.id);
      setDraft({ ...d, id: draft.id || d.id, automationClass: d.automationClass || draft.id || d.id });
      setJsonOpen(false);
      setJsonText('');
      setMessage({ type: 'ok', text: 'ה-JSON נטען לטופס. עוד לא נשמר.' });
    } catch (e: any) {
      setMessage({ type: 'err', text: `JSON לא תקין: ${e?.message ?? e}` });
    }
  };

  const save = async () => {
    if (issues.errors.length) {
      setMessage({ type: 'err', text: 'יש שגיאות שצריך לתקן לפני שמירה' });
      return;
    }
    const payload = payloadFromDraft(draft);
    const who = String(detail?.email || detail?.name || '');
    setSaving(true);
    setMessage(null);
    try {
      if (isNew) {
        const ref = doc(db, 'commissionTemplates', draft.id);
        if ((await getDoc(ref)).exists()) throw new Error(`כבר קיימת תבנית בשם ${draft.id}`);
        if (!window.confirm(`ליצור תבנית חדשה ${draft.id}?`)) return;
        const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined));
        await setDoc(ref, { ...clean, templateCreatedAt: serverTimestamp(), templateCreatedBy: who });
      } else {
        if (!changes.length) return;
        if (!window.confirm(`לשמור שינויים ב-${draft.id}?\n\nשדות שישתנו: ${changes.join(', ')}`)) return;
        const update: Record<string, any> = { templateUpdatedAt: serverTimestamp(), templateUpdatedBy: who };
        changes.forEach((k) => {
          update[k] = payload[k] === undefined ? deleteField() : payload[k];
        });
        await updateDoc(doc(db, 'commissionTemplates', draft.id), update);
      }
      const list = await load();
      const saved = list.find((t) => t.id === draft.id);
      const d = saved ? draftFromData(saved.id, saved.data) : draft;
      setSelectedId(draft.id);
      setIsNew(false);
      setDraft(d);
      setInitial(d);
      setMessage({ type: 'ok', text: 'נשמר' });
    } catch (e: any) {
      setMessage({ type: 'err', text: `השמירה נכשלה: ${e?.message ?? e}` });
    } finally {
      setSaving(false);
    }
  };

  const visible = templates.filter(
    (t) =>
      (showInactive || t.data.isactive) &&
      (!companyFilter || String(t.data.companyId) === companyFilter) &&
      (!search.trim() || `${t.id} ${t.data.Name || ''} ${t.companyName}`.toLowerCase().includes(search.trim().toLowerCase()))
  );
  const selected = templates.find((t) => t.id === selectedId) || null;

  // ─── תצוגה ─────────────────────────────────────────────────────────
  return (
    <AdminGuard>
      <div className="p-6 max-w-[1400px] mx-auto text-right" dir="rtl">
        <h1 className="text-2xl font-bold mb-1">תבניות טעינה</h1>
        <p className="text-sm text-slate-500 mb-5">
          איך כל דוח מהחברות נקרא: איזו עמודה הולכת לאיזה שדה, מאיזו לשונית, ואילו כללים מיוחדים חלים עליו. מפת המוצרים נערכת במסך נפרד.
        </p>

        {!editing && message && (
          <div className={`mb-4 text-sm rounded-lg px-3 py-2 border ${message.type === 'ok' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
            {message.text}
          </div>
        )}

        {/* ─── בחירה ─── */}
        <div className={`${card} mb-5 flex flex-wrap items-end gap-3`}>
          <div className="w-52">
            <label className={label}>חיפוש</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="מזהה או שם" className={input} />
          </div>
          <div className="w-44">
            <label className={label}>חברה</label>
            <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} className={`${input} bg-white`}>
              <option value="">כל החברות</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[280px]">
            <label className={label}>תבנית</label>
            <select value={selectedId} onChange={(e) => selectTemplate(e.target.value)} disabled={loading} className={`${input} bg-white`}>
              <option value="">{loading ? 'טוען…' : `בחירת תבנית לעריכה (${visible.length})`}</option>
              {visible.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.companyName ? `${t.companyName} – ` : ''}{t.data.Name || t.id} · {t.id}
                  {!t.data.isactive ? ' · לא פעילה' : ''}
                  {t.data.hekefType ? ' · היקף' : ''}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer pb-1.5">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            כולל לא פעילות
          </label>
          <div className="flex gap-2 pb-0.5">
            <button type="button" onClick={() => startNew()} className="px-3 py-1.5 rounded-lg text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700">
              + תבנית חדשה
            </button>
            <button type="button" onClick={() => selected && startNew(selected)} disabled={!selected} className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40">
              שכפול התבנית שנבחרה
            </button>
          </div>
        </div>

        {!editing ? (
          <div className="p-10 text-center text-slate-500 border border-dashed rounded-2xl">יש לבחור תבנית לעריכה, או ליצור תבנית חדשה.</div>
        ) : (
          <>
            {/* ─── סרגל שמירה ─── */}
            <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border border-slate-200 rounded-2xl px-4 py-3 mb-5 flex flex-wrap items-center justify-between gap-3 shadow-sm">
              <div className="text-sm">
                <span className="font-bold text-slate-800">{isNew ? 'תבנית חדשה' : draft.Name || draft.id}</span>
                {!isNew && <span className="text-slate-400 font-mono text-xs mr-2" dir="ltr">{draft.id}</span>}
                {isNew ? (
                  <span className="mr-3 text-amber-700 font-bold">● לא נשמרה</span>
                ) : changes.length ? (
                  <span className="mr-3 text-amber-700 font-bold">● שינויים לא שמורים ({changes.length})</span>
                ) : (
                  <span className="mr-3 text-slate-400">אין שינויים</span>
                )}
                {issues.errors.length > 0 && <span className="mr-3 text-red-600">{issues.errors.length} שגיאות</span>}
              </div>
              <div className="flex items-center gap-2">
                {message && <span className={`text-sm ${message.type === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>{message.text}</span>}
                <button type="button" onClick={() => setJsonOpen((o) => !o)} className="px-3 py-1.5 border rounded-lg text-sm">
                  ייבוא מ-JSON
                </button>
                <button
                  type="button"
                  onClick={() => (isNew ? startNew() : selectTemplate(selectedId))}
                  disabled={saving}
                  className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40"
                >
                  בטל שינויים
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={!dirty || saving || issues.errors.length > 0}
                  className="px-4 py-1.5 rounded-lg text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"
                >
                  {saving ? 'שומר…' : isNew ? 'יצירה' : 'שמירה'}
                </button>
              </div>
            </div>

            {jsonOpen && (
              <div className={`${card} mb-5`}>
                <div className="font-bold text-slate-700 mb-2">ייבוא מ-JSON</div>
                <p className="text-xs text-slate-500 mb-2">
                  הדבקת מסמך תבנית. כל השדות בטופס יוחלפו בערכים מה-JSON (מזהה התבנית נשאר מהטופס). אפשר לבדוק ולתקן לפני השמירה.
                </p>
                <textarea
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                  dir="ltr"
                  rows={10}
                  className="w-full border rounded-lg p-2 font-mono text-xs"
                  placeholder='{ "Name": "...", "companyId": "...", "fields": { ... } }'
                />
                <div className="flex gap-2 mt-2">
                  <button type="button" onClick={importJson} disabled={!jsonText.trim()} className="px-3 py-1.5 rounded-lg text-sm font-bold bg-indigo-600 text-white disabled:opacity-40">
                    טעינה לטופס
                  </button>
                  <button type="button" onClick={() => setJsonOpen(false)} className="px-3 py-1.5 border rounded-lg text-sm">סגירה</button>
                </div>
              </div>
            )}

            {(issues.errors.length > 0 || issues.warnings.length > 0) && (
              <div className="mb-5 space-y-1">
                {issues.errors.map((e) => (
                  <div key={e} className="text-sm bg-red-50 text-red-700 border border-red-200 rounded-lg px-3 py-1.5">✖ {e}</div>
                ))}
                {issues.warnings.map((w) => (
                  <div key={w} className="text-sm bg-amber-50 text-amber-800 border border-amber-200 rounded-lg px-3 py-1.5">⚠ {w}</div>
                ))}
              </div>
            )}

            <div className="space-y-5">
              {/* ─── כללי ─── */}
              <div className={card}>
                <div className="font-bold text-slate-700 mb-3">כללי</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className={label}>מזהה תבנית (ID)</label>
                    <input value={draft.id} onChange={(e) => setId(e.target.value.trim())} disabled={!isNew} dir="ltr" placeholder="clal_hekef" className={`${input} font-mono disabled:bg-slate-50`} />
                    {isNew && <div className="text-[11px] text-slate-400 mt-1">לא ניתן לשנות אחרי היצירה</div>}
                  </div>
                  <div>
                    <label className={label}>שם</label>
                    <input value={draft.Name} onChange={(e) => set('Name', e.target.value)} className={input} />
                  </div>
                  <div>
                    <label className={label}>חברה</label>
                    <select value={draft.companyId} onChange={(e) => set('companyId', e.target.value)} className={`${input} bg-white`}>
                      <option value="">בחירת חברה</option>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>{c.name} ({c.id})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={label}>automationClass</label>
                    <input value={draft.automationClass} onChange={(e) => set('automationClass', e.target.value.trim())} dir="ltr" className={`${input} font-mono`} />
                    <div className="text-[11px] text-slate-400 mt-1">בדרך כלל זהה למזהה התבנית</div>
                  </div>
                  <div>
                    <label className={label}>סוג</label>
                    <select value={draft.hekefType} onChange={(e) => set('hekefType', e.target.value)} className={`${input} bg-white`}>
                      {HEKEF_TYPES.map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-2 justify-end pb-1">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={draft.isactive} onChange={(e) => set('isactive', e.target.checked)} />
                      תבנית פעילה
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={draft.commissionIncludesVAT} onChange={(e) => set('commissionIncludesVAT', e.target.checked)} />
                      העמלה בקובץ כוללת מע״מ
                    </label>
                  </div>
                </div>
              </div>

              {/* ─── מיפוי עמודות ─── */}
              <div className={card}>
                <div className="flex items-baseline justify-between mb-3">
                  <div className="font-bold text-slate-700">מיפוי עמודות · {draft.fields.filter((r) => r.a && r.b).length}</div>
                  <div className="text-xs text-slate-500">שם העמודה כפי שהוא בקובץ. אפשר לכתוב &quot;/&quot; רגיל — נשמר אוטומטית בפורמט ש-Firestore מקבל</div>
                </div>
                <PairsEditor
                  rows={draft.fields}
                  onChange={(rows) => set('fields', rows)}
                  aLabel="עמודה באקסל"
                  bLabel="שדה במערכת"
                  bOptions={systemFieldOptions}
                  bHint={(v) => KNOWN_SYSTEM_FIELDS[v]}
                  addLabel="+ עמודה"
                />
              </div>

              {/* ─── קבועים והמרות ─── */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <div className={card}>
                  <div className="font-bold text-slate-700 mb-1">ערכים קבועים (constants)</div>
                  <div className="text-xs text-slate-500 mb-3">ערך שנכתב לכל השורות, כשאין לו עמודה בקובץ. למשל processingType = retro</div>
                  <PairsEditor
                    rows={draft.constants}
                    onChange={(rows) => set('constants', rows)}
                    aLabel="שדה"
                    bLabel="ערך"
                    aOptions={systemFieldOptions}
                    addLabel="+ ערך קבוע"
                  />
                </div>
                <div className={card}>
                  <div className="font-bold text-slate-700 mb-1">המרת ערכים (valueMaps)</div>
                  <div className="text-xs text-slate-500 mb-3">מתרגם ערך מהקובץ לערך אחיד. למשל processingType: RTR ← retro</div>
                  <ValueMapsEditor rows={draft.valueMaps} onChange={(rows) => set('valueMaps', rows)} fieldOptions={systemFieldOptions} />
                </div>
              </div>

              {/* ─── מתקדם ─── */}
              <div className={card}>
                <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="font-bold text-slate-700 w-full text-right">
                  {showAdvanced ? '▾' : '◂'} מתקדם — קובץ, לשונית ותלות בתבניות אחרות
                </button>
                {showAdvanced && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                    <div>
                      <label className={label}>מאותה הורדה של (fromDownloadOf)</label>
                      <select value={draft.fromDownloadOf} onChange={(e) => set('fromDownloadOf', e.target.value)} className={`${input} bg-white`}>
                        <option value="">(הורדה משלה)</option>
                        {templates
                          .filter((t) => t.id !== draft.id && (!draft.companyId || String(t.data.companyId) === draft.companyId))
                          .map((t) => (
                            <option key={t.id} value={t.id}>{t.data.Name || t.id} · {t.id}</option>
                          ))}
                      </select>
                      <div className="text-[11px] text-slate-400 mt-1">קובץ אחר / לשונית אחרת מאותה הורדה של ה-Runner</div>
                    </div>
                    <div>
                      <label className={label}>לשונית בקובץ (sheetName)</label>
                      <input value={draft.sheetName} onChange={(e) => set('sheetName', e.target.value)} placeholder="ריק = הלשונית הראשונה" className={input} />
                    </div>
                    <div>
                      <label className={label}>כשהלשונית חסרה</label>
                      <select value={draft.missingSheetBehavior} onChange={(e) => set('missingSheetBehavior', e.target.value)} className={`${input} bg-white`}>
                        <option value="">שגיאה</option>
                        <option value="empty_ok">אין נתונים החודש — תקין</option>
                      </select>
                    </div>
                    <div>
                      <label className={label}>קובץ מתוך ZIP — חייב להכיל</label>
                      <input value={draft.zipInclude} onChange={(e) => set('zipInclude', e.target.value)} placeholder="למשל: YEADIM" dir="ltr" className={input} />
                    </div>
                    <div>
                      <label className={label}>קובץ מתוך ZIP — לא להכיל</label>
                      <input value={draft.zipExclude} onChange={(e) => set('zipExclude', e.target.value)} placeholder="מופרד בפסיקים" dir="ltr" className={input} />
                    </div>
                    <div>
                      <label className={label}>כשהקובץ חסר ב-ZIP</label>
                      <select value={draft.missingZipEntryBehavior} onChange={(e) => set('missingZipEntryBehavior', e.target.value)} className={`${input} bg-white`}>
                        <option value="">שגיאה</option>
                        <option value="skip">דילוג</option>
                      </select>
                    </div>
                    <div>
                      <label className={label}>דף חשבון חודשי (statementParser)</label>
                      <select value={draft.statementParser} onChange={(e) => set('statementParser', e.target.value)} className={`${input} bg-white`}>
                        <option value="">ללא</option>
                        <option value="clal_hekef">כלל – היקף</option>
                      </select>
                    </div>
                    <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-2 content-end">
                      {(
                        [
                          ['reportMonthFromHeader', 'חודש הדיווח מכותרת הקובץ ("חודש ריצה")'],
                          ['skipZeroCommission', 'לא לשמור שורות עם עמלה 0'],
                          ['agencyHouseOnly', 'רק לבתי סוכן'],
                          ['excludeForAgencyHouse', 'לא לבתי סוכן'],
                          ['manualOnly', 'טעינה ידנית בלבד (לא נספר כדוח צפוי)'],
                        ] as [keyof TemplateDraft, string][]
                      ).map(([k, l]) => (
                        <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="checkbox" checked={draft[k] as boolean} onChange={(e) => set(k, e.target.checked as any)} />
                          {l}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AdminGuard>
  );
}

/* ─── עורך זוגות (מיפוי עמודות / קבועים) ─── */
function PairsEditor(props: {
  rows: { id: string; a: string; b: string }[];
  onChange: (rows: { id: string; a: string; b: string }[]) => void;
  aLabel: string;
  bLabel: string;
  aOptions?: string[];
  bOptions?: string[];
  bHint?: (v: string) => string | undefined;
  addLabel: string;
}) {
  const { rows, onChange } = props;
  const uid = useId();
  const listA = `pa${uid}`;
  const listB = `pb${uid}`;
  const update = (id: string, patch: Partial<{ a: string; b: string }>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  return (
    <div>
      {rows.length > 0 && (
        <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_32px] gap-2 text-xs font-bold text-slate-500 mb-1 px-1">
          <div>{props.aLabel}</div>
          <div>{props.bLabel}</div>
          <div />
        </div>
      )}
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.id} className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_32px] gap-2 items-center">
            <input value={r.a} onChange={(e) => update(r.id, { a: e.target.value })} list={props.aOptions ? listA : undefined} className={input} />
            <div>
              <input value={r.b} onChange={(e) => update(r.id, { b: e.target.value.trim() })} list={props.bOptions ? listB : undefined} dir="ltr" className={`${input} font-mono`} />
              {props.bHint?.(r.b) && <div className="text-[11px] text-slate-400 mt-0.5">{props.bHint(r.b)}</div>}
            </div>
            <button type="button" onClick={() => onChange(rows.filter((x) => x.id !== r.id))} className="text-slate-400 hover:text-red-600 text-lg" aria-label="הסרה">
              ×
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onChange([...rows, { id: newRowId(), a: '', b: '' }])} className="mt-2 text-sm font-bold text-indigo-600">
        {props.addLabel}
      </button>
      {props.aOptions && (
        <datalist id={listA}>{props.aOptions.map((o) => <option key={o} value={o} />)}</datalist>
      )}
      {props.bOptions && (
        <datalist id={listB}>
          {props.bOptions.map((o) => (
            <option key={o} value={o}>{KNOWN_SYSTEM_FIELDS[o] || ''}</option>
          ))}
        </datalist>
      )}
    </div>
  );
}

function ValueMapsEditor(props: {
  rows: { id: string; field: string; from: string; to: string }[];
  onChange: (rows: { id: string; field: string; from: string; to: string }[]) => void;
  fieldOptions: string[];
}) {
  const { rows, onChange } = props;
  const listId = `vm${useId()}`;
  const update = (id: string, patch: Partial<{ field: string; from: string; to: string }>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  return (
    <div>
      {rows.length > 0 && (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_32px] gap-2 text-xs font-bold text-slate-500 mb-1 px-1">
          <div>שדה</div>
          <div>ערך בקובץ</div>
          <div>ערך אחיד</div>
          <div />
        </div>
      )}
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_32px] gap-2 items-center">
            <input value={r.field} onChange={(e) => update(r.id, { field: e.target.value.trim() })} list={listId} dir="ltr" className={`${input} font-mono`} />
            <input value={r.from} onChange={(e) => update(r.id, { from: e.target.value })} className={input} />
            <input value={r.to} onChange={(e) => update(r.id, { to: e.target.value })} dir="ltr" className={input} />
            <button type="button" onClick={() => onChange(rows.filter((x) => x.id !== r.id))} className="text-slate-400 hover:text-red-600 text-lg" aria-label="הסרה">
              ×
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onChange([...rows, { id: newRowId(), field: '', from: '', to: '' }])} className="mt-2 text-sm font-bold text-indigo-600">
        + המרה
      </button>
      <datalist id={listId}>{props.fieldOptions.map((o) => <option key={o} value={o} />)}</datalist>
    </div>
  );
}
