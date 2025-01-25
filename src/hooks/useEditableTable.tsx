import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';

type UseTableActionsProps<T> = {
  dbCollection: string; // שם האוסף העיקרי
  agentId?: string; // מזהה הסוכן (לא חובה)
  fetchData?: (agentId: string) => Promise<T[]>; // פונקציה לטעינת נתונים
};

type UseTableActionsResult<T> = {
  data: T[];
  isLoadingHookEdit: boolean;
  editingRow: string | null;
  editData: Partial<T>;
  handleEditRow: (id: string) => void;
  handleDeleteRow: (id: string) => Promise<void>;
  saveChanges: () => Promise<void>;
  handleEditChange: (field: keyof T, value: T[keyof T]) => void;
  reloadData: (agentId: string) => Promise<void>;
  cancelEdit: () => void;
};

function useEditableTable<T extends { id: string }>({
  dbCollection,
  agentId,
  fetchData,
}: UseTableActionsProps<T>): UseTableActionsResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [isLoadingHookEdit, setIsLoadingHookEdit] = useState(true);
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<T>>({});

  // פונקציה לטעינת נתונים
  const reloadData = async (UserAgentId: string) => {
    if (!fetchData || !UserAgentId) return;
    setIsLoadingHookEdit(true);
    try {
      const result = await fetchData(UserAgentId);
      setData(result);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoadingHookEdit(false);
    }
  };

  useEffect(() => {
    if (agentId) {
      reloadData(agentId);
    }
  }, [agentId]);

  const handleEditRow = (id: string) => {
    setEditingRow(id);
    const rowData = data.find((item) => item.id === id);
    if (rowData) {
      setEditData({ ...rowData });
    }
  };

  const handleEditChange = (field: keyof T, value: T[keyof T]) => {
    setEditData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleDeleteRow = async (id: string) => {
    const isConfirmed = window.confirm('האם אתה בטוח שברצונך למחוק את השורה?');
    if (!isConfirmed) return;

    try {
      const updatedData = data.filter((item) => item.id !== id);
      setData(updatedData);

      const docRef = doc(db, dbCollection, id);
      await deleteDoc(docRef);
      console.log('Row deleted successfully');
    } catch (error) {
      console.error('Error deleting row:', error);
    }
  };

  const saveChanges = async () => {
    try {
      if (!editingRow) return;

      const updatedData = data.map((item) =>
        item.id === editingRow ? { ...item, ...editData } : item
      );
      setData(updatedData);

      const docRef = doc(db, dbCollection, editingRow);
      await updateDoc(docRef, {
        ...editData,
        lastUpdateDate: serverTimestamp(),
      });
      console.log('Row updated successfully');
    } catch (error) {
      console.error('Error updating row:', error);
    } finally {
      setEditingRow(null);
      setEditData({});
    }
  };

  const cancelEdit = () => {
    setEditingRow(null); // איפוס השורה הנערכת
    setEditData({}); // איפוס הנתונים ששונו
  };

  return {
    data,
    isLoadingHookEdit,
    editingRow,
    editData,
    handleEditRow,
    handleEditChange,
    handleDeleteRow,
    saveChanges,
    reloadData,
    cancelEdit,
  };
}

export default useEditableTable;
