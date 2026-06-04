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

export const authenticateWithCredentials = async (
  email: string,
  password: string,
): Promise<GoogleAuthResponse> => {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = body?.detail || 'Authentication failed';
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

export interface AllowedUser {
  id: number;
  email: string;
  client_id: string;
  role: string;
  is_active: number;
  created_at?: string | null;
}

export interface AllowedUsersListResponse {
  success: boolean;
  users: AllowedUser[];
}

export interface AllowedUserCreateResponse {
  success: boolean;
  user: AllowedUser;
}

export const listAllowedUsers = async (): Promise<AllowedUsersListResponse> => {
  const response = await fetch(`${API_BASE_URL}/auth/allowed-users`, {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = body?.detail || 'Failed to fetch allowed users';
    throw new Error(detail);
  }

  return (await response.json()) as AllowedUsersListResponse;
};

export const addAllowedUser = async (
  email: string,
  password: String,
  clientId: string,
  role: string = 'user',
): Promise<AllowedUserCreateResponse> => {
  const response = await fetch(`${API_BASE_URL}/auth/allowed-users`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      client_id: clientId,
      role,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = body?.detail || 'Failed to add allowed user';
    throw new Error(detail);
  }

  return (await response.json()) as AllowedUserCreateResponse;
};

export const deleteAllowedUser = async (userId: number): Promise<{ success: boolean; message: string }> => {
  const response = await fetch(`${API_BASE_URL}/auth/allowed-users/${userId}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = body?.detail || 'Failed to delete allowed user';
    throw new Error(detail);
  }

  return (await response.json()) as { success: boolean; message: string };
};


