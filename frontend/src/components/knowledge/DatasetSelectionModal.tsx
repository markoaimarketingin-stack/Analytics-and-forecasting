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
          <div className="h-[90vh] w-[94vw] max-w-6xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div className="flex items-center gap-3">
                <Database className="h-5 w-5 text-violet-600" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Knowledge Base Datasets</h2>
                  <p className="text-xs text-gray-500">Connected to Supabase with CSV update support.</p>
                </div>
              </div>

              <button
                onClick={closeDatasetSelectionModal}
                className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid h-[calc(90vh-72px)] grid-cols-12 overflow-hidden">
              <div className="col-span-4 border-r border-gray-200 p-4 lg:col-span-3">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Datasets</div>
                  <button
                    onClick={() => {
                      void loadDatasetMeta();
                      void loadDatasetRows(activeDataset);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
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
                          ? 'border-violet-300 bg-violet-50'
                          : 'border-gray-200 bg-white hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-gray-900">{dataset.label}</div>
                        {activeDataset === dataset.name && <Check className="h-4 w-4 text-violet-600" />}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">{dataset.rowCount.toLocaleString()} rows</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="col-span-8 flex flex-col overflow-hidden p-4 lg:col-span-9">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 capitalize">{activeDataset}</h3>
                    <p className="text-sm text-gray-600">{activeMeta?.description || 'Dataset preview and update controls.'}</p>
                    {source && <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Source: {source}</p>}
                  </div>

                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">
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

                {error && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
                {successMessage && <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{successMessage}</div>}

                <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-gray-200">
                  {isLoadingMeta || isLoadingRows ? (
                    <div className="flex h-full items-center justify-center text-sm text-gray-500">Loading dataset preview...</div>
                  ) : datasetRows.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-gray-500">No rows found for this dataset.</div>
                  ) : (
                    <table className="min-w-full text-left text-xs">
                      <thead className="sticky top-0 bg-gray-50 text-gray-600">
                        <tr>
                          {columns.map((column) => (
                            <th key={column} className="border-b border-gray-200 px-3 py-2 font-semibold uppercase tracking-wide">{column}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {datasetRows.map((row, index) => (
                          <tr key={`${activeDataset}-row-${index}`} className="border-b border-gray-100 last:border-b-0">
                            {columns.map((column) => (
                              <td key={`${index}-${column}`} className="px-3 py-2 text-gray-700">
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

