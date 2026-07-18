/* eslint-disable react/jsx-no-comment-textnodes */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '@/lib/firebase/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useAuth } from '@/lib/firebase/AuthContext';
import useFetchAgentData from "@/hooks/useFetchAgentData";
import useCalculateSalesData from "@/hooks/useCalculateGoalsSales";
import MenuWrapper from "@/components/MenuWrapper/MenuWrapper";
import Edit from '@/components/icons/Edit/Edit';
import Delete from '@/components/icons/Delete/Delete';
import TableFooter from "@/components/TableFooter/TableFooter";
import Search from "@/components/Search/Search";
import './NewAgentForm.css';
import { Button } from "@/components/Button/Button";
import { ProgressBar } from "@/components/ProgressBar/ProgressBar";
import useEditableTable from "@/hooks/useEditableTable";
import fetchDataForAgent from '@/services/fetchDataForAgent';
import { CombinedData, AgentDataType } from '@/types/Sales';
import { useSortableTable } from "@/hooks/useSortableTable";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { useRouter } from 'next/navigation';
import useFetchMD from "@/hooks/useMD";
import DealFormModal from '@/components/DealFormModal/DealFormModal';

const NewAgentForm: React.FC = () => {
  const { user, detail } = useAuth();
  const router = useRouter();

  const {
    agents,
    selectedAgentId,
    handleAgentChange,
    workers,
    workerNameMap,
    companies,
    selectedWorkerIdFilter,
    setSelectedWorkerIdFilter,
    selectedCompanyFilter,
    setSelectedCompanyFilter,
    selectedWorkerIdGoals,
    setSelectedWorkerIdGoals,
    handleWorkerChange,
    isLoadingAgent,
  } = useFetchAgentData();

  const {
    products,
    statusPolicies,
    selectedProductFilter,
    setSelectedProductFilter,
    selectedStatusPolicyFilter,
    setSelectedStatusPolicyFilter,
    formatIsraeliDateOnly,
  } = useFetchMD();

  const { goalData, fetchDataGoalsForWorker } = useCalculateSalesData();

  const [agentData, setAgentData] = useState<CombinedData[]>([]);
  const [filteredData, setFilteredData] = useState<AgentDataType[]>([]);
  const [openMenuRow, setOpenMenuRow] = useState(null);
  const { sortedData, sortColumn, sortOrder, handleSort } = useSortableTable<CombinedData>(filteredData);

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const indexOfLastRow = currentPage * rowsPerPage;
  const indexOfFirstRow = indexOfLastRow - rowsPerPage;
  const currentRows = sortedData.slice(indexOfFirstRow, indexOfLastRow);

  const canManageAgency3Fields = String(detail?.agencyId ?? "") === "3";

  const [paymentStatusOptions, setPaymentStatusOptions] = useState<{ id: string; name: string }[]>([]);
  const [depositStatusOptions, setDepositStatusOptions] = useState<{ id: string; name: string }[]>([]);

  const [idCustomerFilter, setIdCustomerFilter] = useState('');
  const [policyNumberFilter, setPolicyNumberFilter] = useState("");
  const [firstNameCustomerFilter, setfirstNameCustomerFilter] = useState('');
  const [lastNameCustomerFilter, setlastNameCustomerFilter] = useState('');
  const [minuySochenFilter, setMinuySochenFilter] = useState('');
  const [expiryDateFilter, setExpiryDateFilter] = useState('');
  const [hekefPaidFilter, setHekefPaidFilter] = useState('');
  const [niudPaidFilter, setNiudPaidFilter] = useState('');
  const [depositStatusFilter, setDepositStatusFilter] = useState('');

  const [isActiveGoals, setIsActiveGoals] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const { prefs, loadingPrefs, setSoundOnSuccess } = useUserPreferences(user?.uid);
  const [openSettings, setOpenSettings] = useState(false);

  // ─── מודל הוספה/עריכה של עסקה (DealFormModal המשותף) ───────────────────
  const [showDealForm, setShowDealForm] = useState(false);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);

  // סוכן תקין לצורך פתיחת עסקה חדשה (לא ריק, ולא "כל הסוכנות")
  const canAddDeal = !!selectedAgentId && selectedAgentId !== 'all';

  const openNewDeal = () => {
    setEditingSaleId(null);
    setShowDealForm(true);
  };

  const openEditDeal = (saleId: string) => {
    setEditingSaleId(saleId);
    setShowDealForm(true);
  };

  const closeDealForm = () => {
    setShowDealForm(false);
    setEditingSaleId(null);
  };

  const {
    data,
    handleDeleteRow,
    reloadData,
  } = useEditableTable<CombinedData>({
    dbCollection: 'sales',
    agentId: selectedAgentId,
    fetchData: fetchDataForAgent,
  });

  // ── טעינת נתוני agency=3 (רשימות ערכים לפילטרים) ──────────────────────
  useEffect(() => {
    const loadAgency3Metadata = async () => {
      try {
        const paymentSnap = await getDocs(collection(db, "mdPaymentStatus"));
        const depositSnap = await getDocs(collection(db, "mdDepositStatus"));

        setPaymentStatusOptions(
          paymentSnap.docs.map((d) => ({
            id: d.id,
            name: String(d.data().name || "").trim(),
          }))
        );

        setDepositStatusOptions(
          depositSnap.docs.map((d) => ({
            id: d.id,
            name: String(d.data().name || "").trim(),
          }))
        );
      } catch (error) {
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

  // ── סנכרון agentData מתוך data (useEditableTable כבר מטעין לפי selectedAgentId) ──
  // אם אין סוכן נבחר (למשל אדמין שבחר "בחר סוכן") מרוקנים את הטבלה,
  // אחרת פשוט עוקבים אחרי data — בלי fetch כפול.
  useEffect(() => {
    if (!selectedAgentId) {
      setAgentData([]);
      return;
    }
    setAgentData(data);
  }, [data, selectedAgentId]);

  const exportToExcel = () => {
    if (!filteredData.length) return;

    const translatedData = filteredData.map(item => ({
      "שם פרטי": item.firstNameCustomer,
      "שם משפחה": item.lastNameCustomer,
      "תעודת זהות": item.IDCustomer,
      "מספר פוליסה": item.policyNumber ?? "",
      "חברה": item.company,
      "מוצר": item.product,
      "פרמיה ביטוח": item.insPremia,
      "פרמיה פנסיה": item.pensiaPremia,
      "צבירה פנסיה": item.pensiaZvira,
      "פרמיה פיננסים": item.finansimPremia,
      "צבירה פיננסים": item.finansimZvira,
      "חודש תפוקה": item.mounth,
      "סטאטוס": item.statusPolicy,
      "תאריך ביטול": item.cancellationDate ? formatIsraeliDateOnly(item.cancellationDate) : "",
      "מינוי סוכן": item.minuySochen ? "כן" : "לא",
      ...(canManageAgency3Fields
        ? {
          "שולם היקף": (item as any).hekefPaid || "",
          "שולם ניוד": (item as any).niudPaid || "",
          "סטטוס הפקדה": (item as any).depositStatus || "",
        }
        : {}),
      "שם עובד": workerNameMap[item.workerId ?? ""] || "",
      "הערות": item.notes ?? "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(translatedData);
    worksheet["!rtl"] = true;

    const range = XLSX.utils.decode_range(worksheet['!ref'] || '');
    worksheet['!ref'] = XLSX.utils.encode_range(range);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "עסקאות מסוננות");

    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([excelBuffer], { type: "application/octet-stream" });
    saveAs(blob, "עסקאות_מסוננות.xlsx");
  };

  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  const formatDateForComparison = (dateString: string) => {
    if (!dateString) return "";
    const [year, month, day] = dateString.split("-");
    return `${day}.${month}.${year}`;
  };

  useEffect(() => {
    let filtered = agentData.map((item) => ({
      ...item,
      mounth: item.mounth ?? '',
      statusPolicy: item.statusPolicy ?? '',
      firstNameCustomer: item.firstNameCustomer ?? '',
      lastNameCustomer: item.lastNameCustomer ?? '',
      IDCustomer: item.IDCustomer ?? '',
      company: item.company ?? '',
      product: item.product ?? '',
      policyNumber: item.policyNumber ?? "",
      cancellationDate: item.cancellationDate ?? "",
    }));

    filtered = filtered.filter((item) => {
      const itemDate = item.mounth ? formatDateForComparison(item.mounth) : "";
      return (
        (selectedWorkerIdFilter ? item.workerId === selectedWorkerIdFilter : true) &&
        (selectedCompanyFilter ? item.company === selectedCompanyFilter : true) &&
        (selectedProductFilter ? item.product === selectedProductFilter : true) &&
        item.IDCustomer.includes(idCustomerFilter) &&
        (item.policyNumber ?? "").includes(policyNumberFilter) &&
        item.firstNameCustomer.includes(firstNameCustomerFilter) &&
        item.lastNameCustomer.includes(lastNameCustomerFilter) &&
        (minuySochenFilter === '' || item.minuySochen?.toString() === minuySochenFilter) &&
        (!expiryDateFilter || itemDate.includes(expiryDateFilter)) &&
        (selectedStatusPolicyFilter ? item.statusPolicy === selectedStatusPolicyFilter : true) &&
        (hekefPaidFilter === '' || item.hekefPaid === hekefPaidFilter) &&
        (niudPaidFilter === '' || item.niudPaid === niudPaidFilter) &&
        (depositStatusFilter === '' || item.depositStatus === depositStatusFilter)
      );
    });

    filtered.sort((a, b) => {
      const dateA = new Date(a.mounth).getTime();
      const dateB = new Date(b.mounth).getTime();
      if (dateA !== dateB) {
        return dateB - dateA;
      }
      return a.IDCustomer.localeCompare(b.IDCustomer);
    });

    setFilteredData(filtered);
  }, [
    selectedWorkerIdFilter,
    selectedCompanyFilter,
    selectedProductFilter,
    selectedStatusPolicyFilter,
    agentData,
    idCustomerFilter,
    policyNumberFilter,
    firstNameCustomerFilter,
    lastNameCustomerFilter,
    minuySochenFilter,
    expiryDateFilter,
    hekefPaidFilter,
    niudPaidFilter,
    depositStatusFilter,
  ]);

  const handleCalculate = useCallback(async () => {
    if (!selectedAgentId || selectedAgentId.trim() === '') return;
    if (!user || !user.uid || !detail || !detail.role) return;

    setIsLoading(true);

    const workerIdToFetch = (detail.role === 'worker' && !selectedWorkerIdGoals) ? user.uid : selectedWorkerIdGoals;
    if (!workerIdToFetch) {
      setIsLoading(false);
      return;
    }
    try {
      await fetchDataGoalsForWorker(selectedAgentId, isActiveGoals, workerIdToFetch);
    } catch (error) {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [selectedAgentId, isActiveGoals, user, detail, selectedWorkerIdGoals, fetchDataGoalsForWorker]);

  useEffect(() => {
    if (detail && user && (detail.role === 'worker' || detail.role === 'agent') && !selectedWorkerIdGoals) {
      setSelectedWorkerIdGoals(user.uid);
    } else {
      handleCalculate();
    }
  }, [handleCalculate, detail, user, selectedWorkerIdGoals]);

  const menuItems = (rowId: string, closeMenu: () => void) => [
    {
      label: "ערוך",
      onClick: () => {
        openEditDeal(rowId);
        closeMenu();
      },
      Icon: Edit,
    },
    {
      label: "מחק",
      onClick: () => {
        handleDeleteRow(rowId);
        closeMenu();
      },
      Icon: Delete,
    },
  ];

  return (
    <div className="content-container-NewAgentForm">
      <div className="data-container-Goals">
        <div className="table-header-Goal" style={{ textAlign: 'right' }}>
          <div className="table-Goal-title">עמידה ביעדים</div>
        </div>

        <div className="goal-Worker">
          <select
            id="worker-select-goals"
            value={selectedWorkerIdGoals}
            onChange={(e) => handleWorkerChange(e, 'goal')}
            disabled={!!(detail && detail.role === 'worker')}
          >
            <option value="">בחר עובד</option>
            {workers.map((worker) => (
              <option key={worker.id} value={worker.id}>
                {worker.name}
              </option>
            ))}
          </select>
        </div>

        <div className="goalActive">
          <input
            type="checkbox"
            id="active-goals"
            name="active-goals"
            checked={isActiveGoals}
            onChange={(e) => setIsActiveGoals(e.target.checked)}
          />
          <label htmlFor="active-goals">יעדים פעילים</label>
        </div>

        <div className="goals-container">
          {isLoading ? (
            <p>Loading...</p>
          ) : goalData.length > 0 ? (
            goalData.map((item, index) => (
              <div className="goal-card" key={index}>
                <div className="goal-title">
                  {item.promotionName || "אין שם יעד"}
                </div>
                <div className="goal-grid">
                  <div className="goal-field">
                    <label className="goal-label">יעד:</label>
                    <span className="goal-value">
                      {item.amaunt !== undefined && item.goalTypeName ? (
                        `${item.amaunt.toLocaleString()} - ${item.goalTypeName}`
                      ) : (
                        "אין מידע"
                      )}
                    </span>
                  </div>
                  <div className="goal-field">
                    <label className="goal-label">ביצוע:</label>
                    {item.goalTypeName === "כוכבים" ? (
                      <span className="goal-value">
                        {item.totalStars ? `${item.totalStars}` : "אין מידע"}
                      </span>
                    ) : item.totalPremia && Object.keys(item.totalPremia).length > 0 ? (
                      Object.entries(item.totalPremia).map(([groupId, total]) => (
                        <span className="goal-value" key={groupId}>
                          {typeof total === "number"
                            ? new Intl.NumberFormat("he-IL").format(Math.floor(total))
                            : "אין מידע"}
                        </span>
                      ))
                    ) : (
                      <span className="goal-value">אין מידע</span>
                    )}
                  </div>
                  <div className="goal-field">
                    <label className="goal-label">אחוז עמידה:</label>
                    {item.achievementRate !== undefined ? (
                      <ProgressBar
                        state={
                          item.achievementRate >= 100
                            ? "complete"
                            : item.achievementRate >= 50
                              ? "progress"
                              : "low"
                        }
                        percentage={Math.min(item.achievementRate, 100)}
                        className="achievement-bar"
                      />
                    ) : (
                      <span className="goal-value">אין מידע</span>
                    )}
                  </div>
                  <div className="goal-field">
                    <label className="goal-label">זמן עבר:</label>
                    {item.daysPassed !== undefined &&
                      item.totalDuration !== undefined &&
                      item.totalDuration > 0 ? (
                      <ProgressBar
                        state="time"
                        percentage={Math.min(
                          (item.daysPassed / item.totalDuration) * 100,
                          100
                        )}
                        className="time-bar"
                      />
                    ) : (
                      <span className="goal-value">אין מידע</span>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p>אין מידע</p>
          )}
        </div>
      </div>

      <div className={`table-container-AgentForm-new-design`}>
        <div className="table-header">
          <div className="table-title">ניהול עסקאות</div>
          <div className="button-container">
            <Button
              onClick={openNewDeal}
              text="הוסף עסקה"
              type="primary"
              icon="on"
              state={canAddDeal ? "default" : "disabled"}
            />
            <button
              onClick={exportToExcel}
              className="excel-icon-button"
              title="ייצוא לאקסל"
            >
              <img src="/static/img/excel-icon.svg" alt="ייצוא לאקסל" width={24} height={24} />
            </button>
            <button
              type="button"
              onClick={() => setOpenSettings(true)}
              className="settings-gear-btn"
              title="הגדרות"
              aria-label="הגדרות"
            >
              <span className="gear-icon">⚙️</span>
            </button>
          </div>
        </div>

        <div className="filter-inputs-container-new">
          <div className="filter-select-container">
            <select onChange={handleAgentChange} value={selectedAgentId} className="select-input">
              {detail?.role === 'admin' && <option value="">בחר סוכן</option>}
              {detail?.role === 'admin' && <option value="all">כל הסוכנות</option>}
              {agents.map(agent => (
                <option key={agent.id} value={agent.id}>{agent.name}</option>
              ))}
            </select>
          </div>
          <div className="filter-select-container">
            <select id="worker-select" value={selectedWorkerIdFilter}
              onChange={(e) => handleWorkerChange(e, 'filter')} className="select-input">
              <option value="">כל העובדים</option>
              {workers.map(worker => (
                <option key={worker.id} value={worker.id}>{worker.name}</option>
              ))}
            </select>
          </div>
          <div className="filter-select-container">
            <select id="company-Select" value={selectedCompanyFilter} onChange={(e) => setSelectedCompanyFilter(e.target.value)} className="select-input">
              <option value="">בחר חברה</option>
              {companies.map((companyName, index) => (
                <option key={index} value={companyName}>{companyName}</option>
              ))}
            </select>
          </div>
          <div className="filter-select-container">
            <select id="product-Select" value={selectedProductFilter} onChange={(e) => setSelectedProductFilter(e.target.value)} className="select-input">
              <option value="">בחר מוצר</option>
              {products.map(product => (
                <option key={product.id} value={product.name}>{product.name}</option>
              ))}
            </select>
          </div>
          <div className="filter-select-container">
            <select
              id="status-PolicySelect"
              value={selectedStatusPolicyFilter}
              onChange={(e) => setSelectedStatusPolicyFilter(e.target.value)} className="select-input">
              <option value="">סטאטוס פוליסה</option>
              {statusPolicies.map((status, index) => (
                <option key={index} value={status}>{status}</option>
              ))}
            </select>
          </div>
          <div className="filter-input-container">
            <Search className="filter-input-icon" />
            <input
              type="text"
              placeholder="שם פרטי"
              value={firstNameCustomerFilter}
              onChange={(e) => setfirstNameCustomerFilter(e.target.value)}
              className="filter-input"
            />
          </div>
          <div className="filter-input-container">
            <Search className="filter-input-icon" />
            <input
              type="text"
              placeholder="שם משפחה"
              value={lastNameCustomerFilter}
              onChange={(e) => setlastNameCustomerFilter(e.target.value)}
              className="filter-input"
            />
          </div>
          <div className="filter-input-container">
            <Search className="filter-input-icon" />
            <input
              type="text"
              placeholder="תז לקוח"
              value={idCustomerFilter}
              onChange={(e) => setIdCustomerFilter(e.target.value)}
              className="filter-input"
            />
          </div>
          <div className="filter-input-container">
            <Search className="filter-input-icon" />
            <input
              type="text"
              placeholder="מס' פוליסה"
              value={policyNumberFilter}
              onChange={(e) => setPolicyNumberFilter(e.target.value)}
              className="filter-input"
            />
          </div>
          <div className="filter-input-container">
            <Search className="filter-input-icon" />
            <input
              type="text"
              id="expiry-Date"
              name="expiry-Date"
              value={expiryDateFilter}
              onChange={(e) => setExpiryDateFilter(e.target.value)}
              placeholder="חפש לפי תאריך"
              className="filter-input"
            />
          </div>
          <div className="filter-checkbox-container">
            <select value={minuySochenFilter} onChange={(e) => setMinuySochenFilter(e.target.value)} className="select-input">
              <option value="">מינוי סוכן </option>
              <option value="true">כן</option>
              <option value="false">לא</option>
            </select>
          </div>
          {canManageAgency3Fields && (
            <>
              <div className="filter-select-container">
                <select value={hekefPaidFilter} onChange={(e) => setHekefPaidFilter(e.target.value)} className="select-input">
                  <option value="">שולם היקף</option>
                  {paymentStatusOptions.map((opt) => (
                    <option key={opt.id} value={opt.name}>{opt.name}</option>
                  ))}
                </select>
              </div>

              <div className="filter-select-container">
                <select value={niudPaidFilter} onChange={(e) => setNiudPaidFilter(e.target.value)} className="select-input">
                  <option value="">שולם ניוד</option>
                  {paymentStatusOptions.map((opt) => (
                    <option key={opt.id} value={opt.name}>{opt.name}</option>
                  ))}
                </select>
              </div>

              <div className="filter-select-container">
                <select value={depositStatusFilter} onChange={(e) => setDepositStatusFilter(e.target.value)} className="select-input">
                  <option value="">סטטוס הפקדה</option>
                  {depositStatusOptions.map((opt) => (
                    <option key={opt.id} value={opt.name}>{opt.name}</option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>

        <div className="table-Deal-container">
          {isLoadingAgent && (
            <div className="spinner-overlay">
              <div className="spinner"></div>
            </div>
          )}
          <div className={`table-Data-AgentForm ${'is-new-design'}`}>
            <table>
              <thead>
                <tr>
                  <th className="medium-column" onClick={() => handleSort("firstNameCustomer" as keyof CombinedData)}>
                    שם פרטי {sortColumn && sortColumn === "firstNameCustomer" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="medium-column" onClick={() => handleSort("lastNameCustomer" as keyof CombinedData)}>
                    שם משפחה {sortColumn && sortColumn === "lastNameCustomer" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="wide-column" onClick={() => handleSort("IDCustomer" as keyof CombinedData)}>
                    תז {sortColumn && sortColumn === "IDCustomer" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="medium-column" onClick={() => handleSort("company" as keyof CombinedData)}>
                    חברה {sortColumn && sortColumn === "company" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="medium-column" onClick={() => handleSort("product" as keyof CombinedData)}>
                    מוצר {sortColumn && sortColumn === "product" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="medium-column" onClick={() => handleSort("insPremia" as keyof CombinedData)}>
                    פרמיה ביטוח {sortColumn && sortColumn === "insPremia" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="medium-column" onClick={() => handleSort("pensiaPremia" as keyof CombinedData)}>
                    פרמיה פנסיה {sortColumn && sortColumn === "pensiaPremia" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="medium-column" onClick={() => handleSort("pensiaZvira" as keyof CombinedData)}>
                    צבירה פנסיה {sortColumn && sortColumn === "pensiaZvira" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="medium-column" onClick={() => handleSort("finansimPremia" as keyof CombinedData)}>
                    פרמיה פיננסים {sortColumn && sortColumn === "finansimPremia" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="medium-column" onClick={() => handleSort("finansimZvira" as keyof CombinedData)}>
                    צבירה פיננסים {sortColumn && sortColumn === "finansimZvira" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="wide-column" onClick={() => handleSort("mounth" as keyof CombinedData)}>
                    חודש תפוקה {sortColumn && sortColumn === "mounth" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="medium-column" onClick={() => handleSort("statusPolicy" as keyof CombinedData)}>
                    סטאטוס {sortColumn && sortColumn === "statusPolicy" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="narrow-column" onClick={() => handleSort("minuySochen" as keyof CombinedData)}>
                    מינוי סוכן {sortColumn && sortColumn === "minuySochen" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="narrow-column" onClick={() => handleSort("workerName" as keyof CombinedData)}>
                    שם עובד {sortColumn && sortColumn === "workerName" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="wide-column" onClick={() => handleSort("notes" as keyof CombinedData)}>
                    הערות {sortColumn && sortColumn === "notes" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                  </th>
                  {canManageAgency3Fields && (
                    <>
                      <th className="narrow-column" onClick={() => handleSort("hekefPaid" as keyof CombinedData)}>
                        שולם היקף {sortColumn && sortColumn === "hekefPaid" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                      </th>
                      <th className="narrow-column" onClick={() => handleSort("niudPaid" as keyof CombinedData)}>
                        שולם ניוד {sortColumn && sortColumn === "niudPaid" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                      </th>
                      <th className="narrow-column" onClick={() => handleSort("depositStatus" as keyof CombinedData)}>
                        סטטוס הפקדה {sortColumn && sortColumn === "depositStatus" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                      </th>
                    </>
                  )}
                  <th className="narrow-cell">🔧</th>
                </tr>
              </thead>
              <tbody>
                {currentRows.map((item) => (
                  <tr key={item.id}>
                    <td className="narrow-column">
                      <span
                        style={{ cursor: 'pointer', color: '#2d5a8e', textDecoration: 'underline' }}
                        onClick={() => router.push(`/NewCustomer?idCustomerFilter=${item.IDCustomer}`)}
                      >
                        {item.firstNameCustomer}
                      </span>
                    </td>

                    <td className="narrow-column">
                      <span
                        style={{ cursor: 'pointer', color: '#2d5a8e', textDecoration: 'underline' }}
                        onClick={() => router.push(`/NewCustomer?idCustomerFilter=${item.IDCustomer}`)}
                      >
                        {item.lastNameCustomer}
                      </span>
                    </td>

                    <td className="narrow-column">
                      <span
                        style={{ cursor: 'pointer', color: '#2d5a8e', textDecoration: 'underline' }}
                        onClick={() => router.push(`/NewCustomer?idCustomerFilter=${item.IDCustomer}`)}
                      >
                        {item.IDCustomer}
                      </span>
                    </td>
                    <td className="narrow-column">{item.company}</td>
                    <td className="medium-column">
                      <div className="cell-stacked">
                        <div>{item.product}</div>
                        {item.policyNumber && (
                          <div className="subline">מס׳ פוליסה: {item.policyNumber}</div>
                        )}
                      </div>
                    </td>
                    <td className="narrow-column">{item.insPremia}</td>
                    <td className="narrow-column">{item.pensiaPremia}</td>
                    <td className="narrow-column">{item.pensiaZvira}</td>
                    <td className="narrow-column">{item.finansimPremia}</td>
                    <td className="narrow-column">{item.finansimZvira}</td>
                    <td className="medium-column">
                      {item.mounth ? formatIsraeliDateOnly(item.mounth) : ""}
                    </td>
                    <td className="narrow-column">{item.statusPolicy}</td>
                    <td className="small-column">
                      {item.minuySochen ? "כן" : "לא"}
                    </td>
                    <td className="medium-column">
                      {workerNameMap[item.workerId ?? ""] || "לא נמצא"}
                    </td>
                    <td className="notes-column wide-column">
                      <span className="notes-preview">
                        {item.notes}
                      </span>
                      {item.notes ? (
                        <div className="inline-modal">
                          <p>{item.notes}</p>
                        </div>
                      ) : null}
                    </td>
                    {canManageAgency3Fields && (
                      <>
                        <td className="small-column">{(item as any).hekefPaid || ""}</td>
                        <td className="small-column">{(item as any).niudPaid || ""}</td>
                        <td className="small-column">{(item as any).depositStatus || ""}</td>
                      </>
                    )}
                    <td className="narrow-cell">
                      <MenuWrapper
                        rowId={item.id}
                        openMenuRow={openMenuRow}
                        setOpenMenuRow={setOpenMenuRow}
                        menuItems={menuItems(
                          item.id,
                          () => setOpenMenuRow(null)
                        )}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={canManageAgency3Fields ? 19 : 16}>
                    <TableFooter
                      currentPage={currentPage}
                      totalPages={Math.ceil(filteredData.length / rowsPerPage)}
                      onPageChange={handlePageChange}
                      rowsPerPage={rowsPerPage}
                      onRowsPerPageChange={(value) => {
                        setRowsPerPage(value);
                        setCurrentPage(1);
                      }}
                    />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {openSettings && (
        <div className="settings-overlay" onClick={() => setOpenSettings(false)}>
          <div
            className="settings-dialog"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="settings-close"
              onClick={() => setOpenSettings(false)}
              aria-label="סגור"
              type="button"
            >
              ✕
            </button>

            <div className="settings-header">
              <div className="settings-title">הגדרות</div>
              <div className="settings-subtitle">התאם את החוויה שלך</div>
            </div>

            <div className="settings-divider" />

            <div className="settings-item">
              <div className="settings-item-text">
                <div className="settings-item-title">צליל בסיום הזנה</div>
                <div className="settings-item-desc">כפיים/צליל אחרי שמירת עסקה</div>
              </div>

              <label className="ms-switch">
                <input
                  type="checkbox"
                  checked={!!prefs.soundOnSuccess}
                  onChange={(e) => setSoundOnSuccess(e.target.checked)}
                  disabled={loadingPrefs}
                />
                <span className="ms-slider" />
              </label>
            </div>
          </div>
        </div>
      )}

      {showDealForm && canAddDeal && (
        <DealFormModal
          defaultAgentId={selectedAgentId}
          editingSaleId={editingSaleId}
          onClose={closeDealForm}
          onSaved={() => reloadData(selectedAgentId)}
        />
      )}
    </div>
  );
}

export default NewAgentForm;
