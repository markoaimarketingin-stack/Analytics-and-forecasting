import React, { useState, useEffect, useRef } from 'react';
import { getAgentFiles, uploadAgentFile } from '../services/api';
import type { File as AgentFile } from '../types';

interface DashboardProps {
  result: any;
  isLoading: boolean;
}

export default function Dashboard({ result, isLoading }: DashboardProps) {
  const [isKnowledgeModalOpen, setIsKnowledgeModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [files, setFiles] = useState<AgentFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isKnowledgeModalOpen) {
      fetchFiles();
    }
  }, [isKnowledgeModalOpen]);

  const fetchFiles = async () => {
    const agentFiles = await getAgentFiles();
    setFiles(agentFiles);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setIsUploading(true);
      try {
        await uploadAgentFile(file);
        // Refresh the file list after upload
        fetchFiles();
        // Close upload modal and open knowledge base to show the new file
        setIsUploadModalOpen(false);
        setIsKnowledgeModalOpen(true);
      } catch (error) {
        console.error("Upload failed:", error);
        // Handle upload error (e.g., show a notification)
      } finally {
        setIsUploading(false);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        {[1, 2, 3, 4].map((item) => (
          <div
            key={item}
            className="h-64 animate-pulse rounded-3xl border border-gray-200 bg-white shadow-sm"
          />
        ))}
      </div>
    );
  }

  if (!result) {
    return (
      <>
        <div className="flex min-h-[560px] flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm xl:flex-row">
          {/* Main Welcome Area */}
          <div className="flex flex-1 flex-col items-center justify-center px-10 py-16 text-center">
            {/* ... existing welcome content ... */}
          </div>

          {/* Suggestions Panel */}
          <div className="w-full border-t border-gray-200 bg-[#fafafa] p-10 xl:w-[380px] xl:border-l xl:border-t-0">
            <div className="flex flex-col space-y-4">
              <h3 className="text-lg font-semibold text-gray-800">Knowledge Base</h3>
              <button
                onClick={() => setIsKnowledgeModalOpen(true)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Use Existing Data
              </button>
              <button
                onClick={() => setIsUploadModalOpen(true)}
                className="rounded-lg border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Upload File
              </button>
            </div>
          </div>
        </div>

        {/* Knowledge Base Modal */}
        {isKnowledgeModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="w-full max-w-lg rounded-lg bg-white p-6">
              <h2 className="text-xl font-semibold">Existing Files</h2>
              <ul className="mt-4 space-y-2">
                {files.map((file) => (
                  <li key={file.id} className="rounded-md border p-2">
                    {file.file_name}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => setIsKnowledgeModalOpen(false)}
                className="mt-4 rounded bg-gray-200 px-4 py-2"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Upload File Modal */}
        {isUploadModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="w-full max-w-lg rounded-lg bg-white p-6 text-center">
              <h2 className="text-xl font-semibold">Upload a File</h2>
              <p className="mt-2 text-gray-600">
                Upload a file to the agent's knowledge base.
              </p>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                onClick={handleUploadClick}
                disabled={isUploading}
                className="mt-4 rounded bg-blue-600 px-4 py-2 text-white disabled:bg-blue-300"
              >
                {isUploading ? "Uploading..." : "Select File"}
              </button>
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="ml-2 mt-4 rounded bg-gray-200 px-4 py-2"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
      // ... existing result display ...
    <div className="grid gap-6 lg:grid-cols-2">
    </div>
  );
}