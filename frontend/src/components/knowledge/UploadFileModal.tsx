import React, { useRef, useState } from 'react';
import { useKnowledgeBase } from '../../context/KnowledgeBaseContext';

export default function UploadFileModal() {
  const { isUploadModalOpen, closeUploadModal, uploadFile, isLoading } =
    useKnowledgeBase();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

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
        // The context handles closing and switching modals on success
        setSelectedFile(null); // Reset after upload
      } catch (error) {
        // Error is handled in context, but you could show a local error message here
        console.error('Upload failed from component');
      }
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
            {/* ... close icon svg ... */}
          </button>
        </div>
        <p className="mt-2 text-base text-gray-600">
          Add a new file to the agent's knowledge base.
        </p>

        <div
          className="mt-6 flex h-48 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 transition hover:border-blue-500 hover:bg-blue-50"
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
          />
          {selectedFile ? (
            <div className="text-center">
                <div className="font-semibold text-blue-600">File Selected:</div>
                <div className="text-gray-800">{selectedFile.name}</div>
            </div>
          ) : (
            <div className="text-center text-gray-500">
                <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 5V19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                </div>
              <div>Click to browse or drag & drop</div>
              <div className="text-xs">PDF, TXT, MD, CSV (Max 5MB)</div>
            </div>
          )}
        </div>

        <div className="mt-8 flex justify-end gap-4">
          <button
            onClick={closeUploadModal}
            className="rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-800 transition hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!selectedFile || isLoading}
            className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:bg-blue-300"
          >
            {isLoading ? 'Uploading...' : 'Upload and Process'}
          </button>
        </div>
      </div>
    </div>
  );
}
