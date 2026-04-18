import { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  DatabaseZap,
  Download,
  LoaderCircle,
  Search,
  TableProperties,
} from 'lucide-react';

import { getAvailableDatasets, runDataQueryAgent } from '../../services/api';
import AgentHeaderActions from '../shared/AgentHeaderActions';

interface DataQueryWorkspaceProps {
  clientId?: string;
}

interface QueryExecutionState {
  chosenDataset: string | null;
  rows: Array<Record<string, unknown>>;
  columns: string[];
  status: 'idle' | 'ready' | 'not_enough_info';
  message: string;
}

const EMPTY_INFO_MESSAGE =
  'Not enough information within the available data to answer this request confidently.';

export default function DataQueryWorkspace({ clientId }: DataQueryWorkspaceProps) {
  const [prompt, setPrompt] = useState('');
  const [datasets, setDatasets] = useState<string[]>([]);
  const [isLoadingDatasets, setIsLoadingDatasets] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [execution, setExecution] = useState<QueryExecutionState>({
    chosenDataset: null,
    rows: [],
    columns: [],
    status: 'idle',
    message: 'Ask the agent a question about your data. It will decide which dataset to inspect.',
  });

  useEffect(() => {
    let cancelled = false;

    const loadDatasets = async () => {
      setIsLoadingDatasets(true);
      setError(null);

      try {
        const response = await getAvailableDatasets(clientId);
        const available = Array.isArray(response?.datasets)
          ? response.datasets
              .map((item) => {
                if (typeof item === 'string') return item;
                if (item && typeof item === 'object' && 'name' in item) return String((item as { name?: unknown }).name || '');
                return '';
              })
              .filter((value) => value.trim().length > 0)
          : [];
        const fallback = ['campaigns', 'customers', 'events', 'retention', 'transactions'];

        if (cancelled) return;
        setDatasets(available.length > 0 ? available : fallback);
      } catch (loadError) {
        if (cancelled) return;
        setDatasets(['campaigns', 'customers', 'events', 'retention', 'transactions']);
        setError(loadError instanceof Error ? loadError.message : 'Unable to load dataset catalog.');
      } finally {
        if (!cancelled) {
          setIsLoadingDatasets(false);
        }
      }
    };

    loadDatasets();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const resultRows = execution.rows;
  const resultColumns = execution.columns;

  const resultSubtitle = useMemo(() => {
    if (execution.status === 'not_enough_info') return EMPTY_INFO_MESSAGE;
    if (execution.chosenDataset && resultRows.length > 0) {
      return `Agent selected ${execution.chosenDataset} and returned ${formatCount(resultRows.length)} rows.`;
    }
    return execution.message;
  }, [execution, resultRows.length]);

  const handleRunQuery = async () => {
    if (!prompt.trim()) {
      setError('Enter a prompt so the agent can decide how to query the data.');
      return;
    }

    setIsRunning(true);
    setError(null);

    try {
      const response = await runDataQueryAgent({
        prompt: prompt.trim(),
        client_id: clientId,
        limit: 50,
      });

      const payload = (response && typeof response === 'object' ? response : {}) as Record<string, unknown>;
      const data = (payload.data && typeof payload.data === 'object') ? payload.data as Record<string, unknown> : {};
      const chosenDatasets = Array.isArray(data.chosen_datasets) ? data.chosen_datasets.map((item) => String(item)) : [];
      const rows = Array.isArray(data.rows) ? data.rows as Array<Record<string, unknown>> : [];
      const columns = Array.isArray(data.columns) ? data.columns.map((item) => String(item)) : inferColumns(rows);
      const insufficientData = Boolean(data.insufficient_data);
      const message = typeof data.message === 'string' ? data.message : EMPTY_INFO_MESSAGE;

      if (insufficientData || rows.length === 0 || columns.length === 0) {
        setExecution({
          chosenDataset: chosenDatasets[0] || null,
          rows: [],
          columns: [],
          status: 'not_enough_info',
          message,
        });
        return;
      }

      setExecution({
        chosenDataset: chosenDatasets[0] || null,
        rows,
        columns,
        status: 'ready',
        message,
      });
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Unable to fetch query results.');
    } finally {
      setIsRunning(false);
    }
  };

  const handleDownloadCsv = () => {
    if (resultRows.length === 0 || resultColumns.length === 0) return;

    const csv = [
      resultColumns.join(','),
      ...resultRows.map((row) =>
        resultColumns
          .map((column) => escapeCsvValue(row[column]))
          .join(','),
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${execution.chosenDataset || 'agent-query-results'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="workspace-surface workspace-modern">
      <div className="workspace-header-glass workspace-header-glass-modern px-8 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="workspace-agent-icon">
              <DatabaseZap className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-gray-900">Data Query Agent</h1>
            </div>
          </div>
          <AgentHeaderActions clientId={clientId} />
        </div>
      </div>

      <div className="workspace-content">
        <div className="mx-auto w-full max-w-6xl space-y-6">
          <div className="workspace-panel">
            <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span className="workspace-option-pill">
                <Bot className="h-3.5 w-3.5" />
                Agent-led dataset selection
              </span>
              <span className="workspace-option-pill">
                <TableProperties className="h-3.5 w-3.5" />
                Datasets connected: {formatCount(datasets.length)}
              </span>
              <span className="workspace-option-pill">
                Client: {clientId ? 'Connected' : 'Session'}
              </span>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
              <label className="text-sm text-gray-600">
                Prompt
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Example: Which channels are driving the most revenue lately? Which customer segments are churning? Show recent transaction trends."
                  className="mt-1 min-h-[132px] w-full rounded-[18px] border border-gray-300 bg-white px-4 py-3 text-[15px] leading-6 text-gray-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                />
                <p className="mt-2 text-xs text-gray-500">
                  Ask for information and let the agent decide how to query the warehouse.
                </p>
              </label>

              <div className="flex flex-col justify-end gap-3">
                <button
                  type="button"
                  onClick={handleRunQuery}
                  disabled={isRunning || isLoadingDatasets}
                  className="workspace-action-btn h-11 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 disabled:opacity-60"
                >
                  {isRunning ? (
                    <>
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      Querying...
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4" />
                      Fetch Data
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleDownloadCsv}
                  disabled={resultRows.length === 0}
                  className="workspace-action-btn h-11 rounded-xl border border-gray-300 bg-white px-5 text-gray-800 shadow-none hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  Download CSV
                </button>
              </div>
            </div>

            {error ? (
              <p className="mt-4 rounded-xl border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-700">{error}</p>
            ) : null}
          </div>

          <div className="workspace-panel">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Results</h3>
                <p className="mt-1 text-sm text-gray-500">{resultSubtitle}</p>
              </div>
              {execution.chosenDataset ? (
                <span className="workspace-option-pill border-gray-300 bg-gray-50 text-gray-700">
                  Agent chose: {execution.chosenDataset}
                </span>
              ) : null}
            </div>

            {execution.status === 'not_enough_info' ? (
              <div className="mt-4 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-600">
                {EMPTY_INFO_MESSAGE}
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-gray-500">
                    <tr>
                      {(resultColumns.length > 0 ? resultColumns : ['status']).map((column) => (
                        <th key={column} className="px-3 py-2 font-semibold">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {resultRows.length > 0 ? (
                      resultRows.map((row, index) => (
                        <tr key={`row-${index}`} className="border-t border-gray-100">
                          {resultColumns.map((column) => (
                            <td key={`${index}-${column}`} className="max-w-[260px] truncate px-3 py-2 text-gray-700">
                              {formatCellValue(row[column])}
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="px-3 py-4 text-gray-500" colSpan={Math.max(resultColumns.length, 1)}>
                          Ask a question and run the agent to fetch data.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function inferColumns(rows: unknown): string[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const first = rows[0];
  if (!first || typeof first !== 'object' || Array.isArray(first)) return [];
  return Object.keys(first as Record<string, unknown>);
}

function formatCount(value?: number): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '-';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString() : '-';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function escapeCsvValue(value: unknown): string {
  const normalized = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (normalized.includes('"') || normalized.includes(',') || normalized.includes('\n')) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}
