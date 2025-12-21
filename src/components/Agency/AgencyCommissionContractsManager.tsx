// /components/Agency/AgencyCommissionContractsManager.tsx
'use client';

import React, { useEffect, useMemo, useState, FormEvent, ChangeEventHandler } from 'react';
import { collection, addDoc, getDocs, query, where, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import useFetchMD from '@/hooks/useMD';
import { Button } from '@/components/Button/Button';
import MenuWrapper from '@/components/MenuWrapper/MenuWrapper';
import Edit from '@/components/icons/Edit/Edit';
import Delete from '@/components/icons/Delete/Delete';
import type { AgencyCommissionContract } from '@/types/AgencyCommissionContract';
import { ToastNotification } from '@/components/ToastNotification';
import { useToast } from '@/hooks/useToast';

interface Props {
  agencyId: string;
}

const AgencyCommissionContractsManager: React.FC<Props> = ({ agencyId }) => {
  const [activeTab, setActiveTab] =
    useState<'contractDefault' | 'contractProduct'>('contractDefault');

  const { toasts, addToast, setToasts } = useToast();

  const {
    productGroupsDB,
    productGroupMap,
    companies,
    products,
    selectedProduct,
    setSelectedProduct,
    selectedProductGroup,
    setSelectedProductGroup,
  } = useFetchMD();

  // ------- סטייט ברירת מחדל (קבוצת מוצר) -------
  const [defaultContracts, setDefaultContracts] = useState<AgencyCommissionContract[]>([]);
  const [selectedProductGroupFilter, setSelectedProductGroupFilter] = useState('');
  const [minuySochenFilter1, setMinuySochenFilter1] = useState('');
  const [minuySochen1, setMinuySochen1] = useState(false);
  const [commissionPercentHekef1, setCommissionPercentHekef1] = useState('');
  const [commissionPercentNifraim1, setCommissionPercentNifraim1] = useState('');
  const [commissionPercentNiud1, setCommissionPercentNiud1] = useState('');
  const [editingDefaultId, setEditingDefaultId] = useState<string | null>(null);
  const [editDefaultData, setEditDefaultData] = useState<Partial<AgencyCommissionContract>>({});
  const [openMenuRowDefault, setOpenMenuRowDefault] = useState<string | null>(null);

  // ------- סטייט מוצר ספציפי -------
  const [productContracts, setProductContracts] = useState<AgencyCommissionContract[]>([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedCompanyFilter, setSelectedCompanyFilter] = useState('');
  const [selectedProductFilter, setSelectedProductFilter] = useState('');
  const [minuySochenFilter2, setMinuySochenFilter2] = useState('');
  const [minuySochen2, setMinuySochen2] = useState(false);
  const [commissionPercentHekef2, setCommissionPercentHekef2] = useState('');
  const [commissionPercentNifraim2, setCommissionPercentNifraim2] = useState('');
  const [commissionPercentNiud2, setCommissionPercentNiud2] = useState('');
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editProductData, setEditProductData] = useState<Partial<AgencyCommissionContract>>({});
  const [openMenuRowProduct, setOpenMenuRowProduct] = useState<string | null>(null);

  const [isModalOpenDefault, setIsModalOpenDefault] = useState(false);
  const [isModalOpenProduct, setIsModalOpenProduct] = useState(false);

  // ---------- עזר להקלדות אחוזים ----------
  const normalizePercentInput = (value: string) =>
    value.replace(/[^0-9.]/g, '').replace(/(\..*?)\..*/g, '$1');

  const handlecommissionPercentHekef1: ChangeEventHandler<HTMLInputElement> = (e) =>
    setCommissionPercentHekef1(normalizePercentInput(e.target.value));

  const handlecommissionPercentNifraim1: ChangeEventHandler<HTMLInputElement> = (e) =>
    setCommissionPercentNifraim1(normalizePercentInput(e.target.value));

  const handlecommissionPercentNiud1: ChangeEventHandler<HTMLInputElement> = (e) =>
    setCommissionPercentNiud1(normalizePercentInput(e.target.value));

  const handlecommissionPercentHekef2: ChangeEventHandler<HTMLInputElement> = (e) =>
    setCommissionPercentHekef2(normalizePercentInput(e.target.value));

  const handlecommissionPercentNifraim2: ChangeEventHandler<HTMLInputElement> = (e) =>
    setCommissionPercentNifraim2(normalizePercentInput(e.target.value));

  const handlecommissionPercentNiud2: ChangeEventHandler<HTMLInputElement> = (e) =>
    setCommissionPercentNiud2(normalizePercentInput(e.target.value));

  // ---------- canSubmit ----------
  const canSubmitDefault = useMemo(
    () =>
      selectedProductGroup?.trim() !== '' &&
      commissionPercentHekef1.trim() !== '' &&
      commissionPercentNifraim1.trim() !== '' &&
      commissionPercentNiud1.trim() !== '',
    [selectedProductGroup, commissionPercentHekef1, commissionPercentNifraim1, commissionPercentNiud1]
  );

  const canSubmitProduct = useMemo(
    () =>
      selectedCompany.trim() !== '' &&
      selectedProduct.trim() !== '' &&
      commissionPercentHekef2.trim() !== '' &&
      commissionPercentNifraim2.trim() !== '' &&
      commissionPercentNiud2.trim() !== '',
    [selectedCompany, selectedProduct, commissionPercentHekef2, commissionPercentNifraim2, commissionPercentNiud2]
  );

  // ---------- טעינה ----------

  const loadDefaultContracts = async () => {
    if (!agencyId) return;
    let qRef = query(
      collection(db, 'agencies', agencyId, 'commissionContracts'),
      where('type', '==', 'default')
    );

    if (selectedProductGroupFilter.trim() !== '') {
      qRef = query(qRef, where('productsGroup', '==', selectedProductGroupFilter));
    }
    if (minuySochenFilter1.trim() !== '') {
      const boolValue = minuySochenFilter1 === 'true';
      qRef = query(qRef, where('minuySochen', '==', boolValue));
    }

    const snap = await getDocs(qRef);
    const data: AgencyCommissionContract[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
    }));
    setDefaultContracts(data);
  };

  const loadProductContracts = async () => {
    if (!agencyId) return;
    let qRef = query(
      collection(db, 'agencies', agencyId, 'commissionContracts'),
      where('type', '==', 'perProduct')
    );

    if (selectedCompanyFilter.trim() !== '') {
      qRef = query(qRef, where('company', '==', selectedCompanyFilter));
    }
    if (selectedProductFilter.trim() !== '') {
      qRef = query(qRef, where('product', '==', selectedProductFilter));
    }
    if (minuySochenFilter2.trim() !== '') {
      const boolValue = minuySochenFilter2 === 'true';
      qRef = query(qRef, where('minuySochen', '==', boolValue));
    }

    const snap = await getDocs(qRef);
    const data: AgencyCommissionContract[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
    }));
    setProductContracts(data);
  };

  useEffect(() => {
    loadDefaultContracts();
  }, [agencyId, selectedProductGroupFilter, minuySochenFilter1]);

  useEffect(() => {
    loadProductContracts();
  }, [agencyId, selectedCompanyFilter, selectedProductFilter, minuySochenFilter2]);

  // ---------- הוספת הסכמי ברירת מחדל ----------
  const resetDefaultForm = () => {
    setSelectedProductGroup('');
    setCommissionPercentHekef1('');
    setCommissionPercentNifraim1('');
    setCommissionPercentNiud1('');
    setMinuySochen1(false);
  };

  const handleSubmitDefault = async (e: FormEvent) => {
    e.preventDefault();
    if (!agencyId || !canSubmitDefault) return;

    // בדיקה שאין כפילות
    const existingQ = query(
      collection(db, 'agencies', agencyId, 'commissionContracts'),
      where('type', '==', 'default'),
      where('productsGroup', '==', selectedProductGroup),
      where('minuySochen', '==', minuySochen1)
    );
    const existingSnap = await getDocs(existingQ);
    if (!existingSnap.empty) {
      addToast('error', 'קיים כבר הסכם ברירת מחדל כזה לבית הסוכן');
      return;
    }

    await addDoc(collection(db, 'agencies', agencyId, 'commissionContracts'), {
      agencyId,
      type: 'default',
      company: '',
      productsGroup: selectedProductGroup,
      product: '',
      commissionHekef: Number(commissionPercentHekef1),
      commissionNifraim: Number(commissionPercentNifraim1),
      commissionNiud: Number(commissionPercentNiud1),
      minuySochen: minuySochen1,
    });

    addToast('success', 'הסכם ברירת מחדל לסוכנות נשמר בהצלחה');
    resetDefaultForm();
    setIsModalOpenDefault(false);
    loadDefaultContracts();
  };

  // ---------- הוספת הסכמי מוצר ----------
  const resetProductForm = () => {
    setSelectedCompany('');
    setSelectedProduct('');
    setCommissionPercentHekef2('');
    setCommissionPercentNifraim2('');
    setCommissionPercentNiud2('');
    setMinuySochen2(false);
  };

  const handleSubmitProduct = async (e: FormEvent) => {
    e.preventDefault();
    if (!agencyId || !canSubmitProduct) return;

    // בדיקת כפילות
    const existingQ = query(
      collection(db, 'agencies', agencyId, 'commissionContracts'),
      where('type', '==', 'perProduct'),
      where('company', '==', selectedCompany),
      where('product', '==', selectedProduct),
      where('minuySochen', '==', minuySochen2)
    );
    const existingSnap = await getDocs(existingQ);
    if (!existingSnap.empty) {
      addToast('error', 'קיים כבר הסכם כזה לבית הסוכן עבור חברה/מוצר אלו');
      return;
    }

    await addDoc(collection(db, 'agencies', agencyId, 'commissionContracts'), {
      agencyId,
      type: 'perProduct',
      company: selectedCompany,
      productsGroup: '',
      product: selectedProduct,
      commissionHekef: Number(commissionPercentHekef2),
      commissionNifraim: Number(commissionPercentNifraim2),
      commissionNiud: Number(commissionPercentNiud2),
      minuySochen: minuySochen2,
    });

    addToast('success', 'הסכם עמלות לפי מוצר נשמר בהצלחה לבית הסוכן');
    resetProductForm();
    setIsModalOpenProduct(false);
    loadProductContracts();
  };

  // ---------- עריכה / מחיקה – ברירת מחדל ----------
  const startEditDefault = (id: string) => {
    const row = defaultContracts.find((c) => c.id === id);
    if (!row) return;
    setEditingDefaultId(id);
    setEditDefaultData(row);
  };

  const handleDefaultChange = (field: keyof AgencyCommissionContract, value: any) => {
    setEditDefaultData((prev) => ({ ...prev, [field]: value }));
  };

  const saveDefaultEdit = async () => {
    if (!agencyId || !editingDefaultId) return;
    const ref = doc(db, 'agencies', agencyId, 'commissionContracts', editingDefaultId);
    await updateDoc(ref, {
      productsGroup: editDefaultData.productsGroup || '',
      commissionHekef: Number(editDefaultData.commissionHekef ?? 0),
      commissionNifraim: Number(editDefaultData.commissionNifraim ?? 0),
      commissionNiud: Number(editDefaultData.commissionNiud ?? 0),
      minuySochen: !!editDefaultData.minuySochen,
    });
    setEditingDefaultId(null);
    setEditDefaultData({});
    loadDefaultContracts();
    addToast('success', 'השינויים נשמרו');
  };

  const cancelDefaultEdit = () => {
    setEditingDefaultId(null);
    setEditDefaultData({});
  };

  const deleteDefaultRow = async (id: string) => {
    if (!agencyId) return;
    const ref = doc(db, 'agencies', agencyId, 'commissionContracts', id);
    await deleteDoc(ref);
    loadDefaultContracts();
  };

  // ---------- עריכה / מחיקה – מוצר ----------
  const startEditProduct = (id: string) => {
    const row = productContracts.find((c) => c.id === id);
    if (!row) return;
    setEditingProductId(id);
    setEditProductData(row);
  };

  const handleProductChange = (field: keyof AgencyCommissionContract, value: any) => {
    setEditProductData((prev) => ({ ...prev, [field]: value }));
  };

  const saveProductEdit = async () => {
    if (!agencyId || !editingProductId) return;
    const ref = doc(db, 'agencies', agencyId, 'commissionContracts', editingProductId);
    await updateDoc(ref, {
      company: editProductData.company || '',
      product: editProductData.product || '',
      commissionHekef: Number(editProductData.commissionHekef ?? 0),
      commissionNifraim: Number(editProductData.commissionNifraim ?? 0),
      commissionNiud: Number(editProductData.commissionNiud ?? 0),
      minuySochen: !!editProductData.minuySochen,
    });
    setEditingProductId(null);
    setEditProductData({});
    loadProductContracts();
    addToast('success', 'השינויים נשמרו');
  };

  const cancelProductEdit = () => {
    setEditingProductId(null);
    setEditProductData({});
  };

  const deleteProductRow = async (id: string) => {
    if (!agencyId) return;
    const ref = doc(db, 'agencies', agencyId, 'commissionContracts', id);
    await deleteDoc(ref);
    loadProductContracts();
  };

  // ---------- תפריט שורות ----------
  const menuItems = (
    rowId: string,
    onEdit: (id: string) => void,
    onDelete: (id: string) => void,
    closeMenu: () => void
  ) => [
    {
      key: `edit-${rowId}`,
      label: 'ערוך',
      onClick: () => {
        onEdit(rowId);
        closeMenu();
      },
      Icon: Edit,
    },
    {
      key: `delete-${rowId}`,
      label: 'מחק',
      onClick: () => {
        onDelete(rowId);
        closeMenu();
      },
      Icon: Delete,
    },
  ];

  return (
    <div className="agency-commission-manager" dir="ltr">
      <div className="table-header">
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'contractDefault' ? 'selected' : 'default'}`}
            onClick={() => setActiveTab('contractDefault')}
          >
            הגדרת עמלות ברירת מחדל לבית סוכן
          </button>
          <button
            className={`tab ${activeTab === 'contractProduct' ? 'selected' : 'default'}`}
            onClick={() => setActiveTab('contractProduct')}
          >
            הגדרת עמלות למוצר לבית סוכן
          </button>
        </div>
      </div>

      {/* טאב ברירת מחדל */}
      {activeTab === 'contractDefault' && (
        <div className="NewcontractsDefaultMD">
          <div className="filter-select-container">
            <select
              className="select-input"
              value={selectedProductGroupFilter}
              onChange={(e) => setSelectedProductGroupFilter(e.target.value)}
            >
              <option value="">בחר קבוצת מוצר</option>
              {productGroupsDB.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>

            <select
              className="select-input"
              value={minuySochenFilter1}
              onChange={(e) => setMinuySochenFilter1(e.target.value)}
            >
              <option value="">מינוי סוכן</option>
              <option value="true">כן</option>
              <option value="false">לא</option>
            </select>
          </div>

          <div className="newcontractsDefaultButton">
            <Button
              onClick={() => setIsModalOpenDefault(true)}
              text="הזנת עמלות ברירת מחדל"
              type="primary"
              icon="on"
              state="default"
            />
            <Button
              onClick={saveDefaultEdit}
              text="שמור שינויים"
              type="primary"
              icon="off"
              state={editingDefaultId ? 'default' : 'disabled'}
              disabled={!editingDefaultId}
            />
            <Button
              onClick={cancelDefaultEdit}
              text="בטל"
              type="primary"
              icon="off"
              state={editingDefaultId ? 'default' : 'disabled'}
              disabled={!editingDefaultId}
            />
          </div>

          {isModalOpenDefault && (
            <div className="modal">
              <div className="modal-content">
                <button className="close-button" onClick={() => setIsModalOpenDefault(false)}>
                  ✖
                </button>
                <div className="modal-title">הזנת עמלות ברירת מחדל לבית סוכן</div>
                <form onSubmit={handleSubmitDefault} className="form-container">
                  <div className="form-group">
                    <label htmlFor="productGroupSelect1">קבוצת מוצר</label>
                    <select
                      id="productGroupSelect1"
                      value={selectedProductGroup}
                      onChange={(e) => setSelectedProductGroup(e.target.value)}
                    >
                      <option value="">בחר קבוצת מוצר</option>
                      {productGroupsDB.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <div className="checkbox-container">
                      <input
                        type="checkbox"
                        id="minuySochen1"
                        checked={minuySochen1}
                        onChange={(e) => setMinuySochen1(e.target.checked)}
                      />
                      <label htmlFor="minuySochen1">מינוי סוכן</label>
                    </div>
                  </div>
                  <div className="form-group">
                    <label htmlFor="priceInputHekef1">אחוז היקף</label>
                    <input
                      type="text"
                      id="priceInputHekef1"
                      value={commissionPercentHekef1}
                      onChange={handlecommissionPercentHekef1}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="priceInputNifraim1">אחוז נפרעים</label>
                    <input
                      type="text"
                      id="priceInputNifraim1"
                      value={commissionPercentNifraim1}
                      onChange={handlecommissionPercentNifraim1}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="priceInputNiud1">אחוז ניוד</label>
                    <input
                      type="text"
                      id="priceInputNiud1"
                      value={commissionPercentNiud1}
                      onChange={handlecommissionPercentNiud1}
                    />
                  </div>
                  <div className="button-group">
                    <Button
                      onClick={handleSubmitDefault}
                      text="הזן"
                      type="primary"
                      icon="on"
                      state={canSubmitDefault ? 'default' : 'disabled'}
                      disabled={!canSubmitDefault}
                    />
                    <Button
                      onClick={() => setIsModalOpenDefault(false)}
                      text="בטל"
                      type="secondary"
                      icon="off"
                      state="default"
                    />
                  </div>
                </form>
              </div>
            </div>
          )}

          <div className="tableContractDefaultMD">
            <table>
              <thead>
                <tr>
                  <th>קבוצת מוצרים</th>
                  <th>מינוי סוכן</th>
                  <th>עמלת היקף</th>
                  <th>עמלת נפרעים</th>
                  <th>עמלת ניוד</th>
                  <th className="narrow-cell">🔧</th>
                </tr>
              </thead>
              <tbody>
                {defaultContracts.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {editingDefaultId === item.id ? (
                        <select
                          value={editDefaultData.productsGroup || ''}
                          onChange={(e) =>
                            handleDefaultChange('productsGroup', e.target.value)
                          }
                        >
                          <option value="">בחר קבוצת מוצר</option>
                          {productGroupsDB.map((group) => (
                            <option key={group.id} value={group.id}>
                              {group.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        productGroupMap[Number(item.productsGroup)] || 'N/A'
                      )}
                    </td>
                    <td>
                      {editingDefaultId === item.id ? (
                        <input
                          type="checkbox"
                          checked={!!editDefaultData.minuySochen}
                          onChange={(e) =>
                            handleDefaultChange('minuySochen', e.target.checked)
                          }
                        />
                      ) : item.minuySochen ? (
                        'כן'
                      ) : (
                        'לא'
                      )}
                    </td>
                    <td>
                      {editingDefaultId === item.id ? (
                        <input
                          type="text"
                          value={editDefaultData.commissionHekef ?? ''}
                          onChange={(e) =>
                            handleDefaultChange('commissionHekef', e.target.value)
                          }
                        />
                      ) : (
                        `${item.commissionHekef}%`
                      )}
                    </td>
                    <td>
                      {editingDefaultId === item.id ? (
                        <input
                          type="text"
                          value={editDefaultData.commissionNifraim ?? ''}
                          onChange={(e) =>
                            handleDefaultChange('commissionNifraim', e.target.value)
                          }
                        />
                      ) : (
                        `${item.commissionNifraim}%`
                      )}
                    </td>
                    <td>
                      {editingDefaultId === item.id ? (
                        <input
                          type="text"
                          value={editDefaultData.commissionNiud ?? ''}
                          onChange={(e) =>
                            handleDefaultChange('commissionNiud', e.target.value)
                          }
                        />
                      ) : (
                        `${item.commissionNiud}%`
                      )}
                    </td>
                    <td className="narrow-cell">
                      <MenuWrapper
                        rowId={item.id}
                        openMenuRow={openMenuRowDefault}
                        setOpenMenuRow={setOpenMenuRowDefault}
                        menuItems={menuItems(
                          item.id,
                          startEditDefault,
                          deleteDefaultRow,
                          () => setOpenMenuRowDefault(null)
                        )}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {toasts.map((toast) => (
            <ToastNotification
              key={toast.id}
              type={toast.type}
              className={toast.isHiding ? 'hide' : ''}
              message={toast.message}
              onClose={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
            />
          ))}
        </div>
      )}

      {/* טאב מוצר */}
      {activeTab === 'contractProduct' && (
        <div className="NewcontractAgent">
          <div className="filter-select-container">
            <select
              className="select-input"
              value={selectedCompanyFilter}
              onChange={(e) => setSelectedCompanyFilter(e.target.value)}
            >
              <option value="">בחר חברה</option>
              {companies.map((c, i) => (
                <option key={i} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              className="select-input"
              value={selectedProductFilter}
              onChange={(e) => setSelectedProductFilter(e.target.value)}
            >
              <option value="">בחר מוצר</option>
              {products.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>

            <select
              className="select-input"
              value={minuySochenFilter2}
              onChange={(e) => setMinuySochenFilter2(e.target.value)}
            >
              <option value="">מינוי סוכן</option>
              <option value="true">כן</option>
              <option value="false">לא</option>
            </select>
          </div>

          <div className="newcontractAgentButton">
            <Button
              onClick={() => setIsModalOpenProduct(true)}
              text="הזנת עמלות למוצר"
              type="primary"
              icon="on"
              state="default"
            />
            <Button
              onClick={saveProductEdit}
              text="שמור שינויים"
              type="primary"
              icon="off"
              state={editingProductId ? 'default' : 'disabled'}
              disabled={!editingProductId}
            />
            <Button
              onClick={cancelProductEdit}
              text="בטל"
              type="primary"
              icon="off"
              state={editingProductId ? 'default' : 'disabled'}
              disabled={!editingProductId}
            />
          </div>

          {isModalOpenProduct && (
            <div className="modal">
              <div className="modal-content">
                <button className="close-button" onClick={() => setIsModalOpenProduct(false)}>
                  ✖
                </button>
                <div className="modal-title">הזנת עמלות לפי מוצר לבית סוכן</div>
                <form onSubmit={handleSubmitProduct} className="form-container">
                  <div className="form-group">
                    <label>בחר חברה</label>
                    <select
                      value={selectedCompany}
                      onChange={(e) => setSelectedCompany(e.target.value)}
                    >
                      <option value="">בחר חברה</option>
                      {companies.map((c, i) => (
                        <option key={i} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>בחר מוצר</label>
                    <select
                      value={selectedProduct}
                      onChange={(e) => setSelectedProduct(e.target.value)}
                    >
                      <option value="">בחר מוצר</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <div className="checkbox-container">
                      <input
                        type="checkbox"
                        checked={minuySochen2}
                        onChange={(e) => setMinuySochen2(e.target.checked)}
                      />
                      <label>מינוי סוכן</label>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>אחוז היקף</label>
                    <input
                      type="text"
                      value={commissionPercentHekef2}
                      onChange={handlecommissionPercentHekef2}
                    />
                  </div>
                  <div className="form-group">
                    <label>אחוז נפרעים</label>
                    <input
                      type="text"
                      value={commissionPercentNifraim2}
                      onChange={handlecommissionPercentNifraim2}
                    />
                  </div>
                  <div className="form-group">
                    <label>אחוז ניוד</label>
                    <input
                      type="text"
                      value={commissionPercentNiud2}
                      onChange={handlecommissionPercentNiud2}
                    />
                  </div>

                  <div className="button-group">
                    <Button
                      onClick={handleSubmitProduct}
                      text="הזן"
                      type="primary"
                      icon="on"
                      state={canSubmitProduct ? 'default' : 'disabled'}
                      disabled={!canSubmitProduct}
                    />
                    <Button
                      onClick={() => setIsModalOpenProduct(false)}
                      text="בטל"
                      type="secondary"
                      icon="off"
                      state="default"
                    />
                  </div>
                </form>
              </div>
            </div>
          )}

          <div className="tableContractDefaultMD">
            <table>
              <thead>
                <tr>
                  <th>חברה</th>
                  <th>מוצר</th>
                  <th>מינוי סוכן</th>
                  <th>עמלת היקף</th>
                  <th>עמלת נפרעים</th>
                  <th>עמלת ניוד</th>
                  <th className="narrow-cell">🔧</th>
                </tr>
              </thead>
              <tbody>
                {productContracts.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {editingProductId === item.id ? (
                        <select
                          value={editProductData.company || ''}
                          onChange={(e) =>
                            handleProductChange('company', e.target.value)
                          }
                        >
                          <option value="">בחר חברה</option>
                          {companies.map((c, i) => (
                            <option key={i} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      ) : (
                        item.company
                      )}
                    </td>
                    <td>
                      {editingProductId === item.id ? (
                        <select
                          value={editProductData.product || ''}
                          onChange={(e) =>
                            handleProductChange('product', e.target.value)
                          }
                        >
                          <option value="">בחר מוצר</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.name}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        item.product
                      )}
                    </td>
                    <td>
                      {editingProductId === item.id ? (
                        <input
                          type="checkbox"
                          checked={!!editProductData.minuySochen}
                          onChange={(e) =>
                            handleProductChange('minuySochen', e.target.checked)
                          }
                        />
                      ) : item.minuySochen ? (
                        'כן'
                      ) : (
                        'לא'
                      )}
                    </td>
                    <td>
                      {editingProductId === item.id ? (
                        <input
                          type="text"
                          value={editProductData.commissionHekef ?? ''}
                          onChange={(e) =>
                            handleProductChange('commissionHekef', e.target.value)
                          }
                        />
                      ) : (
                        `${item.commissionHekef}%`
                      )}
                    </td>
                    <td>
                      {editingProductId === item.id ? (
                        <input
                          type="text"
                          value={editProductData.commissionNifraim ?? ''}
                          onChange={(e) =>
                            handleProductChange('commissionNifraim', e.target.value)
                          }
                        />
                      ) : (
                        `${item.commissionNifraim}%`
                      )}
                    </td>
                    <td>
                      {editingProductId === item.id ? (
                        <input
                          type="text"
                          value={editProductData.commissionNiud ?? ''}
                          onChange={(e) =>
                            handleProductChange('commissionNiud', e.target.value)
                          }
                        />
                      ) : (
                        `${item.commissionNiud}%`
                      )}
                    </td>
                    <td className="narrow-cell">
                      <MenuWrapper
                        rowId={item.id}
                        openMenuRow={openMenuRowProduct}
                        setOpenMenuRow={setOpenMenuRowProduct}
                        menuItems={menuItems(
                          item.id,
                          startEditProduct,
                          deleteProductRow,
                          () => setOpenMenuRowProduct(null)
                        )}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {toasts.map((toast) => (
            <ToastNotification
              key={toast.id}
              type={toast.type}
              className={toast.isHiding ? 'hide' : ''}
              message={toast.message}
              onClose={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default AgencyCommissionContractsManager;
