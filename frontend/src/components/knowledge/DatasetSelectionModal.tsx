import React, { useEffect, useState } from 'react';
import { X, Database, Check } from 'lucide-react';
import axios from 'axios';
import { useKnowledgeBase } from '../../context/KnowledgeBaseContext';

interface Dataset {
  name: string;
  description: string;
  agent_types: string[];
  row_count: number;
  columns: string[];
}

const API_BASE = 'http://localhost:8001/api';

export default function DatasetSelectionModal() {
  const { isDatasetSelectionModalOpen, closeDatasetSelectionModal, selectedDatasets, setSelectedDatasets } = useKnowledgeBase();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [localSelected, setLocalSelected] = useState<string[]>(selectedDatasets);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDataset, setExpandedDataset] = useState<string | null>(null);

  // Load datasets when modal opens
  useEffect(() => {
    if (isDatasetSelectionModalOpen) {
      fetchDatasets();
      setLocalSelected(selectedDatasets);
    }
  }, [isDatasetSelectionModalOpen, selectedDatasets]);

  const fetchDatasets = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE}/available-datasets`);
      if (response.data.success) {
        setDatasets(response.data.datasets);
        setError(null);
      }
    } catch (err) {
      console.error('Failed to fetch datasets:', err);
      setError('Failed to load available datasets');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleDataset = (datasetName: string) => {
    setLocalSelected((prev) => {
      if (prev.includes(datasetName)) {
        return prev.filter((d) => d !== datasetName);
      } else {
        return [...prev, datasetName];
      }
    });
  };

  const handleClearAll = () => {
    setLocalSelected([]);
  };

  const handleSelectAll = () => {
    const allDatasets = datasets.map((d) => d.name);
    setLocalSelected(allDatasets);
  };

  const handleSave = () => {
    setSelectedDatasets(localSelected);
    closeDatasetSelectionModal();
  };

  return (
    <>
      {/* Modal */}
      {isDatasetSelectionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="h-[90vh] w-[90vw] max-w-2xl overflow-hidden rounded-lg bg-white shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-200 p-6">
              <div className="flex items-center gap-3">
                <Database className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-semibold text-gray-900">
                  Select Existing Data
                </h2>
              </div>
              <button
                onClick={closeDatasetSelectionModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
                </div>
              ) : error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Selection Controls */}
                  {datasets.length > 0 && (
                    <div className="flex gap-2 pb-4">
                      <button
                        onClick={handleSelectAll}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        Select All
                      </button>
                      {localSelected.length > 0 && (
                        <>
                          <span className="text-xs text-gray-400">|</span>
                          <button
                            onClick={handleClearAll}
                            className="text-xs font-medium text-gray-600 hover:text-gray-700"
                          >
                            Clear All
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {/* Datasets List */}
                  <div className="space-y-3">
                    {datasets.map((dataset) => {
                      const isSelected = localSelected.includes(dataset.name);
                      const isExpanded = expandedDataset === dataset.name;

                      return (
                        <div
                          key={dataset.name}
                          className="border border-gray-200 rounded-lg overflow-hidden"
                        >
                          <div
                            className="flex items-start gap-3 p-4 bg-gray-50 cursor-pointer hover:bg-blue-50"
                            onClick={() => handleToggleDataset(dataset.name)}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                e.stopPropagation();
                                handleToggleDataset(dataset.name);
                              }}
                              className="h-4 w-4 rounded border-gray-300 text-blue-600 mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium text-gray-900 capitalize">
                                  {dataset.name}
                                </h4>
                                {dataset.row_count > 0 && (
                                  <span className="text-xs text-gray-500">
                                    {dataset.row_count.toLocaleString()} rows
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-600 mt-1">
                                {dataset.description}
                              </p>

                              {dataset.agent_types.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {dataset.agent_types.map((agent) => (
                                    <span
                                      key={agent}
                                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
                                    >
                                      {agent}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedDataset(
                                  isExpanded ? null : dataset.name
                                );
                              }}
                              className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                            >
                              <svg
                                className={`h-4 w-4 transition-transform ${
                                  isExpanded ? 'transform rotate-180' : ''
                                }`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 14l-7 7m0 0l-7-7m7 7V3"
                                />
                              </svg>
                            </button>
                          </div>

                          {isExpanded && dataset.columns.length > 0 && (
                            <div className="border-t border-gray-200 bg-white p-4">
                              <h5 className="text-xs font-semibold text-gray-700 mb-3">
                                Available Columns:
                              </h5>
                              <div className="grid grid-cols-2 gap-2">
                                {dataset.columns.map((column) => (
                                  <div
                                    key={column}
                                    className="flex items-center gap-1 text-xs text-gray-600"
                                  >
                                    <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                                    {column}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {isSelected && (
                            <div className="flex items-center justify-between bg-green-50 border-t border-green-200 p-2 px-4">
                              <span className="text-xs font-medium text-green-700">
                                Selected
                              </span>
                              <Check className="h-4 w-4 text-green-600" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-200 bg-gray-50 px-6 py-4 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                {localSelected.length} of {datasets.length} datasets selected
              </div>
              <div className="flex gap-3">
                <button
                  onClick={closeDatasetSelectionModal}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  Save Selection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}




