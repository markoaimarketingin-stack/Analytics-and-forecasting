// src/services/api.ts

import type {
  AgentOrchestrationApiResponse,
  AgentOrchestrationRequest,
  AttributionOptionsApiResponse,
  BudgetAllocatorOptionsApiResponse,
  GeneratedReportPayload,
  ForecastOptionsApiResponse,
  CohortOptionsApiResponse,
  ScenarioOptionsApiResponse,
  FunnelOptionsApiResponse,
  ForecastPredictApiResponse,
  ForecastRequestPayload,
  ForecastTrainApiResponse,
  ReportGenerationApiResponse,
  ReportGenerationRequest,
  RecommendationLifecycleListApiResponse,
  RecommendationLifecycleRecord,
  RecommendationLifecycleUpsertApiResponse,
} from '../types';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  "http://localhost:8001/api";
const API_ROOT_URL =
  import.meta.env.VITE_API_ROOT_URL || "http://localhost:8001";

// A default agent ID to use for now.
// In a real application, you would likely have a way for the user to select an agent.
const DEFAULT_AGENT_ID = 1;

/**
 * Fetches the list of available datasets from Supabase.
 * @returns A promise that resolves to the list of available datasets
 */
export const getAvailableDatasets = async (clientId?: string) => {
  try {
    const query = clientId ? `?client_id=${encodeURIComponent(clientId)}` : '';
    const response = await fetch(`${API_BASE_URL}/available-datasets${query}`);
    if (!response.ok) {
      throw new Error(`Error fetching datasets: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Failed to fetch available datasets:", error);
    return { success: false, datasets: [], error };
  }
};

/**
 * Fetches the mapping of which agents work with which datasets.
 * @returns A promise that resolves to the agent-to-dataset mapping
 */
export const getAgentsDataMapping = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/agents-data-mapping`);
    if (!response.ok) {
      throw new Error(`Error fetching agents mapping: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Failed to fetch agents data mapping:", error);
    return { success: false, mapping: {}, error };
  }
};

export const getDatasetRows = async (dataset: string, limit: number = 50, clientId?: string) => {
  const query = new URLSearchParams({ limit: String(limit) });
  if (clientId) query.set('client_id', clientId);
  const response = await fetch(`${API_BASE_URL}/datasets/${dataset}?${query.toString()}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch dataset rows: ${response.statusText}`);
  }
  return await response.json();
};

export const runDataQueryAgent = async (
  payload: { prompt: string; client_id?: string; limit?: number },
): Promise<Record<string, unknown>> => {
  const baseWithoutApiSuffix = API_BASE_URL.replace(/\/api\/?$/, '');
  return postJsonWithFallback<Record<string, unknown>>([
    `${API_ROOT_URL}/agents/data-query`,
    `${baseWithoutApiSuffix}/agents/data-query`,
    `${API_BASE_URL}/agents/data-query`,
  ], payload);
};

export const uploadDatasetCsv = async (dataset: string, file: File) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/datasets/${dataset}/upload-csv`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to upload dataset CSV: ${response.statusText}`);
  }
  return await response.json();
};

/**
 * Fetches the list of files for a given agent.
 * @param agentId The ID of the agent
 * @returns A promise that resolves to the list of files
 */
export const getAgentFiles = async (agentId: number = DEFAULT_AGENT_ID) => {
  try {
    const response = await fetch(`${API_BASE_URL}/agents/${agentId}/files`);
    if (!response.ok) {
      throw new Error(`Error fetching files: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Failed to fetch agent files:", error);
    return []; // Return an empty array on error
  }
};

/**
 * Uploads a file for a given agent.
 * @param file The file to upload
 * @param agentId The ID of the agent
 * @returns A promise that resolves to the uploaded file data
 */
export const uploadAgentFile = async (
  file: File,
  agentId: number = DEFAULT_AGENT_ID,
  metadata?: {
    clientId?: string;
    category?: string;
    instructions?: string;
  },
) => {
  const formData = new FormData();
  formData.append("file", file);
  if (metadata?.clientId) formData.append("client_id", metadata.clientId);
  if (metadata?.category) formData.append("category", metadata.category);
  if (metadata?.instructions) formData.append("instructions", metadata.instructions);

  try {
    const response = await fetch(`${API_BASE_URL}/agents/${agentId}/files`, {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      throw new Error(`Error uploading file: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Failed to upload agent file:", error);
    throw error; // Re-throw the error to be handled by the caller
  }
};

/**
 * Deletes a file from the agent's knowledge base.
 * @param fileId The ID of the file to delete
 * @returns A promise that resolves when the file is deleted
 */
export const deleteAgentFile = async (fileId: number) => {
  try {
    const response = await fetch(`${API_BASE_URL}/files/${fileId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      throw new Error(`Error deleting file: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Failed to delete agent file:", error);
    throw error; // Re-throw the error to be handled by the caller
  }
};

export const listTrainingUploads = async (clientId: string) => {
  const response = await fetch(`${API_BASE_URL}/training-uploads?client_id=${encodeURIComponent(clientId)}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to load training uploads: ${response.statusText}`);
  }
  return await response.json();
};

export const getTrainingUploadPreview = async (uploadId: number, clientId: string) => {
  const response = await fetch(`${API_BASE_URL}/training-uploads/${uploadId}/preview?client_id=${encodeURIComponent(clientId)}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to load training upload preview: ${response.statusText}`);
  }
  return await response.json();
};

export const deleteTrainingUpload = async (uploadId: number, clientId: string) => {
  const response = await fetch(`${API_BASE_URL}/training-uploads/${uploadId}?client_id=${encodeURIComponent(clientId)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to delete training upload: ${response.statusText}`);
  }
  return await response.json();
};

/**
 * Creates a default agent if one doesn't exist.
 */
export const ensureDefaultAgent = async () => {
  try {
    // In a real app, you might want to fetch and check first,
    // but for this example, we'll just try to create it.
    // The backend should handle cases where the agent already exists gracefully.
    await fetch(`${API_BASE_URL}/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Default Agent' }),
    });
  } catch (error) {
    // It might fail if the agent already exists, which is fine for this purpose.
    console.log("Could not create default agent, it might already exist.");
  }
};

const postJsonWithFallback = async <T>(
  paths: string[],
  body?: unknown,
): Promise<T> => {
  let lastError: Error | null = null;

  for (const path of paths) {
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        let detail = '';
        try {
          const parsed = await response.json();
          detail = typeof parsed?.detail === 'string' ? parsed.detail : '';
        } catch {
          detail = await response.text();
        }
        throw new Error(detail || response.statusText || 'Request failed');
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Request failed');
    }
  }

  throw lastError ?? new Error('All forecast endpoint calls failed');
};

const getJsonWithFallback = async <T>(paths: string[]): Promise<T> => {
  let lastError: Error | null = null;

  for (const path of paths) {
    try {
      const response = await fetch(path);
      if (!response.ok) {
        let detail = '';
        try {
          const parsed = await response.json();
          detail = typeof parsed?.detail === 'string' ? parsed.detail : '';
        } catch {
          detail = await response.text();
        }
        throw new Error(detail || response.statusText || 'Request failed');
      }
      return (await response.json()) as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Request failed');
    }
  }

  throw lastError ?? new Error('All endpoint calls failed');
};

const buildClientQuery = (clientId?: string): string =>
  clientId ? `?client_id=${encodeURIComponent(clientId)}` : '';

const uniqueSortedValues = (rows: Array<Record<string, unknown>>, key: string): string[] => {
  const values = rows
    .map((row) => row[key])
    .filter((value): value is string | number => value !== null && value !== undefined)
    .map((value) => String(value).trim())
    .filter((value) => value.length > 0);
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
};

export const trainForecastModel = async (): Promise<ForecastTrainApiResponse> => {
  return postJsonWithFallback<ForecastTrainApiResponse>([
    `${API_ROOT_URL}/agents/forecast/train`,
    `${API_BASE_URL}/agents/forecast/train`,
  ]);
};

export const predictForecast = async (
  payload: ForecastRequestPayload,
): Promise<ForecastPredictApiResponse> => {
  return postJsonWithFallback<ForecastPredictApiResponse>([
    `${API_ROOT_URL}/agents/forecast/predict`,
    `${API_BASE_URL}/agents/forecast/predict`,
  ], payload);
};

export const orchestrateAgents = async (
  payload: AgentOrchestrationRequest,
): Promise<AgentOrchestrationApiResponse> => {
  const baseWithoutApiSuffix = API_BASE_URL.replace(/\/api\/?$/, '');
  return postJsonWithFallback<AgentOrchestrationApiResponse>([
    `${API_ROOT_URL}/agents/orchestrate`,
    `${baseWithoutApiSuffix}/agents/orchestrate`,
  ], payload);
};

export const getFunnelOptions = async (clientId?: string): Promise<FunnelOptionsApiResponse> => {
  const baseWithoutApiSuffix = API_BASE_URL.replace(/\/api\/?$/, '');
  const query = buildClientQuery(clientId);
  try {
    return await getJsonWithFallback<FunnelOptionsApiResponse>([
      `${API_BASE_URL}/agents/funnel/options${query}`,
      `${API_BASE_URL.replace(/\/api\/?$/, '/api')}/funnel/options${query}`,
      `${API_ROOT_URL}/agents/funnel/options${query}`,
      `${baseWithoutApiSuffix}/agents/funnel/options${query}`,
    ]);
  } catch {
    if (clientId) {
      throw new Error('Client-specific funnel datasets are unavailable. Upload the required file in Supervisor -> Train Model first.');
    }

    // Fallback path for older backends: compute valid options from live datasets.
    const [campaignsRes, eventsRes, customersRes] = await Promise.all([
      getDatasetRows('campaigns', 500),
      getDatasetRows('events', 500),
      getDatasetRows('customers', 500),
    ]);

    const campaignRows = (campaignsRes?.rows ?? []) as Array<Record<string, unknown>>;
    const eventRows = (eventsRes?.rows ?? []) as Array<Record<string, unknown>>;
    const customerRows = (customersRes?.rows ?? []) as Array<Record<string, unknown>>;

    const channels = Array.from(
      new Set([
        ...uniqueSortedValues(campaignRows, 'channel'),
        ...uniqueSortedValues(eventRows, 'channel'),
      ]),
    ).sort((a, b) => a.localeCompare(b));

    const eventTypes = uniqueSortedValues(eventRows, 'event_type');
    const eventTypeLabels: Record<string, string> = {
      impression: 'Impressions',
      click: 'Clicks',
      landing_page_view: 'Landing Page Views',
      add_to_cart: 'Add To Cart',
      purchase: 'Purchases',
    };

    const orderedEventStages = ['impression', 'click', 'landing_page_view', 'add_to_cart', 'purchase']
      .filter((key) => eventTypes.includes(key))
      .map((key) => ({ event_type: key, label: eventTypeLabels[key] || key }));

    return {
      success: true,
      data: {
        channels,
        campaign_types: uniqueSortedValues(campaignRows, 'campaign_type'),
        segments: uniqueSortedValues(customerRows, 'segment'),
        event_types: eventTypes,
        event_stages: orderedEventStages,
        time_periods: ['week', 'month', 'quarter', 'year', 'all'],
        defaults: {
          channel: 'all',
          campaign_type: 'all',
          segment: 'all',
          event_type: 'all',
          time_period: 'month',
        },
        available_filters: {
          channel: channels.length > 0,
          campaign_type: uniqueSortedValues(campaignRows, 'campaign_type').length > 0,
          segment: uniqueSortedValues(customerRows, 'segment').length > 0,
          event_type: eventTypes.length > 0,
          time_period: true,
        },
        sources: {
          campaigns: campaignsRes?.source || 'unknown',
          events: eventsRes?.source || 'unknown',
          customers: customersRes?.source || 'unknown',
        },
        row_counts: {
          campaigns: Number(campaignsRes?.row_count || campaignRows.length),
          events: Number(eventsRes?.row_count || eventRows.length),
          customers: Number(customersRes?.row_count || customerRows.length),
        },
        schema_details: {
          campaigns: {
            source: campaignsRes?.source || 'unknown',
            columns: (campaignsRes?.columns ?? []) as string[],
            funnel_metrics: ['impressions', 'clicks', 'landing_page_views', 'add_to_cart', 'purchases']
              .filter((column) => ((campaignsRes?.columns ?? []) as string[]).includes(column)),
            filter_columns: ['channel', 'campaign_type', 'date']
              .filter((column) => ((campaignsRes?.columns ?? []) as string[]).includes(column)),
          },
          events: {
            source: eventsRes?.source || 'unknown',
            columns: (eventsRes?.columns ?? []) as string[],
            event_stage_column: ((eventsRes?.columns ?? []) as string[]).includes('event_type') ? 'event_type' : '',
            filter_columns: ['channel', 'event_type', 'timestamp']
              .filter((column) => ((eventsRes?.columns ?? []) as string[]).includes(column)),
          },
          customers: {
            source: customersRes?.source || 'unknown',
            columns: (customersRes?.columns ?? []) as string[],
            segment_column: ((customersRes?.columns ?? []) as string[]).includes('segment') ? 'segment' : '',
            join_key: ((customersRes?.columns ?? []) as string[]).includes('customer_id') ? 'customer_id' : '',
          },
        },
      },
    };
  }
};

export const getAttributionOptions = async (clientId?: string): Promise<AttributionOptionsApiResponse> => {
  const baseWithoutApiSuffix = API_BASE_URL.replace(/\/api\/?$/, '');
  const query = buildClientQuery(clientId);
  return getJsonWithFallback<AttributionOptionsApiResponse>([
    `${API_BASE_URL}/agents/attribution/options${query}`,
    `${API_ROOT_URL}/agents/attribution/options${query}`,
    `${baseWithoutApiSuffix}/agents/attribution/options${query}`,
  ]);
};

export const getForecastOptions = async (clientId?: string): Promise<ForecastOptionsApiResponse> => {
  const baseWithoutApiSuffix = API_BASE_URL.replace(/\/api\/?$/, '');
  const query = buildClientQuery(clientId);
  return getJsonWithFallback<ForecastOptionsApiResponse>([
    `${API_BASE_URL}/agents/forecast/options${query}`,
    `${API_ROOT_URL}/agents/forecast/options${query}`,
    `${baseWithoutApiSuffix}/agents/forecast/options${query}`,
  ]);
};

export const getCohortOptions = async (clientId?: string): Promise<CohortOptionsApiResponse> => {
  const baseWithoutApiSuffix = API_BASE_URL.replace(/\/api\/?$/, '');
  const query = buildClientQuery(clientId);
  return getJsonWithFallback<CohortOptionsApiResponse>([
    `${API_BASE_URL}/agents/cohort/options${query}`,
    `${API_ROOT_URL}/agents/cohort/options${query}`,
    `${baseWithoutApiSuffix}/agents/cohort/options${query}`,
  ]);
};

export const getScenarioOptions = async (clientId?: string): Promise<ScenarioOptionsApiResponse> => {
  const baseWithoutApiSuffix = API_BASE_URL.replace(/\/api\/?$/, '');
  const query = buildClientQuery(clientId);
  return getJsonWithFallback<ScenarioOptionsApiResponse>([
    `${API_BASE_URL}/agents/scenario/options${query}`,
    `${API_ROOT_URL}/agents/scenario/options${query}`,
    `${baseWithoutApiSuffix}/agents/scenario/options${query}`,
  ]);
};

export const getBudgetAllocatorOptions = async (clientId?: string): Promise<BudgetAllocatorOptionsApiResponse> => {
  const baseWithoutApiSuffix = API_BASE_URL.replace(/\/api\/?$/, '');
  const query = buildClientQuery(clientId);
  return getJsonWithFallback<BudgetAllocatorOptionsApiResponse>([
    `${API_BASE_URL}/agents/budget/options${query}`,
    `${API_ROOT_URL}/agents/budget/options${query}`,
    `${baseWithoutApiSuffix}/agents/budget/options${query}`,
  ]);
};

export const runBudgetAllocator = async (
  payload: Record<string, unknown>,
): Promise<AgentOrchestrationApiResponse> => {
  const baseWithoutApiSuffix = API_BASE_URL.replace(/\/api\/?$/, '');
  return postJsonWithFallback<AgentOrchestrationApiResponse>([
    `${API_ROOT_URL}/agents/budget/allocate`,
    `${baseWithoutApiSuffix}/agents/budget/allocate`,
    `${API_BASE_URL}/agents/budget/allocate`,
  ], payload);
};

export const getAgentResults = async (agentId?: string, clientId?: string) => {
  const baseWithoutApiSuffix = API_BASE_URL.replace(/\/api\/?$/, '');
  const queryParams = new URLSearchParams();
  if (agentId) queryParams.set('agent_id', agentId);
  if (clientId) queryParams.set('client_id', clientId);
  const query = queryParams.toString() ? `?${queryParams.toString()}` : '';

  return getJsonWithFallback([
    `${API_ROOT_URL}/agents/results${query}`,
    `${baseWithoutApiSuffix}/agents/results${query}`,
    `${API_BASE_URL}/agents/results${query}`,
  ]);
};

export const generateAnalyticsReport = async (
  payload: ReportGenerationRequest,
): Promise<ReportGenerationApiResponse> => {
  const baseWithoutApiSuffix = API_BASE_URL.replace(/\/api\/?$/, '');
  return postJsonWithFallback<ReportGenerationApiResponse>([
    `${API_ROOT_URL}/agents/report/generate`,
    `${baseWithoutApiSuffix}/agents/report/generate`,
    `${API_BASE_URL}/agents/report/generate`,
  ], payload);
};

export const downloadGeneratedReport = (report: GeneratedReportPayload) => {
  const base64 = report.content_base64 || '';
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const blob = new Blob([bytes], { type: report.mime_type || 'application/octet-stream' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = report.filename || 'analytics_report';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
};

export const fetchRecommendationOutcomes = async (
  clientId?: string,
  threadId?: string,
): Promise<RecommendationLifecycleListApiResponse> => {
  const params = new URLSearchParams();
  if (clientId) params.set('client_id', clientId);
  if (threadId) params.set('thread_id', threadId);
  const query = params.toString() ? `?${params.toString()}` : '';

  const baseWithoutApiSuffix = API_BASE_URL.replace(/\/api\/?$/, '');

  try {
    return await getJsonWithFallback<RecommendationLifecycleListApiResponse>([
      `${API_BASE_URL}/recommendations/outcomes${query}`,
      `${API_ROOT_URL}/api/recommendations/outcomes${query}`,
      `${API_ROOT_URL}/agents/recommendations/outcomes${query}`,
      `${baseWithoutApiSuffix}/api/recommendations/outcomes${query}`,
    ]);
  } catch {
    return {
      success: false,
      data: [],
    };
  }
};

export const upsertRecommendationOutcome = async (
  payload: RecommendationLifecycleRecord,
): Promise<RecommendationLifecycleUpsertApiResponse> => {
  const baseWithoutApiSuffix = API_BASE_URL.replace(/\/api\/?$/, '');

  try {
    return await postJsonWithFallback<RecommendationLifecycleUpsertApiResponse>([
      `${API_BASE_URL}/recommendations/outcomes`,
      `${API_ROOT_URL}/api/recommendations/outcomes`,
      `${API_ROOT_URL}/agents/recommendations/outcomes`,
      `${baseWithoutApiSuffix}/api/recommendations/outcomes`,
    ], payload);
  } catch {
    return {
      success: false,
      data: payload,
    };
  }
};
