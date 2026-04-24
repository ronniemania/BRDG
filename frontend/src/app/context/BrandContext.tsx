import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { api } from '../lib/apiClient';

// ─── All available module IDs ─────────────────────────────────────────────────

export const ALL_MODULE_IDS = [
  'orders', 'inventory', 'fulfillment',
  'customers', 'returns',
  'analytics', 'metrics', 'ecom-metrics',
  'reports', 'insights',
  'data-sources', 'team-data', 'touchpoints', 'alerts',
] as const;

export type ModuleId = typeof ALL_MODULE_IDS[number];

// ─── Types ────────────────────────────────────────────────────────────────────

export type ViewMode = 'isolated' | 'holistic';

export interface BrandSummary {
  id: string;
  name: string;
  ownerId?: string;
  features?: string[];
  status?: string;
}

// ─── Context shape ────────────────────────────────────────────────────────────

interface BrandContextValue {
  /** The currently-active brand ID (for isolated mode, or first brand in holistic). */
  brandId: string;
  brand: BrandSummary | null;
  /** All brands accessible to the user. */
  allBrands: BrandSummary[];
  /** Whether the dashboard is in single-brand or cross-brand aggregate mode. */
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  /** Switch the active brand (isolated mode). */
  setActiveBrand: (brandId: string) => void;
  /** Active module IDs. Empty array = all enabled (new brand default). */
  features: string[];
  hasFeature: (id: string) => boolean;
  updateFeatures: (ids: string[]) => Promise<void>;
  loading: boolean;
  refetch: () => void;
}

const BrandContext = createContext<BrandContextValue>({
  brandId: '',
  brand: null,
  allBrands: [],
  viewMode: 'isolated',
  setViewMode: () => {},
  setActiveBrand: () => {},
  features: [...ALL_MODULE_IDS],
  hasFeature: () => true,
  updateFeatures: async () => {},
  loading: true,
  refetch: () => {},
});

export function useBrand() {
  return useContext(BrandContext);
}

// ─── Persistence helpers ──────────────────────────────────────────────────────

function readStoredBrandId(): string | null {
  try { return localStorage.getItem('brdg_selected_brand'); } catch { return null; }
}
function writeStoredBrandId(id: string) {
  try { localStorage.setItem('brdg_selected_brand', id); } catch { /* ignore */ }
}
function readStoredViewMode(): ViewMode {
  try {
    const v = localStorage.getItem('brdg_view_mode');
    return v === 'holistic' ? 'holistic' : 'isolated';
  } catch { return 'isolated'; }
}
function writeStoredViewMode(mode: ViewMode) {
  try { localStorage.setItem('brdg_view_mode', mode); } catch { /* ignore */ }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function BrandProvider({ children }: { children: ReactNode }) {
  const [allBrands, setAllBrands] = useState<BrandSummary[]>([]);
  const [activeBrandId, setActiveBrandIdState] = useState<string | null>(readStoredBrandId());
  const [viewMode, setViewModeState] = useState<ViewMode>(readStoredViewMode());
  const [loading, setLoading] = useState(true);

  const fetchBrands = useCallback(async () => {
    try {
      const data = await api.get('/api/brands');
      const brands: BrandSummary[] = data?.brands ?? [];
      setAllBrands(brands);

      // Restore or default the active brand
      setActiveBrandIdState(prev => {
        if (prev && brands.find(b => b.id === prev)) return prev; // persisted brand still accessible
        const first = brands[0]?.id ?? null;
        if (first) writeStoredBrandId(first);
        return first;
      });
    } catch {
      // auth guard handles unauthenticated users
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBrands(); }, [fetchBrands]);

  // Active brand object
  const brand = useMemo(
    () => allBrands.find(b => b.id === activeBrandId) ?? allBrands[0] ?? null,
    [allBrands, activeBrandId],
  );

  const setActiveBrand = useCallback((id: string) => {
    setActiveBrandIdState(id);
    writeStoredBrandId(id);
  }, []);

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    writeStoredViewMode(mode);
  }, []);

  // Feature flags: empty array in DB = "all enabled"
  const rawFeatures = brand?.features;
  const features: string[] =
    Array.isArray(rawFeatures) && rawFeatures.length > 0
      ? (rawFeatures as string[])
      : [...ALL_MODULE_IDS];

  const hasFeature = useCallback(
    (id: string) => features.includes(id),
    [features],
  );

  const updateFeatures = useCallback(async (ids: string[]) => {
    if (!brand?.id) return;
    await api.patch(`/api/brands/${brand.id}/features`, { features: ids });
    setAllBrands(prev =>
      prev.map(b => b.id === brand.id ? { ...b, features: ids } : b),
    );
  }, [brand?.id]);

  const value = useMemo(() => ({
    brandId: brand?.id ?? '',
    brand,
    allBrands,
    viewMode,
    setViewMode,
    setActiveBrand,
    features,
    hasFeature,
    updateFeatures,
    loading,
    refetch: fetchBrands,
  }), [brand, allBrands, viewMode, setViewMode, setActiveBrand, features, hasFeature, updateFeatures, loading, fetchBrands]);

  return (
    <BrandContext.Provider value={value}>
      {children}
    </BrandContext.Provider>
  );
}
