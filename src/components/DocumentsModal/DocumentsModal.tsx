'use client';
import React, { useState, useRef } from 'react';
import './DocumentsModal.css';

export type DocumentItem = {
  id: string;
  fileName: string;
  mimeType?: string;
  size?: number;
  url?: string;
};

type Props = {
  open: boolean;
  title: string;
  documents: DocumentItem[];
  loading: boolean;
  onClose: () => void;
  onRename?: (docId: string, newName: string) => Promise<void> | void;
  onUpload?: (file: File) => Promise<void> | void;
  onDelete?: (docId: string) => Promise<void> | void;
};

const getFileIcon = (mimeType?: string, fileName?: string) => {
  const ext = (fileName?.split('.').pop() || '').toLowerCase();
  if (mimeType?.includes('pdf') || ext === 'pdf') return '📕';
  if (mimeType?.includes('image') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return '🖼️';
  if (mimeType?.includes('word') || ['doc', 'docx'].includes(ext)) return '📘';
  if (mimeType?.includes('sheet') || ['xls', 'xlsx', 'csv'].includes(ext)) return '📗';
  return '📄';
};

const formatSize = (bytes?: number) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const DocumentsModal: React.FC<Props> = ({ open, title, documents, loading, onClose, onRename, onUpload, onDelete }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const startRename = (doc: DocumentItem) => {
    setEditingId(doc.id);
    setEditValue(doc.fileName);
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditValue('');
  };

  const confirmRename = async (docId: string) => {
    const trimmed = editValue.trim();
    if (!trimmed || !onRename) { cancelRename(); return; }
    setSavingId(docId);
    try {
      await onRename(docId, trimmed);
    } finally {
      setSavingId(null);
      setEditingId(null);
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length || !onUpload) return;
    const file = files[0];
    setUploading(true);
    try {
      await onUpload(file);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (docId: string) => {
    if (!onDelete) return;
    if (!confirm('למחוק מסמך זה?')) return;
    setDeletingId(docId);
    try {
      await onDelete(docId);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="dm-overlay" onClick={onClose}>
      <div className="dm-modal" onClick={e => e.stopPropagation()} dir="rtl">
        <div className="dm-header">
          <div className="dm-header-text">
            <span className="dm-header-icon">📎</span>
            <div>
              <div className="dm-title">מסמכים</div>
              <div className="dm-subtitle">{title}</div>
            </div>
          </div>
          <button className="dm-close" onClick={onClose} aria-label="סגור">✕</button>
        </div>

        <div className="dm-body">
          {onUpload && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                className="dm-file-input-hidden"
                onChange={e => handleFiles(e.target.files)}
              />
              <div
                className={`dm-dropzone ${dragOver ? 'dm-dropzone-active' : ''} ${uploading ? 'dm-dropzone-disabled' : ''}`}
                onClick={() => !uploading && fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => {
                  e.preventDefault();
                  setDragOver(false);
                  if (!uploading) handleFiles(e.dataTransfer.files);
                }}
              >
                {uploading ? (
                  <>
                    <div className="dm-spinner dm-spinner-sm" />
                    <span>מעלה מסמך...</span>
                  </>
                ) : (
                  <>
                    <span className="dm-upload-icon">⬆️</span>
                    <span>גררי קובץ לכאן או לחצי להעלאה</span>
                  </>
                )}
              </div>
            </>
          )}

          {loading ? (
            <div className="dm-state">
              <div className="dm-spinner" />
              <span>טוען מסמכים...</span>
            </div>
          ) : documents.length === 0 ? (
            <div className="dm-state dm-empty">
              <span className="dm-empty-icon">🗂️</span>
              <span>אין מסמכים להצגה</span>
            </div>
          ) : (
            <div className="dm-list">
              {documents.map(doc => (
                <div key={doc.id} className="dm-row">
                  <div className="dm-icon">{getFileIcon(doc.mimeType, doc.fileName)}</div>

                  <div className="dm-info">
                    {editingId === doc.id ? (
                      <div className="dm-edit-row">
                        <input
                          className="dm-edit-input"
                          value={editValue}
                          autoFocus
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') confirmRename(doc.id);
                            if (e.key === 'Escape') cancelRename();
                          }}
                        />
                        <button
                          className="dm-icon-btn dm-confirm"
                          onClick={() => confirmRename(doc.id)}
                          disabled={savingId === doc.id}
                          title="שמור"
                        >
                          {savingId === doc.id ? '⏳' : '✓'}
                        </button>
                        <button className="dm-icon-btn" onClick={cancelRename} title="בטל">✕</button>
                      </div>
                    ) : (
                      <>
                        <div className="dm-filename" title={doc.fileName}>{doc.fileName}</div>
                        {doc.size ? <div className="dm-filesize">{formatSize(doc.size)}</div> : null}
                      </>
                    )}
                  </div>

                  {editingId !== doc.id && (
                    <div className="dm-actions">
                      {onRename && (
                        <button className="dm-icon-btn" onClick={() => startRename(doc)} title="שנה שם">✏️</button>
                      )}
                      {doc.url ? (
                        <a href={doc.url} target="_blank" rel="noreferrer" className="dm-open-btn">פתח</a>
                      ) : (
                        <span className="dm-unavailable">לא זמין</span>
                      )}
                      {onDelete && (
                        <button
                          className="dm-icon-btn dm-delete"
                          onClick={() => handleDelete(doc.id)}
                          disabled={deletingId === doc.id}
                          title="מחק"
                        >
                          {deletingId === doc.id ? '⏳' : '🗑'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DocumentsModal;