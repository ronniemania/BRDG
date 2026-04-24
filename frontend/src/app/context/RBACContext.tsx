import {
  createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode,
} from 'react';
import { api } from '../lib/apiClient';
import { useBrand } from './BrandContext';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RBACPolicy {
  id: string;
  brandId: string;
  name: string;
  team: string | null;
  department: string | null;
  allowedModules: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RBACMemberAccess {
  allowedModules: string[] | null; // null = unrestricted
  team: string | null;
  department: string | null;
}

// ─── Context shape ────────────────────────────────────────────────────────────

interface RBACContextValue {
  /** null = unrestricted (no RBAC policy applies to this user) */
  allowedModules: string[] | null;
  team: string | null;
  department: string | null;
  policies: RBACPolicy[];
  loading: boolean;
  /** Returns true when the user may access this module (honoring RBAC + feature flags) */
  canAccess: (moduleId: string) => boolean;
  refetch: () => void;
}

const RBACContext = createContext<RBACContextValue>({
  allowedModules: null,
  team: null,
  department: null,
  policies: [],
  loading: true,
  canAccess: () => true,
  refetch: () => {},
});

export function useRBAC() {
  return useContext(RBACContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function RBACProvider({ children }: { children: ReactNode }) {
  const { brandId } = useBrand();

  const [access, setAccess] = useState<RBACMemberAccess>({
    allowedModules: null, team: null, department: null,
  });
  const [policies, setPolicies] = useState<RBACPolicy[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAccess = useCallback(async () => {
    if (!brandId) return;
    setLoading(true);
    try {
      const [myAccess, rbacData] = await Promise.all([
        api.get(`/api/rbac/my-access?brandId=${brandId}`),
        api.get(`/api/rbac?brandId=${brandId}`),
      ]);
      setAccess({
        allowedModules: myAccess?.allowedModules ?? null,
        team: myAccess?.team ?? null,
        department: myAccess?.department ?? null,
      });
      setPolicies(rbacData?.policies ?? []);
    } catch {
      // Silently ignore — no RBAC restrictions applied on error
    } finally {
      setLoading(false);
    }
  }, [brandId]);

  useEffect(() => { fetchAccess(); }, [fetchAccess]);

  const canAccess = useCallback(
    (moduleId: string) => {
      if (!access.allowedModules) return true; // unrestricted
      return access.allowedModules.includes(moduleId);
    },
    [access.allowedModules],
  );

  const value = useMemo(() => ({
    allowedModules: access.allowedModules,
    team: access.team,
    department: access.department,
    policies,
    loading,
    canAccess,
    refetch: fetchAccess,
  }), [access, policies, loading, canAccess, fetchAccess]);

  return <RBACContext.Provider value={value}>{children}</RBACContext.Provider>;
}
