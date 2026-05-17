import React, { useState } from 'react';
import { useKnowledgeBase } from '../../context/KnowledgeBaseContext';
import { Trash2 } from 'lucide-react';

export default function ExistingFilesModal() {
  const {
    isKnowledgeModalOpen,
    closeKnowledgeModal,
    files,
    isLoading,
    error,
    selectedFile,
    selectFile,
    deleteFile,
  } = useKnowledgeBase();

  const [deletingFileId, setDeletingFileId] = useState<number | null>(null);

  if (!isKnowledgeModalOpen) {
    return null;
  }

  const handleDeleteFile = async (fileId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this file?')) {
      setDeletingFileId(fileId);
      try {
        await deleteFile(fileId);
      } catch (err) {
        console.error('Failed to delete file:', err);
      } finally {
        setDeletingFileId(null);
      }
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 p-8 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Knowledge Base</h2>
          <button
            onClick={closeKnowledgeModal}
            className="rounded-full p-2 text-zinc-400 transition hover:bg-zinc-900 hover:text-white"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M6 6L18 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        <p className="mt-2 text-base text-zinc-400">
          Select a file to use as context for the agent.
        </p>

        <div className="mt-6 max-h-80 min-h-[12rem] overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <div className="mb-3 inline-block animate-spin rounded-full border-4 border-zinc-700 border-t-zinc-500 h-8 w-8"></div>
                <p className="text-zinc-400">Loading files...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center text-red-500">
              <div className="text-center">
                <p className="font-semibold">Error</p>
                <p className="text-sm">{error}</p>
              </div>
            </div>
          ) : files.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800 text-zinc-300">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M14 2V8H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <p className="font-semibold text-white">No files found</p>
              <p className="text-sm text-zinc-400">Upload a file to get started.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {files.map((file) => (
                <li
                  key={file.id}
                  onClick={() => selectFile(file)}
                  className={`cursor-pointer rounded-lg border-2 p-4 transition ${
                    selectedFile?.id === file.id
                      ? 'border-zinc-700 bg-zinc-900'
                      : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700 hover:bg-zinc-900'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedFile?.id === file.id}
                          onChange={() => selectFile(file)}
                          className="h-4 w-4 rounded cursor-pointer"
                        />
                        <div>
                          <div className="font-semibold text-white">{file.file_name}</div>
                          <div className="text-xs text-zinc-400 mt-1">
                            {formatFileSize(file.file_size)} • {formatDate(file.created_at)}
                          </div>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDeleteFile(file.id, e)}
                      disabled={deletingFileId === file.id}
                      className="ml-2 rounded-lg p-2 text-zinc-400 transition hover:bg-red-900/40 hover:text-red-400 disabled:opacity-50"
                      title="Delete file"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-8 flex justify-end gap-4">
          <button
            onClick={closeKnowledgeModal}
            className="rounded-xl border border-zinc-800 bg-zinc-950 px-6 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-zinc-900"
          >
            Cancel
          </button>
          <button
            disabled={!selectedFile || isLoading}
            className="rounded-xl bg-zinc-800 px-6 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:bg-zinc-700 disabled:cursor-not-allowed"
          >
            {selectedFile ? `Use: ${selectedFile.file_name}` : 'Select a File'}
          </button>
        </div>
      </div>
    </div>
  );
}
