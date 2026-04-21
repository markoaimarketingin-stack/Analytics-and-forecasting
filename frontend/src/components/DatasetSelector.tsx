import React, { useEffect, useState } from 'react';
import { Database, Check, X } from 'lucide-react';
import axios from 'axios';

interface Dataset {
  name: string;
  description: string;
  agent_types: string[];
  row_count: number;
  columns: string[];
}

interface DatasetSelectorProps {
  onDatasetsSelected: (datasets: string[]) => void;
  selectedDatasets?: string[];
  isLoading?: boolean;
}

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:8001/api';

export default function DatasetSelector({
  onDatasetsSelected,
  selectedDatasets = [],
  isLoading = false,
}: DatasetSelectorProps) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selected, setSelected] = useState<string[]>(selectedDatasets);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedDataset, setExpandedDataset] = useState<string | null>(null);

  useEffect(() => {
    const fetchDatasets = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`${API_BASE}/available-datasets`, {
          withCredentials: true,
        });
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

    fetchDatasets();
  }, []);

  const handleToggleDataset = (datasetName: string) => {
    setSelected((prev) => {
      const updated = prev.includes(datasetName)
        ? prev.filter((d) => d !== datasetName)
        : [...prev, datasetName];
      onDatasetsSelected(updated);
      return updated;
    });
  };

  const handleClearAll = () => {
    setSelected([]);
    onDatasetsSelected([]);
  };

  const handleSelectAll = () => {
    const allDatasets = datasets.map((d) => d.name);
    setSelected(allDatasets);
    onDatasetsSelected(allDatasets);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
          <p className="text-sm text-gray-600">Loading available datasets...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-800">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Database className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">Available Datasets</h3>
          <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
            {datasets.length}
          </span>
        </div>
        {selected.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-600">
              {selected.length} selected
            </span>
            <button
              onClick={handleClearAll}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {selected.length === 0 && datasets.length > 0 && (
        <button
          onClick={handleSelectAll}
          className="text-xs text-blue-600 hover:text-blue-700"
        >
          Select all datasets
        </button>
      )}

      <div className="space-y-2">
        {datasets.map((dataset) => {
          const isSelected = selected.includes(dataset.name);
          const isExpanded = expandedDataset === dataset.name;

          return (
            <div
              key={dataset.name}
              className="border border-gray-200 rounded-lg overflow-hidden transition-all hover:border-blue-300"
            >
              <div
                className="flex items-start gap-3 p-3 cursor-pointer bg-gray-50 hover:bg-blue-50"
                onClick={() => handleToggleDataset(dataset.name)}
              >
                <div className="flex-shrink-0 pt-0.5">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleToggleDataset(dataset.name);
                    }}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </div>
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
                  <p className="text-sm text-gray-600 mt-1">{dataset.description}</p>

                  {dataset.agent_types.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {dataset.agent_types.map((agent) => (
                        <span
                          key={agent}
                          className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
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
                    setExpandedDataset(isExpanded ? null : dataset.name);
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
                <div className="border-t border-gray-200 bg-white p-3">
                  <h5 className="text-xs font-semibold text-gray-700 mb-2">
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
                <div className="flex items-center justify-between bg-green-50 border-t border-green-200 p-2 px-3">
                  <span className="text-xs font-medium text-green-700">
                    Selected for analysis
                  </span>
                  <Check className="h-4 w-4 text-green-600" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {datasets.length === 0 && !loading && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-center">
          <p className="text-sm text-yellow-800">
            No datasets available. Please check your Supabase connection.
          </p>
        </div>
      )}
    </div>
  );
}

