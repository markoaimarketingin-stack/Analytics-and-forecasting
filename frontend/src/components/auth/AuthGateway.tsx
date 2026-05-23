import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot } from 'lucide-react';

import App from '../../App';
import {
  authenticateWithGoogle,
  authenticateWithCredentials,
  getAuthenticatedSession,
  logoutSession,
  type GoogleAuthResponse,
} from '../../services/auth';

const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();

const isTruthy = (value: unknown): boolean =>
  ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());

const RAW_FIXED_CLIENT_ID = import.meta.env.VITE_FIXED_CLIENT_ID;
const RAW_FIXED_CLIENT_NAME = import.meta.env.VITE_FIXED_CLIENT_NAME;
const RAW_FIXED_CLIENT_EMAIL = import.meta.env.VITE_FIXED_CLIENT_EMAIL;
const HAS_EXPLICIT_FIXED_SESSION =
  [RAW_FIXED_CLIENT_ID, RAW_FIXED_CLIENT_NAME, RAW_FIXED_CLIENT_EMAIL].every(
    (value) => String(value ?? '').trim().length > 0,
  );

const AUTH_BYPASS_ENABLED =
  isTruthy(import.meta.env.VITE_AUTH_BYPASS_ENABLED);

const FIXED_CLIENT_ID = String(RAW_FIXED_CLIENT_ID || 'local-client').trim() || 'local-client';
const FIXED_CLIENT_NAME = String(RAW_FIXED_CLIENT_NAME || 'Local Client').trim() || 'Local Client';
const FIXED_CLIENT_EMAIL = String(RAW_FIXED_CLIENT_EMAIL || 'local@marko.ai').trim() || 'local@marko.ai';

interface AuthSession {
  clientId: string;
  name: string;
  email: string;
  picture?: string | null;
}

interface GoogleCredentialResponse {
  credential?: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: GoogleCredentialResponse) => void;
            auto_select?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: 'standard' | 'icon';
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'large' | 'medium' | 'small';
              text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
              shape?: 'rectangular' | 'pill' | 'circle' | 'square';
              logo_alignment?: 'left' | 'center';
              width?: number;
            },
          ) => void;
          prompt: () => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}

const toSession = (payload: GoogleAuthResponse): AuthSession => ({
  clientId: payload.client_id,
  name: payload.user.name,
  email: payload.user.email,
  picture: payload.user.picture,
});

const buildBypassSession = (): AuthSession => ({
  clientId: FIXED_CLIENT_ID,
  name: FIXED_CLIENT_NAME,
  email: FIXED_CLIENT_EMAIL,
  picture: null,
});

const parseJwt = (token: string) => {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      window.atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
};

function MarkoAuthPage({
  error,
  isSigningIn,
  onSubmit,
  onMockLogin,
}: {
  error: string | null;
  isSigningIn: boolean;
  onSubmit: (email: string, password: string) => Promise<void>;
  onMockLogin: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    void onSubmit(email, password);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050607] px-4 py-10 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.2),transparent_38%),radial-gradient(circle_at_80%_75%,rgba(168,85,247,0.2),transparent_34%),linear-gradient(180deg,#030304_0%,#07090f_100%)]" />
      <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-blue-500/15 blur-3xl" />

      <div className="relative z-10 w-full max-w-md rounded-[30px] border border-white/10 bg-black/55 p-8 shadow-[0_22px_60px_rgba(0,0,0,0.58)] backdrop-blur-xl md:p-10">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="relative mb-4 flex h-20 w-20 items-center justify-center rounded-3xl border border-white/15 bg-gradient-to-br from-[#0b1320] via-[#101725] to-[#1b1330] text-white shadow-[0_14px_32px_rgba(37,99,235,0.28)]">
            <Bot className="h-10 w-10" strokeWidth={1.8} />
          </div>

          <p className="text-[11px] font-semibold uppercase tracking-[0.36em] text-slate-400">Intelligent Analytics Workspace</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white md:text-[42px]">MarkoAI</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Email Address</label>
            <input
              type="email"
              required
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Password</label>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={isSigningIn}
            className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-black disabled:opacity-50"
          >
            {isSigningIn ? 'Logging in...' : 'Log In'}
          </button>

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-white/10"></div>
            <span className="flex-shrink mx-4 text-xs text-slate-500 uppercase tracking-widest font-semibold">or</span>
            <div className="flex-grow border-t border-white/10"></div>
          </div>

          <button
            type="button"
            onClick={onMockLogin}
            className="w-full rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-semibold text-slate-300 shadow-sm transition hover:bg-white/10 focus:outline-none"
          >
            Mock Mode Login
          </button>

          {error ? (
            <p className="mt-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200 text-center">
              {error}
            </p>
          ) : null}
        </form>
      </div>
    </div>
  );
}

export default function AuthGateway() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(true);

  useEffect(() => {
    let active = true;

    const restore = async () => {
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get('token');
      const urlOrgId = params.get('org_id');

      if (urlToken && urlOrgId) {
        if (active) {
          document.cookie = `marko_access_token=${urlToken}; path=/; max-age=86400; SameSite=Lax`;
          const parsed = parseJwt(urlToken);
          setSession({
            clientId: urlOrgId,
            name: parsed?.name || parsed?.email || 'Supervisor User',
            email: parsed?.email || 'supervisor@user.com',
            picture: parsed?.picture || null,
          });
          setIsRestoringSession(false);
        }
        return;
      }

      if (AUTH_BYPASS_ENABLED) {
        if (active) {
          setSession(buildBypassSession());
          setIsRestoringSession(false);
        }
        return;
      }

      try {
        const response = await getAuthenticatedSession();
        if (active) {
          setSession(toSession(response));
        }
      } catch {
        if (active) {
          setSession(null);
        }
      } finally {
        if (active) {
          setIsRestoringSession(false);
        }
      }
    };

    restore();
    return () => {
      active = false;
    };
  }, []);

  const handleCredentialsSubmit = useCallback(async (email: string, password: string) => {
    setError(null);
    setIsSigningIn(true);

    try {
      const response = await authenticateWithCredentials(email, password);
      const nextSession = toSession(response);
      setSession(nextSession);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Authentication failed. Please try again.');
    } finally {
      setIsSigningIn(false);
    }
  }, []);

  const handleMockLogin = useCallback(async () => {
    setError(null);
    setIsSigningIn(true);
    try {
      const response = await authenticateWithCredentials('demo@gmail.com', 'password123');
      setSession(toSession(response));
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Mock Mode Login failed.');
    } finally {
      setIsSigningIn(false);
    }
  }, []);

  const handleLogout = useCallback(() => {
    if (AUTH_BYPASS_ENABLED) {
      setSession(buildBypassSession());
      return;
    }

    void logoutSession();
    setSession(null);
  }, []);

  if (isRestoringSession) {
    return null;
  }

  if (!session) {
    if (AUTH_BYPASS_ENABLED) {
      return (
        <App
          clientId={FIXED_CLIENT_ID}
          accountName={FIXED_CLIENT_NAME}
          accountEmail={FIXED_CLIENT_EMAIL}
          onLogout={handleLogout}
        />
      );
    }

    return (
      <MarkoAuthPage
        error={error}
        isSigningIn={isSigningIn}
        onSubmit={handleCredentialsSubmit}
        onMockLogin={handleMockLogin}
      />
    );
  }

  return (
    <App
      clientId={session.clientId}
      accountName={session.name}
      accountEmail={session.email}
      onLogout={handleLogout}
    />
  );
}



