import React from 'react';
import { useKnowledgeBase } from '../../context/KnowledgeBaseContext';

export default function ExistingFilesModal() {
  const { isKnowledgeModalOpen, closeKnowledgeModal, files, isLoading, error } =
    useKnowledgeBase();

  if (!isKnowledgeModalOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-8 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Knowledge Base</h2>
          <button
            onClick={closeKnowledgeModal}
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
          Select a file to use as context for the agent.
        </p>

        <div className="mt-6 max-h-80 min-h-[12rem] overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-gray-500">Loading files...</p>
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center text-red-500">
              <p>{error}</p>
            </div>
          ) : files.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
               <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M14 2V8H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <p className="font-semibold text-gray-800">No files found</p>
              <p className="text-sm text-gray-500">Upload a file to get started.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {files.map((file) => (
                <li
                  key={file.id}
                  className="cursor-pointer rounded-lg border border-gray-200 bg-white p-4 text-gray-800 transition hover:border-blue-500 hover:bg-blue-50 hover:shadow-sm"
                >
                  <div className="font-medium">{file.file_name}</div>
                  <div className="text-xs text-gray-500">
                    {(file.file_size / 1024).toFixed(2)} KB
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-8 flex justify-end gap-4">
          <button
            onClick={closeKnowledgeModal}
            className="rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-800 transition hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            // Add selection logic here
            // disabled={!selectedFile}
            className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:bg-blue-300"
          >
            Use Selected File
          </button>
        </div>
      </div>
    </div>
  );
}
