/**
 * Lightweight toast notifications.
 *
 * Replaces the dozen-plus `alert()` calls scattered across pages. The
 * dependency surface is intentionally tiny — no external library — so
 * the bundle stays lean and there's no compatibility risk with the
 * existing React 19 setup.
 *
 * Usage from anywhere:
 *
 *   import { toast } from './components/Toast';
 *
 *   toast.error('Failed to save SLA');
 *   toast.success('Profile updated');
 *   toast.info('Sync started');
 *
 * The provider must be mounted once at the layout root. We mount it
 * inside ProtectedLayout (the only authenticated layout). The login
 * pages still surface errors via inline state, which is the right UX
 * there anyway.
 *
 * Auto-dismiss: 4s for success/info, 6s for error (errors deserve
 * a beat longer to read). Click anywhere on the toast to dismiss
 * immediately.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  push: (kind: ToastKind, message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

// ── Singleton bridge so non-React code (e.g. apiClient) can call toast
//   without threading the context. The provider sets this on mount.
let bridge: ToastApi | null = null;

export const toast = {
  success(message: string) { bridge?.push('success', message); },
  error(message: string)   { bridge?.push('error', message); },
  info(message: string)    { bridge?.push('info', message); },
};

const KIND_CONFIG: Record<ToastKind, { icon: typeof CheckCircle; cls: string; ttl: number }> = {
  success: { icon: CheckCircle, cls: 'bg-emerald-50 border-emerald-200 text-emerald-800', ttl: 4000 },
  error:   { icon: AlertCircle, cls: 'bg-red-50 border-red-200 text-red-800',           ttl: 6000 },
  info:    { icon: Info,        cls: 'bg-blue-50 border-blue-200 text-blue-800',         ttl: 4000 },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems(curr => curr.filter(t => t.id !== id));
  }, []);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = ++idRef.current;
    setItems(curr => [...curr, { id, kind, message }]);
    setTimeout(() => dismiss(id), KIND_CONFIG[kind].ttl);
  }, [dismiss]);

  // Expose the singleton bridge for non-React callers.
  useEffect(() => {
    bridge = { push };
    return () => { if (bridge?.push === push) bridge = null; };
  }, [push]);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm pointer-events-none"
      >
        {items.map(item => {
          const cfg = KIND_CONFIG[item.kind];
          const Icon = cfg.icon;
          return (
            <button
              key={item.id}
              onClick={() => dismiss(item.id)}
              className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-3 shadow-md text-sm text-left transition-all hover:shadow-lg ${cfg.cls}`}
            >
              <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span className="flex-1 break-words leading-snug">{item.message}</span>
              <X className="w-3.5 h-3.5 mt-0.5 opacity-50 flex-shrink-0" />
            </button>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/** Optional hook for components that prefer dependency injection over the bridge. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Outside the provider — degrade to no-op rather than throw, so a
    // misuse during testing doesn't hard-crash a page.
    return { push: () => {} };
  }
  return ctx;
}
