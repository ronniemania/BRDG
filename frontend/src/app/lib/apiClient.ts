import { getToken, getValidToken } from '../context/AuthContext';

let logoutCallback: (() => void) | null = null;

function getCsrfToken(): string | null {
  return (
    document.cookie
      .split('; ')
      .find((row) => row.startsWith('csrfToken='))
      ?.split('=')[1] ?? null
  );
}

export function setLogoutCallback(fn: () => void) {
  logoutCallback = fn;
}

let refreshPromise: Promise<string | null> | null = null;

async function refreshToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.accessToken as string;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

interface ApiOptions extends Omit<RequestInit, 'headers'> {
  headers?: Record<string, string>;
}

async function request(url: string, options: ApiOptions = {}): Promise<Response> {
  const token = getToken() || (await getValidToken());
  const headers: Record<string, string> = { ...options.headers };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  // On 401, try one shared refresh then retry
  if (res.status === 401) {
    const newToken = await refreshToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(url, {
        ...options,
        headers,
        credentials: 'include',
      });
    }

    // If still 401 after refresh attempt, trigger logout
    if (res.status === 401) {
      logoutCallback?.();
    }
  }

  return res;
}

export const apiClient = {
  get(url: string, headers?: Record<string, string>) {
    return request(url, { method: 'GET', headers });
  },

  post(url: string, body?: unknown, headers?: Record<string, string>) {
    const csrf = getCsrfToken();
    return request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  put(url: string, body?: unknown, headers?: Record<string, string>) {
    const csrf = getCsrfToken();
    return request(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  patch(url: string, body?: unknown, headers?: Record<string, string>) {
    const csrf = getCsrfToken();
    return request(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  delete(url: string, headers?: Record<string, string>) {
    const csrf = getCsrfToken();
    return request(url, { method: 'DELETE', headers: { ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...headers } });
  },

  // Raw request for custom needs (e.g. FormData upload)
  request,
};

// ─── JSON-auto-parsing wrapper ────────────────────────────────────────────────
// Used by pages that expect resolved JSON directly instead of a Response object.
// Throws an Error with the server's message on non-2xx responses.

async function jsonRequest(url: string, options: ApiOptions = {}): Promise<any> {
  const res = await request(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || `Request failed: ${res.status}`);
  return data;
}

export const api = {
  get: (url: string, headers?: Record<string, string>) =>
    jsonRequest(url, { method: 'GET', headers }),

  post: (url: string, body?: unknown, headers?: Record<string, string>) => {
    const csrf = getCsrfToken();
    return jsonRequest(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  put: (url: string, body?: unknown, headers?: Record<string, string>) => {
    const csrf = getCsrfToken();
    return jsonRequest(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  patch: (url: string, body?: unknown, headers?: Record<string, string>) => {
    const csrf = getCsrfToken();
    return jsonRequest(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  delete: (url: string, headers?: Record<string, string>) => {
    const csrf = getCsrfToken();
    return jsonRequest(url, {
      method: 'DELETE',
      headers: { ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...headers },
    });
  },

  // FormData upload — do NOT set Content-Type (browser sets it with boundary automatically)
  upload: (url: string, formData: FormData, headers?: Record<string, string>) => {
    const csrf = getCsrfToken();
    return jsonRequest(url, {
      method: 'POST',
      headers: { ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...headers },
      body: formData,
    });
  },
};
