// src/services/api.ts

import type {
  ForecastPredictApiResponse,
  ForecastRequestPayload,
  ForecastTrainApiResponse,
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


