// src/services/api.ts

const API_BASE_URL = "http://localhost:8000/api"; // Adjust if your backend URL is different

// A default agent ID to use for now.
// In a real application, you would likely have a way for the user to select an agent.
const DEFAULT_AGENT_ID = 1;

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
