import React, { useRef, useState } from 'react';
import { useKnowledgeBase } from '../../context/KnowledgeBaseContext';
import { Upload, FileIcon } from 'lucide-react';

export default function UploadFileModal() {
  const { isUploadModalOpen, closeUploadModal, uploadFile, isLoading } =
    useKnowledgeBase();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (selectedFile) {
      try {
        await uploadFile(selectedFile);
        setSelectedFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } catch (error) {
        console.error('Upload failed from component');
      }
    }
  };

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  if (!isUploadModalOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-8 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Upload File</h2>
          <button
            onClick={closeUploadModal}
            className="rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
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

        <p className="mt-2 text-base text-gray-600">
          Add a new file to the agent's knowledge base.
        </p>

        <div
          className={`mt-6 flex h-48 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition ${
            dragActive
              ? 'border-blue-500 bg-blue-50'
              : selectedFile
              ? 'border-green-300 bg-green-50'
              : 'border-gray-300 bg-gray-50 hover:border-blue-500 hover:bg-blue-50'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept=".pdf,.txt,.md,.csv,.json"
          />
          {selectedFile ? (
            <div className="text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600 mx-auto">
                <FileIcon size={24} />
              </div>
              <div className="font-semibold text-green-600">File Selected:</div>
              <div className="text-gray-800 mt-1 truncate max-w-xs">{selectedFile.name}</div>
              <div className="text-xs text-gray-500 mt-1">
                {(selectedFile.size / 1024).toFixed(2)} KB
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-500">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400 mx-auto">
                <Upload size={24} />
              </div>
              <div className="font-semibold text-gray-700">Click to browse or drag & drop</div>
              <div className="text-xs text-gray-500 mt-2">PDF, TXT, MD, CSV, JSON (Max 5MB)</div>
            </div>
          )}
        </div>

        <div className="mt-8 flex justify-end gap-4">
          <button
            onClick={closeUploadModal}
            disabled={isLoading}
            className="rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-800 transition hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!selectedFile || isLoading}
            className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Uploading...' : 'Upload File'}
          </button>
        </div>
      </div>
    </div>
  );
}
