import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot } from 'lucide-react';

import App from '../../App';
import {
  authenticateWithGoogle,
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
  isTruthy(import.meta.env.VITE_AUTH_BYPASS_ENABLED) || HAS_EXPLICIT_FIXED_SESSION;

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

function MarkoAuthPage({
  error,
  isSigningIn,
  onGoogleCredential,
}: {
  error: string | null;
  isSigningIn: boolean;
  onGoogleCredential: (credential: string) => Promise<void>;
}) {
  const googleButtonContainerRef = useRef<HTMLDivElement | null>(null);
  const callbackRef = useRef(onGoogleCredential);

  useEffect(() => {
    callbackRef.current = onGoogleCredential;
  }, [onGoogleCredential]);

  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      setLoadError('Google Sign-In is not configured yet. Add VITE_GOOGLE_CLIENT_ID to the root .env file.');
      return;
    }

    const renderGoogleButton = () => {
      if (!window.google?.accounts?.id || !googleButtonContainerRef.current) {
        return;
      }

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response) => {
          const credential = (response?.credential || '').trim();
          if (!credential) {
            setLoadError('Google login returned an empty credential. Please try again.');
            return;
          }
          setLoadError(null);
          await callbackRef.current(credential);
        },
      });

      googleButtonContainerRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(googleButtonContainerRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        logo_alignment: 'left',
        width: 340,
      });
    };

    if (window.google?.accounts?.id) {
      renderGoogleButton();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      renderGoogleButton();
    };
    script.onerror = () => {
      setLoadError('Unable to load Google Sign-In script. Check network access and try again.');
    };

    document.head.appendChild(script);
  }, []);

  const combinedError = error || loadError;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050607] px-4 py-10 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.2),transparent_38%),radial-gradient(circle_at_80%_75%,rgba(168,85,247,0.2),transparent_34%),linear-gradient(180deg,#030304_0%,#07090f_100%)]" />
      <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-blue-500/15 blur-3xl" />

      <div className="relative z-10 w-full max-w-lg rounded-[30px] border border-white/10 bg-black/55 p-8 shadow-[0_22px_60px_rgba(0,0,0,0.58)] backdrop-blur-xl md:p-10">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="relative mb-4 flex h-20 w-20 items-center justify-center rounded-3xl border border-white/15 bg-gradient-to-br from-[#0b1320] via-[#101725] to-[#1b1330] text-white shadow-[0_14px_32px_rgba(37,99,235,0.28)]">
            <Bot className="h-10 w-10" strokeWidth={1.8} />
          </div>

          <p className="text-[11px] font-semibold uppercase tracking-[0.36em] text-slate-400">Intelligent Analytics Workspace</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white md:text-[42px]">MarkoAI</h1>

        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0a0c11]/85 p-5">
          <div className="mb-2 text-center text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Continue with Google</div>
          <div ref={googleButtonContainerRef} className="flex min-h-[48px] items-center justify-center" />

          {isSigningIn ? (
            <p className="mt-3 text-center text-sm text-blue-200">Completing secure sign-in...</p>
          ) : null}

          {combinedError ? (
            <p className="mt-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {combinedError}
            </p>
          ) : null}
        </div>
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

  const handleGoogleCredential = useCallback(async (credential: string) => {
    setError(null);
    setIsSigningIn(true);

    try {
      const response = await authenticateWithGoogle(credential);
      const nextSession = toSession(response);
      setSession(nextSession);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Authentication failed. Please try again.');
    } finally {
      setIsSigningIn(false);
    }
  }, []);

  const handleLogout = useCallback(() => {
    if (AUTH_BYPASS_ENABLED) {
      setSession(buildBypassSession());
      return;
    }

    try {
      window.google?.accounts?.id?.disableAutoSelect?.();
    } catch {
      // Non-blocking: logout should still continue if GIS API is unavailable.
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
        onGoogleCredential={handleGoogleCredential}
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



