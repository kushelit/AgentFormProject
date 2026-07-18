'use client';
// components/DealFormModal/DealFormModal.tsx

import React, { useState, useEffect, useRef, useMemo, FormEvent } from 'react';
import { collection, query, where, getDocs, getDoc, doc, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from '@/lib/firebase/AuthContext';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import useFetchMD from '@/hooks/useMD';
import useEditableTable from '@/hooks/useEditableTable';
import fetchDataForAgent from '@/services/fetchDataForAgent';
import fetchCustomerBelongToAgent from '@/services/fetchCustomerBelongToAgent';
import { useValidation } from '@/hooks/useValidation';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { useToast } from '@/hooks/useToast';
import { ToastNotification } from '@/components/ToastNotification';
import { CombinedData, Customer } from '@/types/Sales';
import { Button } from '@/components/Button/Button';
import confetti from 'canvas-confetti';
import './DealFormModal.css';

// ─── Types ─────────────────────────────────────────────────────────────────

export type DealFormInitialCustomer = {
  IDCustomer: string;
  firstNameCustomer: string;
  lastNameCustomer: string;
  phone?: string;
};

type DealFormModalProps = {
  /** הסוכן שהמודל יפתח איתו כברירת מחדל בעסקה חדשה. ניתן לשינוי בתוך הטופס (למנהל). */
  defaultAgentId: string;
  /** אם מגיעים מלקוח שכבר נבחר (למשל מדף שרון) — ימולא אוטומטית */
  initialCustomer?: DealFormInitialCustomer | null;
  /** מזהה עסקה קיימת לעריכה. אם ריק — נפתח במצב "עסקה חדשה" */
  editingSaleId?: string | null;
  onClose: () => void;
  /** נקרא אחרי שמירה/עדכון מוצלחים, כדי שהקומפוננטה הקוראת תרענן את הנתונים שלה */
  onSaved: () => void;
  /** קונפטי + צליל בהוספת עסקה חדשה. ברירת מחדל: מופעל */
  enableCelebration?: boolean;
};

// ─── Component ───────────────────────────────────────────────────────────────

const DealFormModal: React.FC<DealFormModalProps> = ({
  defaultAgentId,
  initialCustomer = null,
  editingSaleId = null,
  onClose,
  onSaved,
  enableCelebration = true,
}) => {
  const { user, detail } = useAuth();
  const { toasts, addToast, setToasts } = useToast();

  const {
    agents,
    workers,
    companies,
    workerNameMap,
    fetchWorkersForSelectedAgent,
  } = useFetchAgentData();

  const {
    products,
    selectedProductGroup,
    setSelectedProductGroup,
    statusPolicies,
    productToGroupMap,
    sourceLeadMap,
    fetchSourceLeadMap,
  } = useFetchMD();

  const { errors, setErrors, handleValidatedEditChange } = useValidation();
  const { prefs } = useUserPreferences(user?.uid);

  const canManageAgency3Fields = String(detail?.agencyId ?? '') === '3';
  const [paymentStatusOptions, setPaymentStatusOptions] = useState<{ id: string; name: string }[]>([]);
  const [depositStatusOptions, setDepositStatusOptions] = useState<{ id: string; name: string }[]>([]);

  const [submitDisabled, setSubmitDisabled] = useState(false);
  const [validateAllFields, setValidateAllFields] = useState(false);
  const [invalidFields, setInvalidFields] = useState<string[]>([]);
  const [shouldValidate, setShouldValidate] = useState(false);

  const celebrationSoundRef = useRef<HTMLAudioElement | null>(null);

  // ─── resetForm (זהה בהתנהגותה למקור ב-NewAgentForm) ───────────────────────
  const resetForm = (clearCustomerFields: boolean = false) => {
    const resetField = (field: keyof CombinedData, value: any) => handleEditChange(field, value);

    if (clearCustomerFields) {
      resetField('workerId', '');
      resetField('firstNameCustomer', '');
      resetField('lastNameCustomer', '');
      resetField('IDCustomer', '');
      resetField('phone', '');
      resetField('mail', '');
      resetField('address', '');
      resetField('birthday' as any, '');
      resetField('gender' as any, '');
      resetField('sourceValue' as any, '');
    }

    resetField('company', '');
    resetField('product', '');
    resetField('insPremia', '');
    resetField('pensiaPremia', '');
    resetField('pensiaZvira', '');
    resetField('finansimPremia', '');
    resetField('finansimZvira', '');
    resetField('mounth', '');
    resetField('minuySochen', false);
    resetField('statusPolicy', '');
    resetField('notes', '');
    resetField('policyNumber', '');
    resetField('cancellationDate', '');
    resetField('hekefPaid' as any, '');
    resetField('niudPaid' as any, '');
    resetField('depositStatus' as any, '');

    setInvalidFields([]);
    setErrors({});
  };

  const {
    editingRow,
    editData,
    setEditData,
    setRowForEditing,
    handleEditChange,
    saveChanges,
    cancelEdit,
  } = useEditableTable<CombinedData>({
    dbCollection: 'sales',
    // ⚠️ בכוונה בלי agentId: המודל עורך/יוצר עסקה בודדת, ואין סיבה
    // לשלם את המחיר של טעינת כל העסקאות+לקוחות של הסוכן (fetchDataForAgent
    // עושה שני full collection scans + join). ראו setRowForEditing למטה.
    fetchData: fetchDataForAgent,
    onCloseModal: onClose,
    resetForm,
  });

  // ─── אתחול: טעינת עסקה קיימת לעריכה, או מילוי מראש לעסקה חדשה ─────────────
  // בעריכה: שולפים ישירות את מסמך העסקה הבודד (getDoc), בלי לגעת ב-fetchDataForAgent
  // (שמביא את כל העסקאות+לקוחות של הסוכן ומבצע join — יקר ומיותר לעריכת רשומה אחת).
  const [isFetchingDeal, setIsFetchingDeal] = useState(false);
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    if (!editingSaleId) {
      setEditData((prev: any) => ({
        ...prev,
        AgentId: defaultAgentId,
        IDCustomer: initialCustomer?.IDCustomer || '',
        firstNameCustomer: initialCustomer?.firstNameCustomer || '',
        lastNameCustomer: initialCustomer?.lastNameCustomer || '',
        phone: initialCustomer?.phone || '',
      }));
      return;
    }

    (async () => {
      setIsFetchingDeal(true);
      try {
        const snap = await getDoc(doc(db, 'sales', editingSaleId));
        if (snap.exists()) {
          const row = { id: snap.id, ...(snap.data() as any) } as CombinedData;
          setRowForEditing(row);
        } else {
          addToast('error', 'העסקה לא נמצאה');
          onClose();
        }
      } catch {
        addToast('error', 'שגיאה בטעינת העסקה');
      } finally {
        setIsFetchingDeal(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isEditModeLoading = !!editingSaleId && (isFetchingDeal || !editingRow);

  // ─── מילוי אוטומטי של פרטי לקוח בעריכה ─────────────────────────────────
  // מסמך העסקה עצמו לא כולל phone/mail/address/birthday/gender/sourceValue
  // (אלה נשמרים רק על מסמך הלקוח) — אז לאחר טעינת העסקה, משלימים אותם
  // מתוך רשומת הלקוח, בלי לדרוס ערך שכבר מולא ידנית.
  useEffect(() => {
    const run = async () => {
      if (!editingRow) return;
      const idCustomer = String((editData as any)?.IDCustomer ?? '').trim();
      const agentIdInForm = String((editData as any)?.AgentId ?? defaultAgentId ?? '').trim();
      if (!idCustomer || !agentIdInForm) return;

      const customerData = await fetchCustomerBelongToAgent(idCustomer, agentIdInForm);
      if (!customerData) return;

      setEditData((prev: any) => ({
        ...prev,
        phone: prev.phone || customerData.phone || '',
        mail: prev.mail || customerData.mail || '',
        address: prev.address || customerData.address || '',
        birthday: prev.birthday || (customerData as any).birthday || '',
        gender: prev.gender || (customerData as any).gender || '',
        sourceValue: prev.sourceValue || (customerData as any).sourceValue || '',
      }));
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingRow, (editData as any)?.IDCustomer, (editData as any)?.AgentId]);

  // ─── רשימת עובדים + מקור ליד תמיד לפי הסוכן שנבחר בפועל בטופס ─────────────
  // (בכוונה מנותק מהפילטר של עמוד-האב, כדי שהמודל יהיה עצמאי ושמיש בכל מקום)
  useEffect(() => {
    const agentIdInForm = editData.AgentId || defaultAgentId;
    if (agentIdInForm) {
      fetchWorkersForSelectedAgent?.(agentIdInForm);
      fetchSourceLeadMap?.(agentIdInForm);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editData.AgentId, defaultAgentId]);

  useEffect(() => {
    const audio = new Audio('/assets/sounds/soundEffect.mp3');
    celebrationSoundRef.current = audio;
  }, []);

  // ─── שדות ייחודיים לסוכנות 3 ────────────────────────────────────────────
  useEffect(() => {
    const loadAgency3Metadata = async () => {
      try {
        const paymentSnap = await getDocs(collection(db, 'mdPaymentStatus'));
        const depositSnap = await getDocs(collection(db, 'mdDepositStatus'));
        setPaymentStatusOptions(paymentSnap.docs.map((d) => ({ id: d.id, name: String(d.data().name || '').trim() })));
        setDepositStatusOptions(depositSnap.docs.map((d) => ({ id: d.id, name: String(d.data().name || '').trim() })));
      } catch {
        // ignore
      }
    };
    if (canManageAgency3Fields) {
      loadAgency3Metadata();
    } else {
      setPaymentStatusOptions([]);
      setDepositStatusOptions([]);
    }
  }, [canManageAgency3Fields]);

  // ─── קבוצת מוצר לפי המוצר הנבחר ────────────────────────────────────────
  useEffect(() => {
    if (!editData.product) {
      setSelectedProductGroup('');
      return;
    }
    const selectedGroupId = productToGroupMap[editData.product.trim()] || '';
    setSelectedProductGroup(selectedGroupId);
  }, [editData.product, productToGroupMap]);

  // ─── ולידציה ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!shouldValidate) return;
    const requiredTextFields: (keyof CombinedData)[] = ['firstNameCustomer', 'lastNameCustomer', 'IDCustomer'];
    requiredTextFields.forEach((field) => {
      const fieldValue = (editData[field as keyof CombinedData] as string) ?? '';
      handleValidatedEditChange(field as string, fieldValue, setEditData, setErrors);
    });
    setShouldValidate(false);
  }, [shouldValidate]);

  const validateAllRequiredFields = (newData?: typeof editData) => {
    const dataToValidate = newData || editData;
    const missingFields: string[] = [];
    if (!dataToValidate.AgentId?.trim()) missingFields.push('AgentId');
    if (!dataToValidate.workerId?.trim()) missingFields.push('workerId');
    if (!dataToValidate.firstNameCustomer?.trim()) missingFields.push('firstNameCustomer');
    if (!dataToValidate.lastNameCustomer?.trim()) missingFields.push('lastNameCustomer');
    if (!dataToValidate.IDCustomer?.trim()) missingFields.push('IDCustomer');
    if (!dataToValidate.company?.trim()) missingFields.push('company');
    if (!dataToValidate.product?.trim()) missingFields.push('product');
    if (!dataToValidate.statusPolicy?.trim()) missingFields.push('statusPolicy');
    if (!dataToValidate.mounth?.trim()) missingFields.push('mounth');
    setInvalidFields(missingFields);
  };

  const handleDealEditChange = (field: keyof CombinedData, value: CombinedData[keyof CombinedData]) => {
    handleEditChange(field, value);
    if (validateAllFields) validateAllRequiredFields();
  };

  useEffect(() => {
    if (validateAllFields) {
      validateAllRequiredFields();
      setShouldValidate(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validateAllFields]);

  // ─── עזרים ──────────────────────────────────────────────────────────────
  const triggerConfetti = () => {
    confetti({
      particleCount: 300,
      spread: 180,
      startVelocity: 60,
      gravity: 1,
      ticks: 400,
      origin: { x: 0.5, y: 0 },
      colors: ['#ff7f50', '#87cefa', '#daa520', '#32cd32', '#6a5acd'],
      shapes: ['circle', 'square'],
      scalar: 1.8,
    });
  };

  const handleIDBlur = async () => {
    if (!editData.IDCustomer) return;
    const agentIdInForm = editData.AgentId || defaultAgentId;
    const customerData: Customer | null = await fetchCustomerBelongToAgent(editData.IDCustomer, agentIdInForm);
    if (customerData) {
      handleEditChange('firstNameCustomer', customerData.firstNameCustomer || '');
      handleEditChange('lastNameCustomer', customerData.lastNameCustomer || '');
      handleEditChange('phone', customerData.phone || '');
      handleEditChange('mail', customerData.mail || '');
      handleEditChange('address', customerData.address || '');
      handleEditChange('birthday' as any, (customerData as any).birthday || '');
      handleEditChange('gender' as any, (customerData as any).gender || '');
      handleEditChange('sourceValue' as any, (customerData as any).sourceValue || '');
    }
  };

  // ─── שמירה: עסקה חדשה ───────────────────────────────────────────────────
  const handleSubmit = async (event: FormEvent<HTMLFormElement>, closeAfterSubmit = false) => {
    event.preventDefault();
    if (submitDisabled) return;
    setSubmitDisabled(true);

    const agentIdToUse = editData.AgentId || defaultAgentId;

    try {
      const customerQuery = query(
        collection(db, 'customer'),
        where('IDCustomer', '==', editData.IDCustomer),
        where('AgentId', '==', agentIdToUse)
      );
      const customerSnapshot = await getDocs(customerQuery);
      let customerDocRef;

      if (customerSnapshot.empty) {
        customerDocRef = await addDoc(collection(db, 'customer'), {
          AgentId: agentIdToUse,
          firstNameCustomer: editData.firstNameCustomer || '',
          lastNameCustomer: editData.lastNameCustomer || '',
          IDCustomer: editData.IDCustomer || '',
          parentID: '',
          birthday: editData.birthday || '',
          gender: (editData.gender as any) || '',
          phone: editData.phone || '',
          mail: editData.mail || '',
          address: editData.address || '',
          sourceValue: (editData as any).sourceValue || '',
        });
        await updateDoc(customerDocRef, { parentID: customerDocRef.id });
        addToast('success', 'לקוח התווסף בהצלחה');
      } else {
        customerDocRef = customerSnapshot.docs[0].ref;
        const patch: any = {};
        if (editData.firstNameCustomer) patch.firstNameCustomer = editData.firstNameCustomer;
        if (editData.lastNameCustomer) patch.lastNameCustomer = editData.lastNameCustomer;
        if (editData.phone) patch.phone = editData.phone;
        if (editData.mail) patch.mail = editData.mail;
        if (editData.address) patch.address = editData.address;
        if (editData.birthday) patch.birthday = editData.birthday;
        if (editData.gender) patch.gender = editData.gender;
        if ((editData as any).sourceValue) patch.sourceValue = (editData as any).sourceValue;
        if (Object.keys(patch).length) {
          await updateDoc(customerDocRef, patch);
        }
      }

      const agentName = agents.find((a) => a.id === agentIdToUse)?.name || '';
      const workerName = workerNameMap[editData.workerId ?? ''] || '';

      await addDoc(collection(db, 'sales'), {
        agent: agentName,
        AgentId: agentIdToUse,
        workerId: editData.workerId || '',
        workerName,
        firstNameCustomer: editData.firstNameCustomer || '',
        lastNameCustomer: editData.lastNameCustomer || '',
        IDCustomer: editData.IDCustomer || '',
        company: editData.company || '',
        product: editData.product || '',
        insPremia: editData.insPremia || 0,
        pensiaPremia: editData.pensiaPremia || 0,
        pensiaZvira: editData.pensiaZvira || 0,
        finansimPremia: editData.finansimPremia || 0,
        finansimZvira: editData.finansimZvira || 0,
        mounth: editData.mounth || '',
        cancellationDate: editData.cancellationDate || '',
        minuySochen: !!editData.minuySochen,
        statusPolicy: editData.statusPolicy || '',
        notes: editData.notes || '',
        policyNumber: editData.policyNumber || '',
        createdAt: serverTimestamp(),
        lastUpdateDate: serverTimestamp(),
        hekefPaid: canManageAgency3Fields ? String((editData as any).hekefPaid || '') : '',
        niudPaid: canManageAgency3Fields ? String((editData as any).niudPaid || '') : '',
        depositStatus: canManageAgency3Fields ? String((editData as any).depositStatus || '') : '',
      });

      addToast('success', 'יש!!! עוד עסקה נוספה');

      if (enableCelebration) {
        triggerConfetti();
        if (prefs.soundOnSuccess) {
          celebrationSoundRef.current?.play().catch(() => {});
        }
      }

      // סנכרון CRM (זהה למקור)
      fetch('/api/integrations/smoove/sync-customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: agentIdToUse, IDCustomer: editData.IDCustomer }),
      }).catch(() => {});

      resetForm(closeAfterSubmit);
      onSaved();

      if (closeAfterSubmit) {
        onClose();
      }
    } catch (error) {
      addToast('error', 'שגיאה בשמירת העסקה');
    } finally {
      setSubmitDisabled(false);
    }
  };

  // ─── שמירה: עריכת עסקה קיימת ────────────────────────────────────────────
  const handleSave = async () => {
    await saveChanges();
    onSaved();
  };

  const canSubmit = useMemo(() => {
    return (
      (editData.AgentId || '').trim() !== '' &&
      (editData.workerId || '').trim() !== '' &&
      (editData.firstNameCustomer || '').trim() !== '' &&
      (editData.lastNameCustomer || '').trim() !== '' &&
      (editData.IDCustomer || '').trim() !== '' &&
      (editData.company || '').trim() !== '' &&
      (editData.product || '').trim() !== '' &&
      (editData.statusPolicy || '').trim() !== '' &&
      (editData.mounth || '').trim() !== ''
    );
  }, [
    editData.AgentId,
    editData.workerId,
    editData.firstNameCustomer,
    editData.lastNameCustomer,
    editData.IDCustomer,
    editData.company,
    editData.product,
    editData.statusPolicy,
    editData.mounth,
  ]);

  const shouldShowCancellationDate =
    !!editData.statusPolicy && !['פעילה', 'הצעה'].includes(editData.statusPolicy);

  const handleClose = () => {
    cancelEdit(true);
    onClose();
  };

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="dfm-overlay" onClick={handleClose}>
      <div className="dfm-content" onClick={(e) => e.stopPropagation()}>
        <button className="dfm-close" onClick={handleClose} type="button" aria-label="סגור">✖</button>

        <form onSubmit={(e) => e.preventDefault()}>
          <div className="dfm-title">{editingRow ? 'עריכת עסקה' : 'עסקה חדשה'}</div>

          {isEditModeLoading ? (
            <div style={{ padding: '48px 0', textAlign: 'center', color: '#888', fontSize: 13 }}>
              טוען פרטי עסקה...
            </div>
          ) : (
          <>
          {/* פרטים אישיים */}
          <section className="dfm-section">
            <h3 className="dfm-section-title">פרטים אישיים</h3>
            <div className="dfm-grid">
              <div className="dfm-group">
                <label className="dfm-label">סוכנות *</label>
                <select
                  value={editData.AgentId || ''}
                  onChange={(e) => handleEditChange('AgentId', e.target.value)}
                >
                  {detail?.role === 'admin' && <option value="">בחר סוכן</option>}
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>{agent.name}</option>
                  ))}
                </select>
              </div>

              <div className="dfm-group">
                <label className="dfm-label">עובד *</label>
                <select
                  value={editData.workerId || ''}
                  onChange={(e) => handleDealEditChange('workerId', e.target.value)}
                  className={invalidFields.includes('workerId') ? 'dfm-input-error' : ''}
                >
                  <option value="">בחר עובד</option>
                  {workers.map((worker) => (
                    <option key={worker.id} value={worker.id}>{worker.name}</option>
                  ))}
                </select>
                {invalidFields.includes('workerId') && (
                  <div className="dfm-error-message">חובה לבחור עובד</div>
                )}
              </div>

              <div className="dfm-group">
                <label className="dfm-label">תעודת זהות *</label>
                <input
                  type="text"
                  value={editData.IDCustomer || ''}
                  onChange={(e) => handleValidatedEditChange('IDCustomer', e.target.value, setEditData, setErrors)}
                  onBlur={handleIDBlur}
                  className={errors.IDCustomer ? 'dfm-input-error' : ''}
                />
                {errors.IDCustomer && <div className="dfm-error-message">{errors.IDCustomer}</div>}
              </div>

              <div className="dfm-group">
                <label className="dfm-label">שם פרטי *</label>
                <input
                  type="text"
                  value={editData.firstNameCustomer || ''}
                  onChange={(e) => handleValidatedEditChange('firstNameCustomer', e.target.value, setEditData, setErrors)}
                  onBlur={(e) => {
                    handleValidatedEditChange('firstNameCustomer', e.target.value, setEditData, setErrors);
                    if (validateAllFields) validateAllRequiredFields();
                  }}
                  className={errors.firstNameCustomer ? 'dfm-input-error' : ''}
                />
                {errors.firstNameCustomer && <div className="dfm-error-message">{errors.firstNameCustomer}</div>}
              </div>

              <div className="dfm-group">
                <label className="dfm-label">שם משפחה *</label>
                <input
                  type="text"
                  value={editData.lastNameCustomer || ''}
                  onChange={(e) => handleValidatedEditChange('lastNameCustomer', e.target.value, setEditData, setErrors)}
                  onBlur={(e) => {
                    handleValidatedEditChange('lastNameCustomer', e.target.value, setEditData, setErrors);
                    if (validateAllFields) validateAllRequiredFields();
                  }}
                  className={errors.lastNameCustomer ? 'dfm-input-error' : ''}
                />
                {errors.lastNameCustomer && <div className="dfm-error-message">{errors.lastNameCustomer}</div>}
              </div>

              <div className="dfm-group">
                <label className="dfm-label">תאריך לידה</label>
                <input
                  type="date"
                  value={editData.birthday || ''}
                  onChange={(e) => handleEditChange('birthday', e.target.value)}
                />
              </div>

              <div className="dfm-group">
                <label className="dfm-label">מגדר</label>
                <select
                  value={(editData.gender as any) || ''}
                  onChange={(e) => handleEditChange('gender' as any, e.target.value as any)}
                >
                  <option value="">לא נבחר</option>
                  <option value="זכר">זכר</option>
                  <option value="נקבה">נקבה</option>
                </select>
              </div>

              <div className="dfm-group">
                <label className="dfm-label">טלפון</label>
                <input type="tel" value={editData.phone || ''} onChange={(e) => handleEditChange('phone', e.target.value)} />
              </div>

              <div className="dfm-group">
                <label className="dfm-label">דואר אלקטרוני</label>
                <input type="email" value={editData.mail || ''} onChange={(e) => handleEditChange('mail', e.target.value)} />
              </div>

              <div className="dfm-group">
                <label className="dfm-label">כתובת</label>
                <input type="text" value={editData.address || ''} onChange={(e) => handleEditChange('address', e.target.value)} />
              </div>

              <div className="dfm-group">
                <label className="dfm-label">מקור ליד</label>
                <select
                  value={(editData as any).sourceValue || ''}
                  onChange={(e) => handleEditChange('sourceValue' as any, e.target.value)}
                >
                  <option value="">לא נבחר</option>
                  {Object.entries(sourceLeadMap || {}).map(([value, label]) => (
                    <option key={value} value={value}>{label as string}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* פרטי עסקה */}
          <section className="dfm-section">
            <h3 className="dfm-section-title">פרטי עסקה</h3>
            <div className="dfm-grid">
              <div className="dfm-group">
                <label className="dfm-label">חברה *</label>
                <select
                  value={editData.company || ''}
                  onChange={(e) => handleDealEditChange('company', e.target.value)}
                  className={invalidFields.includes('company') ? 'dfm-input-error' : ''}
                >
                  <option value="">בחר חברה</option>
                  {companies.map((companyName, index) => (
                    <option key={index} value={companyName}>{companyName}</option>
                  ))}
                </select>
                {invalidFields.includes('company') && <div className="dfm-error-message">חובה לבחור חברה</div>}
              </div>

              <div className="dfm-group">
                <label className="dfm-label">מוצר *</label>
                <select
                  value={editData.product || ''}
                  onChange={(e) => handleDealEditChange('product', e.target.value)}
                  className={invalidFields.includes('product') ? 'dfm-input-error' : ''}
                >
                  <option value="">בחר מוצר</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.name}>{product.name}</option>
                  ))}
                </select>
                {invalidFields.includes('product') && <div className="dfm-error-message">חובה לבחור מוצר</div>}
              </div>

              <div className="dfm-group">
                <label className="dfm-label">מספר פוליסה (לא חובה)</label>
                <input
                  type="text"
                  value={editData.policyNumber || ''}
                  onChange={(e) => handleEditChange('policyNumber', e.target.value)}
                  placeholder="לדוגמה: 1234567"
                />
              </div>

              {selectedProductGroup && selectedProductGroup !== '1' && selectedProductGroup !== '4' && selectedProductGroup !== '6' && (
                <div className="dfm-group">
                  <label className="dfm-label" htmlFor="dfm-insPremia">פרמיה ביטוח</label>
                  <input
                    type="number"
                    id="dfm-insPremia"
                    value={editData.insPremia || ''}
                    onChange={(e) => handleEditChange('insPremia', e.target.value)}
                  />
                </div>
              )}

              {selectedProductGroup && selectedProductGroup !== '3' && selectedProductGroup !== '4' && selectedProductGroup !== '5' && selectedProductGroup !== '6' && (
                <div className="dfm-group">
                  <label className="dfm-label" htmlFor="dfm-pensiaPremia">פרמיה פנסיה</label>
                  <input
                    type="number"
                    id="dfm-pensiaPremia"
                    value={editData.pensiaPremia || ''}
                    onChange={(e) => handleEditChange('pensiaPremia', e.target.value)}
                  />
                </div>
              )}

              {selectedProductGroup && selectedProductGroup !== '3' && selectedProductGroup !== '4' && selectedProductGroup !== '5' && (
                <div className="dfm-group">
                  <label className="dfm-label" htmlFor="dfm-pensiaZvira">צבירה פנסיה</label>
                  <input
                    type="number"
                    id="dfm-pensiaZvira"
                    value={editData.pensiaZvira || ''}
                    onChange={(e) => handleEditChange('pensiaZvira', e.target.value)}
                  />
                </div>
              )}

              {selectedProductGroup && selectedProductGroup !== '1' && selectedProductGroup !== '3' && selectedProductGroup !== '5' && selectedProductGroup !== '6' && (
                <div className="dfm-group">
                  <label className="dfm-label" htmlFor="dfm-finansimPremia">פרמיה פיננסים</label>
                  <input
                    type="number"
                    id="dfm-finansimPremia"
                    value={editData.finansimPremia || ''}
                    onChange={(e) => handleEditChange('finansimPremia', e.target.value)}
                  />
                </div>
              )}

              {selectedProductGroup && selectedProductGroup !== '1' && selectedProductGroup !== '3' && selectedProductGroup !== '5' && selectedProductGroup !== '6' && (
                <div className="dfm-group">
                  <label className="dfm-label" htmlFor="dfm-finansimZvira">צבירה פיננסים</label>
                  <input
                    type="number"
                    id="dfm-finansimZvira"
                    value={editData.finansimZvira || ''}
                    onChange={(e) => handleEditChange('finansimZvira', e.target.value)}
                  />
                </div>
              )}

              <div className="dfm-group">
                <label className="dfm-label">סטטוס עסקה *</label>
                <select
                  value={editData.statusPolicy || ''}
                  onChange={(e) => handleDealEditChange('statusPolicy', e.target.value)}
                  className={invalidFields.includes('statusPolicy') ? 'dfm-input-error' : ''}
                >
                  <option value="">בחר סטאטוס</option>
                  {statusPolicies.map((status, index) => (
                    <option key={index} value={status}>{status}</option>
                  ))}
                </select>
                {invalidFields.includes('statusPolicy') && <div className="dfm-error-message">חובה לבחור סטטוס</div>}
              </div>

              <div className="dfm-group">
                <label className="dfm-label">תאריך תפוקה *</label>
                <input
                  type="date"
                  value={editData.mounth || ''}
                  onChange={(e) => handleDealEditChange('mounth', e.target.value)}
                  onBlur={() => {
                    setValidateAllFields(true);
                    validateAllRequiredFields();
                  }}
                  className={invalidFields.includes('mounth') ? 'dfm-input-error' : ''}
                />
              </div>

              {shouldShowCancellationDate && (
                <div className="dfm-group">
                  <label className="dfm-label">תאריך ביטול</label>
                  <input
                    type="date"
                    value={editData.cancellationDate || ''}
                    onChange={(e) => handleEditChange('cancellationDate', e.target.value)}
                  />
                </div>
              )}

              <div className="dfm-checkbox-row">
                <input
                  type="checkbox"
                  checked={!!editData.minuySochen}
                  onChange={(e) => handleEditChange('minuySochen', e.target.checked)}
                  id="dfm-minuySochen"
                />
                <label htmlFor="dfm-minuySochen">מינוי סוכן</label>
              </div>

              {canManageAgency3Fields && (
                <>
                  <div className="dfm-group">
                    <label className="dfm-label">שולם היקף</label>
                    <select
                      value={(editData as any).hekefPaid || ''}
                      onChange={(e) => handleEditChange('hekefPaid' as any, e.target.value)}
                    >
                      <option value="">בחר ערך</option>
                      {paymentStatusOptions.map((opt) => (
                        <option key={opt.id} value={opt.name}>{opt.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="dfm-group">
                    <label className="dfm-label">שולם ניוד</label>
                    <select
                      value={(editData as any).niudPaid || ''}
                      onChange={(e) => handleEditChange('niudPaid' as any, e.target.value)}
                    >
                      <option value="">בחר ערך</option>
                      {paymentStatusOptions.map((opt) => (
                        <option key={opt.id} value={opt.name}>{opt.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="dfm-group">
                    <label className="dfm-label">סטטוס הפקדה</label>
                    <select
                      value={(editData as any).depositStatus || ''}
                      onChange={(e) => handleEditChange('depositStatus' as any, e.target.value)}
                    >
                      <option value="">בחר ערך</option>
                      {depositStatusOptions.map((opt) => (
                        <option key={opt.id} value={opt.name}>{opt.name}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div className="dfm-group dfm-group--full">
                <label className="dfm-label">הערות</label>
                <textarea
                  value={editData.notes || ''}
                  onChange={(e) => handleEditChange('notes', e.target.value)}
                  rows={4}
                />
              </div>
            </div>
          </section>

          {/* כפתורי פעולה */}
          <div className="dfm-actions">
            {editingRow ? (
              <div className="dfm-actions-right">
                <Button onClick={handleSave} text="שמור שינויים" type="primary" icon="on" disabled={!editingRow} />
              </div>
            ) : (
              <div className="dfm-actions-right">
                <Button
                  onClick={(e) => handleSubmit(e, false)}
                  text="הזן"
                  type="primary"
                  icon="on"
                  disabled={!canSubmit || submitDisabled}
                  state={!canSubmit ? 'disabled' : 'default'}
                />
                <Button
                  onClick={(e) => handleSubmit(e, true)}
                  text="הזן וסיים"
                  type="primary"
                  icon="on"
                  disabled={!canSubmit || submitDisabled}
                  state={!canSubmit ? 'disabled' : 'default'}
                />
              </div>
            )}
            <div className="dfm-actions-left">
              <Button onClick={handleClose} text="בטל" type="secondary" icon="off" state="default" />
            </div>
          </div>
          </>
          )}
        </form>
      </div>

      {toasts.length > 0 && toasts.map((toast) => (
        <ToastNotification
          key={toast.id}
          type={toast.type}
          className={toast.isHiding ? 'hide' : ''}
          message={toast.message}
          onClose={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
        />
      ))}
    </div>
  );
};

export default DealFormModal;
