const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:8001/api';

export interface GoogleUserProfile {
  google_sub: string;
  email: string;
  name: string;
  picture?: string | null;
  email_verified: boolean;
}

export interface GoogleAuthResponse {
  success: boolean;
  client_id: string;
  user: GoogleUserProfile;
  timestamp: string;
}

export const authenticateWithGoogle = async (
  credential: string,
): Promise<GoogleAuthResponse> => {
  const response = await fetch(`${API_BASE_URL}/auth/google`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ credential }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = body?.detail || 'Google authentication failed';
    throw new Error(detail);
  }

  return (await response.json()) as GoogleAuthResponse;
};

