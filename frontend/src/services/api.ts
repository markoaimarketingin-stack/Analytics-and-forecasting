// src/services/api.ts

import type {
  AgentOrchestrationApiResponse,
  AgentOrchestrationRequest,
  GeneratedReportPayload,
  ForecastOptionsApiResponse,
  ScenarioOptionsApiResponse,
  FunnelOptionsApiResponse,
  ForecastPredictApiResponse,
  ForecastRequestPayload,
  ForecastTrainApiResponse,
  GoogleAuthApiResponse,
  ReportGenerationApiResponse,
  ReportGenerationRequest,
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
export const getAvailableDatasets = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/available-datasets`);
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

export const getDatasetRows = async (dataset: string, limit: number = 50) => {
  const response = await fetch(`${API_BASE_URL}/datasets/${dataset}?limit=${limit}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch dataset rows: ${response.statusText}`);
  }
  return await response.json();
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
  agentId: number = DEFAULT_AGENT_ID
) => {
  const formData = new FormData();
  formData.append("file", file);

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
        const text = await response.text();
        throw new Error(`${response.status} ${response.statusText} ${text}`.trim());
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
        const text = await response.text();
        throw new Error(`${response.status} ${response.statusText} ${text}`.trim());
      }
      return (await response.json()) as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Request failed');
    }
  }

  throw lastError ?? new Error('All endpoint calls failed');
};

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

export const getFunnelOptions = async (): Promise<FunnelOptionsApiResponse> => {
  const baseWithoutApiSuffix = API_BASE_URL.replace(/\/api\/?$/, '');
  try {
    return await getJsonWithFallback<FunnelOptionsApiResponse>([
      `${API_BASE_URL}/agents/funnel/options`,
      `${API_BASE_URL.replace(/\/api\/?$/, '/api')}/funnel/options`,
      `${API_ROOT_URL}/agents/funnel/options`,
      `${baseWithoutApiSuffix}/agents/funnel/options`,
    ]);
  } catch {
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

export const getForecastOptions = async (): Promise<ForecastOptionsApiResponse> => {
  const baseWithoutApiSuffix = API_BASE_URL.replace(/\/api\/?$/, '');
  return getJsonWithFallback<ForecastOptionsApiResponse>([
    `${API_BASE_URL}/agents/forecast/options`,
    `${API_ROOT_URL}/agents/forecast/options`,
    `${baseWithoutApiSuffix}/agents/forecast/options`,
  ]);
};

export const getScenarioOptions = async (): Promise<ScenarioOptionsApiResponse> => {
  const baseWithoutApiSuffix = API_BASE_URL.replace(/\/api\/?$/, '');
  return getJsonWithFallback<ScenarioOptionsApiResponse>([
    `${API_BASE_URL}/agents/scenario/options`,
    `${API_ROOT_URL}/agents/scenario/options`,
    `${baseWithoutApiSuffix}/agents/scenario/options`,
  ]);
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

export const authenticateWithGoogle = async (credential: string): Promise<GoogleAuthApiResponse> => {
  const baseWithoutApiSuffix = API_BASE_URL.replace(/\/api\/?$/, '');
  return postJsonWithFallback<GoogleAuthApiResponse>([
    `${API_BASE_URL}/auth/google`,
    `${API_ROOT_URL}/api/auth/google`,
    `${baseWithoutApiSuffix}/api/auth/google`,
  ], { credential });
};


