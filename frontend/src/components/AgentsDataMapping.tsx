import React, { useEffect, useState } from 'react';
import { Network, Info } from 'lucide-react';
import axios from 'axios';

interface AgentDataMapping {
  name: string;
  description: string;
  compatible_datasets: string[];
  icon: string;
}

interface AgentsMappingProps {
  selectedDatasets?: string[];
}

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:8001/api';

export default function AgentsDataMapping({
  selectedDatasets = [],
}: AgentsMappingProps) {
  const [mapping, setMapping] = useState<Record<string, AgentDataMapping>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMapping = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`${API_BASE}/agents-data-mapping`, {
          withCredentials: true,
        });
        if (response.data.success) {
          setMapping(response.data.mapping);
          setError(null);
        }
      } catch (err) {
        console.error('Failed to fetch agents mapping:', err);
        setError('Failed to load agent information');
      } finally {
        setLoading(false);
      }
    };

    fetchMapping();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
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

  const agents = Object.entries(mapping);

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex items-center gap-3">
        <Network className="h-5 w-5 text-purple-600" />
        <h3 className="text-lg font-semibold text-gray-900">Agent Data Compatibility</h3>
      </div>

      <p className="text-sm text-gray-600">
        Selected datasets will activate compatible agents for your analysis.
      </p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {agents.map(([agentId, agent]) => {
          const isCompatible =
            selectedDatasets.length === 0 ||
            agent.compatible_datasets.some((ds) => selectedDatasets.includes(ds));

          return (
            <div
              key={agentId}
              className={`rounded-lg border p-3 transition-all ${
                isCompatible
                  ? 'border-blue-200 bg-blue-50'
                  : 'border-gray-200 bg-gray-50 opacity-60'
              }`}
            >
              <div className="flex items-start gap-2">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0 ${
                    isCompatible
                      ? 'bg-blue-200 text-blue-700'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  <span className="text-xs font-bold">
                    {agent.name.charAt(0)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <h4
                    className={`font-medium text-sm ${
                      isCompatible ? 'text-gray-900' : 'text-gray-700'
                    }`}
                  >
                    {agent.name}
                  </h4>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {agent.description}
                  </p>

                  {agent.compatible_datasets.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {agent.compatible_datasets.map((dataset) => {
                        const isSelected = selectedDatasets.includes(dataset);
                        return (
                          <span
                            key={dataset}
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              isSelected
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {dataset}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {!isCompatible && selectedDatasets.length > 0 && (
                <div className="mt-2 flex items-center gap-1 text-xs text-gray-500">
                  <Info className="h-3 w-3" />
                  <span>
                    Requires{' '}
                    {agent.compatible_datasets.join(' or ')}
                  </span>
                </div>
              )}

              {isCompatible && selectedDatasets.length > 0 && (
                <div className="mt-2 flex items-center gap-1 text-xs font-medium text-green-700">
                  <span>✓ Ready to use</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

