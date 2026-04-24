import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  authenticated: boolean;
  getAccessToken: () => string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

let accessToken: string | null = null;

// Shared refresh lock — prevents multiple tabs/components from refreshing simultaneously
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return null;
      const data = await res.json();
      accessToken = data.accessToken;
      return accessToken;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export function getToken(): string | null {
  return accessToken;
}

export async function getValidToken(): Promise<string | null> {
  if (accessToken) return accessToken;
  return refreshAccessToken();
}

/**
 * Called by OAuthCallback after reading the one-time oauthAccessToken cookie.
 * Stores the token in memory so subsequent API calls use it immediately.
 */
export function setTokenFromOAuth(token: string): void {
  accessToken = token;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  // Hydrate on mount: try stored token → try refresh cookie
  useEffect(() => {
    (async () => {
      // First check if we have a stored token from a previous session
      const storedToken = localStorage.getItem('accessToken');
      if (storedToken) {
        accessToken = storedToken;
        localStorage.removeItem('accessToken'); // migrate away from localStorage
      }

      // Try /me with access token
      if (accessToken) {
        try {
          const res = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (res.ok) {
            const data = await res.json();
            setUser(data.user);
            setAuthenticated(true);
            setLoading(false);
            return;
          }
        } catch { /* fall through */ }
        accessToken = null;
      }

      // Try refresh
      const newToken = await refreshAccessToken();
      if (newToken) {
        try {
          const res = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${newToken}` },
          });
          if (res.ok) {
            const data = await res.json();
            setUser(data.user);
            setAuthenticated(true);
            setLoading(false);
            return;
          }
        } catch { /* fall through */ }
      }

      // Not authenticated
      accessToken = null;
      setAuthenticated(false);
      setLoading(false);
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.message || 'Login failed');
    }

    const data = await res.json();
    accessToken = data.accessToken;
    if (data.user) {
      setUser(data.user);
      localStorage.setItem('userData', JSON.stringify(data.user));
    }
    setAuthenticated(true);
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
    } catch { /* best-effort */ }

    accessToken = null;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userData');
    setUser(null);
    setAuthenticated(false);
  }, []);

  const getAccessToken = useCallback(() => accessToken, []);

  return (
    <AuthContext.Provider value={{ user, loading, authenticated, getAccessToken, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
