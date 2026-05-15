const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:8000/api';

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
  access_token: string;
  token_type: string;
  expires_in: number;
  timestamp: string;
}

export const authenticateWithGoogle = async (
  credential: string,
): Promise<GoogleAuthResponse> => {
  const response = await fetch(`${API_BASE_URL}/auth/google`, {
    method: 'POST',
    credentials: 'include',
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

export const getAuthenticatedSession = async (): Promise<GoogleAuthResponse> => {
  const response = await fetch(`${API_BASE_URL}/auth/session`, {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = body?.detail || 'Session not found';
    throw new Error(detail);
  }

  return (await response.json()) as GoogleAuthResponse;
};

export const logoutSession = async (): Promise<void> => {
  await fetch(`${API_BASE_URL}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
};

