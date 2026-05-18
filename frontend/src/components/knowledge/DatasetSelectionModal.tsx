import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Check, Database, RefreshCw, Upload, X } from 'lucide-react';

import { useKnowledgeBase } from '../../context/KnowledgeBaseContext';
import { getAvailableDatasets, getDatasetRows, uploadDatasetCsv } from '../../services/api';

interface DatasetMeta {
  name: string;
  description: string;
  row_count: number;
  columns: string[];
}

interface DatasetRowsResponse {
  success: boolean;
  dataset: string;
  columns: string[];
  rows: Record<string, unknown>[];
  row_count: number;
  source: string;
}

const DATASET_ORDER = ['campaigns', 'customers', 'events', 'retention', 'transactions'] as const;

export default function DatasetSelectionModal() {
  const {
    isDatasetSelectionModalOpen,
    closeDatasetSelectionModal,
    selectedDatasets,
    setSelectedDatasets,
  } = useKnowledgeBase();

  const [datasetMeta, setDatasetMeta] = useState<Record<string, DatasetMeta>>({});
  const [activeDataset, setActiveDataset] = useState<string>('campaigns');
  const [datasetRows, setDatasetRows] = useState<Record<string, unknown>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [source, setSource] = useState<string>('');
  const [isLoadingMeta, setIsLoadingMeta] = useState(false);
  const [isLoadingRows, setIsLoadingRows] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const activeMeta = datasetMeta[activeDataset];

  useEffect(() => {
    if (!isDatasetSelectionModalOpen) {
      return;
    }

    if (selectedDatasets.length > 0) {
      setActiveDataset(selectedDatasets[0]);
    }

    void loadDatasetMeta();
  }, [isDatasetSelectionModalOpen, selectedDatasets]);

  useEffect(() => {
    if (!isDatasetSelectionModalOpen) {
      return;
    }
    void loadDatasetRows(activeDataset);
  }, [activeDataset, isDatasetSelectionModalOpen]);

  const datasetCards = useMemo(() => {
    return DATASET_ORDER.map((datasetName) => ({
      name: datasetName,
      label: datasetName.charAt(0).toUpperCase() + datasetName.slice(1),
      description: datasetMeta[datasetName]?.description || `Manage ${datasetName} data`,
      rowCount: datasetMeta[datasetName]?.row_count || 0,
    }));
  }, [datasetMeta]);

  const loadDatasetMeta = async () => {
    setIsLoadingMeta(true);
    setError(null);
    try {
      const response = await getAvailableDatasets();
      const mapped: Record<string, DatasetMeta> = {};
      (response.datasets || []).forEach((dataset: DatasetMeta) => {
        mapped[dataset.name] = dataset;
      });
      setDatasetMeta(mapped);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load datasets.');
    } finally {
      setIsLoadingMeta(false);
    }
  };

  const loadDatasetRows = async (datasetName: string) => {
    setIsLoadingRows(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = (await getDatasetRows(datasetName, 50)) as DatasetRowsResponse;
      setColumns(response.columns || []);
      setDatasetRows(response.rows || []);
      setSource(response.source || '');
      setSelectedDatasets([datasetName]);
    } catch (loadError) {
      setDatasetRows([]);
      setColumns([]);
      setSource('');
      setError(loadError instanceof Error ? loadError.message : 'Failed to load dataset rows.');
    } finally {
      setIsLoadingRows(false);
    }
  };

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsUploading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await uploadDatasetCsv(activeDataset, file);
      setSuccessMessage(response.message || `Updated ${activeDataset} successfully.`);
      await loadDatasetMeta();
      await loadDatasetRows(activeDataset);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Failed to update dataset.');
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  return (
    <>
      {isDatasetSelectionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="h-[90vh] w-[94vw] max-w-6xl overflow-hidden rounded-2xl bg-zinc-950 shadow-2xl">
              <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
                <div className="flex items-center gap-3">
                  <Database className="h-5 w-5 text-zinc-300" />
                  <div>
                    <h2 className="text-lg font-semibold text-white">Knowledge Base Datasets</h2>
                    <p className="text-xs text-zinc-400">Connected to Supabase with CSV update support.</p>
                  </div>
                </div>

                <button
                  onClick={closeDatasetSelectionModal}
                  className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

            <div className="grid h-[calc(90vh-72px)] grid-cols-12 overflow-hidden">
              <div className="col-span-4 border-r border-gray-200 p-4 lg:col-span-3">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Datasets</div>
                  <button
                    onClick={() => {
                      void loadDatasetMeta();
                      void loadDatasetRows(activeDataset);
                    }}
                      className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 px-2 py-1 text-xs font-medium text-zinc-400 hover:bg-zinc-900"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Refresh
                  </button>
                </div>

                <div className="space-y-2">
                  {datasetCards.map((dataset) => (
                    <button
                      key={dataset.name}
                      onClick={() => setActiveDataset(dataset.name)}
                        className={`w-full rounded-xl border p-3 text-left transition ${
                          activeDataset === dataset.name
                            ? 'border-zinc-600 bg-zinc-900'
                            : 'border-zinc-800 bg-zinc-950 hover:bg-zinc-900'
                        }`}
                    >
                      <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold text-white">{dataset.label}</div>
                          {activeDataset === dataset.name && <Check className="h-4 w-4 text-zinc-200" />}
                      </div>
                        <div className="mt-1 text-xs text-zinc-400">{dataset.rowCount.toLocaleString()} rows</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="col-span-8 flex flex-col overflow-hidden p-4 lg:col-span-9">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-white capitalize">{activeDataset}</h3>
                    <p className="text-sm text-zinc-400">{activeMeta?.description || 'Dataset preview and update controls.'}</p>
                    {source && <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-300">Source: {source}</p>}
                  </div>

                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-zinc-800 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700">
                    <Upload className="h-4 w-4" />
                    {isUploading ? 'Updating...' : 'Update via CSV'}
                    <input
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={handleFileUpload}
                      disabled={isUploading}
                    />
                  </label>
                </div>

                {error && <div className="mb-3 rounded-xl border border-red-600 bg-red-900/40 px-3 py-2 text-sm text-red-300">{error}</div>}
                {successMessage && <div className="mb-3 rounded-xl border border-zinc-700 bg-zinc-900/40 px-3 py-2 text-sm text-zinc-200">{successMessage}</div>}

                <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-zinc-800 bg-zinc-950">
                  {isLoadingMeta || isLoadingRows ? (
                    <div className="flex h-full items-center justify-center text-sm text-zinc-400">Loading dataset preview...</div>
                  ) : datasetRows.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-zinc-400">No rows found for this dataset.</div>
                  ) : (
                    <table className="min-w-full text-left text-xs">
                      <thead className="sticky top-0 bg-zinc-900 text-zinc-400">
                        <tr>
                          {columns.map((column) => (
                            <th key={column} className="border-b border-zinc-800 px-3 py-2 font-semibold uppercase tracking-wide">{column}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {datasetRows.map((row, index) => (
                          <tr key={`${activeDataset}-row-${index}`} className="border-b border-zinc-800 last:border-b-0">
                            {columns.map((column) => (
                              <td key={`${index}-${column}`} className="px-3 py-2 text-zinc-200">
                                {String(row[column] ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

