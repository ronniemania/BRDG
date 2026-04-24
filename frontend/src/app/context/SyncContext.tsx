import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { api } from '../lib/apiClient';

// ─── Context shape ────────────────────────────────────────────────────────────

interface SyncContextValue {
  /** Increments every time a successful global sync completes — use in effect deps to re-fetch. */
  syncVersion: number;
  isSyncing: boolean;
  lastSynced: Date | null;
  /**
   * Invalidates the local data cache for all user brands and kicks off a full
   * external sync (Shopify + Drive folders + alert evaluation).
   */
  triggerGlobalSync: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue>({
  syncVersion: 0,
  isSyncing: false,
  lastSynced: null,
  triggerGlobalSync: async () => {},
});

export function useSyncContext() {
  return useContext(SyncContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function SyncProvider({ children }: { children: ReactNode }) {
  const [syncVersion, setSyncVersion] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  const triggerGlobalSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await api.post('/api/sync/all', {});
      setSyncVersion(v => v + 1);
      setLastSynced(new Date());
    } catch {
      // Sync may still be running server-side — optimistically bump version so
      // the UI re-fetches fresh data regardless.
      setSyncVersion(v => v + 1);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing]);

  return (
    <SyncContext.Provider value={{ syncVersion, isSyncing, lastSynced, triggerGlobalSync }}>
      {children}
    </SyncContext.Provider>
  );
}
