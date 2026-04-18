import { useEffect, useMemo, useState } from 'react';
import { Eye, Trash2, X } from 'lucide-react';

import {
  deleteTrainingUpload,
  getTrainingUploadPreview,
  listTrainingUploads,
} from '../../services/api';
import type {
  TrainingUploadFile,
  TrainingUploadPreviewApiResponse,
} from '../../types';

interface KnowledgeBaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId?: string;
}

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All Categories' },
  { value: 'general', label: 'General' },
  { value: 'campaigns', label: 'Campaigns' },
  { value: 'events', label: 'Events' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'customers', label: 'Customers' },
  { value: 'retention', label: 'Retention' },
];

const CATEGORY_STYLES: Record<string, string> = {
  general: 'bg-blue-100 text-blue-700',
  campaigns: 'bg-violet-100 text-violet-700',
  events: 'bg-amber-100 text-amber-700',
  transactions: 'bg-emerald-100 text-emerald-700',
  customers: 'bg-cyan-100 text-cyan-700',
  retention: 'bg-rose-100 text-rose-700',
};

export default function KnowledgeBaseModal({ isOpen, onClose, clientId }: KnowledgeBaseModalProps) {
  const [files, setFiles] = useState<TrainingUploadFile[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<TrainingUploadPreviewApiResponse | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen || !clientId) return;
    let cancelled = false;

    const loadFiles = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await listTrainingUploads(clientId);
        if (cancelled) return;
        setFiles(response.files || []);
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : 'Failed to load knowledge base files.');
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadFiles();
    return () => {
      cancelled = true;
    };
  }, [isOpen, clientId]);

  const filteredFiles = useMemo(() => {
    if (categoryFilter === 'all') return files;
    return files.filter((file) => file.category === categoryFilter);
  }, [files, categoryFilter]);

  const handlePreview = async (fileId: number) => {
    if (!clientId) return;
    setIsPreviewLoading(true);
    setError(null);

    try {
      const response = await getTrainingUploadPreview(fileId, clientId);
      setPreviewState(response);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'Failed to load file preview.');
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleDelete = async (fileId: number) => {
    if (!clientId) return;
    if (!window.confirm('Delete this file from the knowledge base?')) return;

    setDeletingId(fileId);
    setError(null);

    try {
      await deleteTrainingUpload(fileId, clientId);
      setFiles((prev) => prev.filter((file) => file.id !== fileId));
      if (previewState?.file?.id === fileId) {
        setPreviewState(null);
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete file.');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (value: string) => {
    try {
      return new Date(value).toLocaleDateString();
    } catch {
      return value;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-[760px] flex-col overflow-hidden rounded-[24px] border border-gray-200 bg-white shadow-[0_20px_52px_rgba(15,23,42,0.16)]">
        <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-[22px] font-extrabold tracking-tight text-gray-900">Knowledge Base</h2>
            <p className="mt-1 text-sm text-gray-500">Manage and view your uploaded documents</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close knowledge base modal"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div className="w-full max-w-[320px]">
              <label htmlFor="knowledge-base-category" className="block text-base font-semibold text-gray-700">
                Filter by Category
              </label>
              <select
                id="knowledge-base-category"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="mt-2 h-11 w-full rounded-[14px] border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="text-base text-gray-600">
              {filteredFiles.length} {filteredFiles.length === 1 ? 'document' : 'documents'}
            </div>
          </div>

          {error ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : null}

          <div className="overflow-hidden rounded-[18px] border border-gray-300">
            <table className="min-w-full text-left">
              <thead className="border-b border-gray-300 bg-gray-50 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-600">
                <tr>
                  <th className="px-4 py-3.5">Filename</th>
                  <th className="px-4 py-3.5">Category</th>
                  <th className="px-4 py-3.5">Type</th>
                  <th className="px-4 py-3.5">Uploaded</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500">
                      Loading knowledge base...
                    </td>
                  </tr>
                ) : filteredFiles.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500">
                      No uploaded files found for this category.
                    </td>
                  </tr>
                ) : (
                  filteredFiles.map((file) => (
                    <tr key={file.id} className="border-b border-gray-200 last:border-b-0">
                      <td className="px-4 py-3.5 text-sm font-semibold text-gray-900">{file.file_name}</td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${CATEGORY_STYLES[file.category] || 'bg-gray-100 text-gray-700'}`}>
                          {file.category.charAt(0).toUpperCase() + file.category.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-600">{(file.file_type || '').replace('.', '').toUpperCase() || '-'}</td>
                      <td className="px-4 py-3.5 text-sm text-gray-600">{formatDate(file.created_at)}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handlePreview(file.id)}
                            disabled={isPreviewLoading}
                            className="rounded-lg p-1.5 text-indigo-500 transition hover:bg-indigo-50 hover:text-indigo-600"
                            title="View preview"
                          >
                            <Eye className="h-4.5 w-4.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(file.id)}
                            disabled={deletingId === file.id}
                            className="rounded-lg p-1.5 text-red-500 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                            title="Delete file"
                          >
                            <Trash2 className="h-4.5 w-4.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {previewState ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-[700px] rounded-[20px] border border-gray-200 bg-white p-5 shadow-[0_20px_52px_rgba(15,23,42,0.16)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{previewState.file.file_name}</h3>
                <p className="mt-1 text-xs text-gray-500">
                  {previewState.file.category}
                  {previewState.file.instructions ? ` • ${previewState.file.instructions}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewState(null)}
                className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close preview"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="mt-4 max-h-[340px] overflow-y-auto rounded-2xl border border-gray-200 bg-gray-50 p-3">
              <pre className="whitespace-pre-wrap break-words text-xs leading-5 text-gray-700">
                {previewState.preview || 'No preview available for this file.'}
              </pre>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
