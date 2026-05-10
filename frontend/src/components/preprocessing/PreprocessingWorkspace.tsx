import { useEffect, useState } from 'react';
import {
  Cloud,
  Database,
  Layers,
} from 'lucide-react';
import AgentHeaderActions from '../shared/AgentHeaderActions';
import { listTrainingUploads } from '../../services/api';
import type { TrainingUploadFile } from '../types';

interface PreprocessingWorkspaceProps {
  clientId?: string;
}

export default function PreprocessingWorkspace({ clientId }: PreprocessingWorkspaceProps) {
  const [files, setFiles] = useState<TrainingUploadFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCount = selectedFiles.length;

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    const loadFiles = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await listTrainingUploads(clientId);
        if (cancelled) return;
        const nextFiles = response.files || [];
        setFiles(nextFiles);
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : 'Failed to load knowledge base data.');
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
  }, [clientId]);

  const toggleFile = (fileId: number) => {
    setSelectedFiles((prev) =>
      prev.includes(fileId) ? prev.filter((item) => item !== fileId) : [...prev, fileId]
    );
  };

  return (
    <div className="workspace-surface workspace-modern">
      <div className="workspace-header-glass workspace-header-glass-modern px-8 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="workspace-agent-icon">
              <Layers className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-gray-900">Preprocessing Agent</h1>
              <p className="text-sm text-gray-500">Select knowledge base data to prepare for processing.</p>
            </div>
          </div>
          <AgentHeaderActions clientId={clientId} />
        </div>
      </div>

      <div className="workspace-content">
        <div className="mx-auto w-full max-w-4xl space-y-6">
          <div className="workspace-panel">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
              <Database className="h-4 w-4" /> Data source
            </div>
            <p className="mt-2 text-sm text-gray-600">
              We will connect to S3 later. For now, preprocessing uses the knowledge base.
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <button
                type="button"
                className="flex items-start gap-3 rounded-2xl border border-black bg-black px-4 py-4 text-left text-white"
              >
                <Database className="mt-0.5 h-5 w-5" />
                <div>
                  <div className="text-sm font-semibold">Knowledge Base</div>
                  <div className="text-xs text-white/70">Use curated datasets already synced to the platform.</div>
                </div>
              </button>

              <button
                type="button"
                disabled
                className="flex items-start gap-3 rounded-2xl border border-gray-300 bg-white px-4 py-4 text-left text-gray-400"
              >
                <Cloud className="mt-0.5 h-5 w-5" />
                <div>
                  <div className="text-sm font-semibold">S3 Buckets</div>
                  <div className="text-xs">Coming soon.</div>
                </div>
              </button>
            </div>
          </div>

          <div className="workspace-panel">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Knowledge base data</h2>
                <p className="mt-1 text-sm text-gray-500">Select datasets to preprocess.</p>
              </div>
              <span className="rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-600">
                {selectedCount} selected
              </span>
            </div>

            {!clientId ? (
              <div className="mt-4 rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-600">
                Connect a client to load knowledge base uploads.
              </div>
            ) : null}

            {error ? (
              <div className="mt-4 rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-700">
                {error}
              </div>
            ) : null}

            <div className="mt-4 space-y-3">
              {isLoading ? (
                <div className="rounded-2xl border border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-500">
                  Loading knowledge base data...
                </div>
              ) : files.length === 0 ? (
                <div className="rounded-2xl border border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-500">
                  No knowledge base uploads found.
                </div>
              ) : (
                files.map((file) => {
                  const isSelected = selectedFiles.includes(file.id);
                  return (
                    <button
                      key={file.id}
                      type="button"
                      onClick={() => toggleFile(file.id)}
                      className={`flex w-full items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-all ${
                        isSelected
                          ? 'border-black bg-black text-white'
                          : 'border-gray-300 bg-white text-gray-900 hover:border-black'
                      }`}
                    >
                      <div>
                        <div className="text-sm font-semibold">
                          {file.file_name}
                        </div>
                        <div className={`text-xs ${isSelected ? 'text-white/70' : 'text-gray-500'}`}>
                          {file.category ? `Knowledge base · ${file.category}` : 'Knowledge base'}
                        </div>
                      </div>
                      <div className={`text-[11px] uppercase tracking-wide ${isSelected ? 'text-white/60' : 'text-gray-400'}`}>
                        {(file.file_type || '').replace('.', '').toUpperCase() || 'FILE'}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-300 bg-white px-4 py-3">
              <div className="text-sm text-gray-600">
                Selected data will be staged for preprocessing once the backend is wired.
              </div>
              <button
                type="button"
                disabled
                className="h-11 rounded-xl border border-gray-300 bg-gray-200 px-4 text-sm font-semibold text-gray-500"
              >
                Continue (coming soon)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
