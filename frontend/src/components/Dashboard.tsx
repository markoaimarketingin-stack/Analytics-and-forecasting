import React from 'react';
import { useKnowledgeBase } from '../context/KnowledgeBaseContext';

interface DashboardProps {
  result: any;
  isLoading: boolean;
}

export default function Dashboard({ result, isLoading }: DashboardProps) {
  const { openKnowledgeModal, openUploadModal } = useKnowledgeBase();

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
      <div className="flex min-h-[560px] flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm xl:flex-row">
        {/* Main Welcome Area */}
        <div className="flex flex-1 flex-col items-center justify-center px-10 py-16 text-center">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-blue-100">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-blue-600">
              <path d="M13 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V9L13 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M13 2V9H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Welcome to Analytics</h2>
          <p className="mt-3 text-gray-600">Upload data or use existing files to get started with analysis</p>
        </div>

        {/* Suggestions Panel */}
        <div className="w-full border-t border-gray-200 bg-[#fafafa] p-10 xl:w-[380px] xl:border-l xl:border-t-0">
          <div className="flex flex-col space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">Quick Actions</h3>
            <button
              onClick={() => openKnowledgeModal()}
              className="rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              📂 Use Existing Data
            </button>
            <button
              onClick={() => openUploadModal()}
              className="rounded-lg border border-transparent bg-blue-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              ⬆️ Upload File
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Results display */}
    </div>
  );
}