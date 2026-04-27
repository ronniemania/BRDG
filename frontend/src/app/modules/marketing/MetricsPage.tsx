import { useState, useEffect, useMemo, useCallback } from 'react';
import { TrendingUp, RefreshCw, Settings2, RotateCcw, Check } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useDateRangeQueries } from '../../hooks/useDateRangeQuery';
import { ChartSkeleton, KPIGridSkeleton } from '../../components/Skeletons';
import DateRangePicker from '../../components/DateRangePicker';
import { useBrand } from '../../context/BrandContext';
import { formatINR, formatINRCompact } from '../../lib/format';
import {
  useMetricSelection,
  formatMetricValue,
  ALL_METRICS,
  type MetricDef,
} from '../../hooks/useMetricSelection';

// ─── Category colour map ──────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<MetricDef['category'], string> = {
  Sales:       'bg-emerald-50 border-emerald-200 text-emerald-700',
  Operations:  'bg-blue-50 border-blue-200 text-blue-700',
  Customers:   'bg-purple-50 border-purple-200 text-purple-700',
  Inventory:   'bg-yellow-50 border-yellow-200 text-yellow-700',
  Returns:     'bg-red-50 border-red-200 text-red-700',
  Fulfillment: 'bg-indigo-50 border-indigo-200 text-indigo-700',
};

const CATEGORY_DOT: Record<MetricDef['category'], string> = {
  Sales:       'bg-emerald-400',
  Operations:  'bg-blue-400',
  Customers:   'bg-purple-400',
  Inventory:   'bg-yellow-400',
  Returns:     'bg-red-400',
  Fulfillment: 'bg-indigo-400',
};

// ─── Customize panel ──────────────────────────────────────────────────────────

function CustomizePanel({
  onClose,
  toggle,
  isSelected,
  reset,
}: {
  onClose: () => void;
  toggle: (id: string) => void;
  isSelected: (id: string) => boolean;
  reset: () => void;
}) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Close on backdrop click
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  const byCategory = useMemo(() => {
    const map: Partial<Record<MetricDef['category'], MetricDef[]>> = {};
    for (const m of ALL_METRICS) {
      if (!map[m.category]) map[m.category] = [];
      map[m.category]!.push(m);
    }
    return map;
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-end sm:items-center justify-center p-4" onClick={handleBackdropClick}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Tracked Metrics</h2>
            <p className="text-xs text-gray-500 mt-0.5">Choose which metrics appear on this page and your dashboard</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={reset}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
            <button onClick={onClose} className="text-xs text-[#10b981] font-semibold px-3 py-1.5 bg-[#10b981]/10 rounded-lg hover:bg-[#10b981]/20">
              Done
            </button>
          </div>
        </div>

        {/* Metric list */}
        <div className="overflow-y-auto flex-1 px-5 py-3 space-y-4">
          {(Object.entries(byCategory) as [MetricDef['category'], MetricDef[]][]).map(([cat, metrics]) => (
            <div key={cat}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">{cat}</p>
              <div className="space-y-1.5">
                {metrics.map(m => {
                  const active = isSelected(m.id);
                  return (
                    <button
                      key={m.id}
                      onClick={() => toggle(m.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                        active
                          ? CATEGORY_COLORS[cat]
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <span className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border ${active ? 'bg-current border-current' : 'border-gray-300'}`}>
                        {active && <Check className="w-2.5 h-2.5 text-white" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{m.label}</p>
                        <p className="text-[10px] opacity-70 truncate">{m.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const CATEGORIES = Object.keys(CATEGORY_COLORS) as MetricDef['category'][];

export default function MetricsPage() {
  const { brandId } = useBrand();
  const [showCustomize, setShowCustomize] = useState(false);
  const [activeCat, setActiveCat] = useState<MetricDef['category'] | 'All'>('All');
  const { selectedMetrics, toggle, isSelected, reset } = useMetricSelection();

  const urls = useMemo(() => ({
    kpis:   brandId ? `/api/insights/kpis?brandId=${brandId}` : null,
    trends: brandId ? `/api/insights/trends?brandId=${brandId}&days=30` : null,
  }), [brandId]);

  const { data, loading, initialLoading, refetch } = useDateRangeQueries(urls, {}, !!brandId);

  const kpis = (data.kpis?.kpis ?? {}) as Record<string, number>;
  const revenueTrend: { date: string; revenue: number; orders: number }[] = data.trends?.revenueTrend ?? [];

  // Category filter: which metrics to show in the grid
  const displayedMetrics = useMemo(() =>
    activeCat === 'All' ? selectedMetrics : selectedMetrics.filter(m => m.category === activeCat),
    [selectedMetrics, activeCat],
  );

  // Count selected metrics per category (for badge on tabs)
  const catCounts = useMemo(() => {
    const counts: Partial<Record<MetricDef['category'], number>> = {};
    for (const m of selectedMetrics) counts[m.category] = (counts[m.category] ?? 0) + 1;
    return counts;
  }, [selectedMetrics]);

  if (initialLoading) {
    return (
      <div className="p-6">
        <KPIGridSkeleton count={6} />
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ChartSkeleton /><ChartSkeleton />
        </div>
      </div>
    );
  }

  return (
    <>
      {showCustomize && (
        <CustomizePanel
          onClose={() => setShowCustomize(false)}
          toggle={toggle}
          isSelected={isSelected}
          reset={reset}
        />
      )}

      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="max-w-7xl mx-auto p-6">

          {/* Header */}
          <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <TrendingUp className="w-6 h-6 text-[#10b981]" /> Metrics
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {selectedMetrics.length} of {ALL_METRICS.length} metrics tracked
                {activeCat !== 'All' && <span className="ml-1 text-[#10b981] font-medium">— {activeCat}</span>}
              </p>
            </div>
            <div className="flex gap-2 items-center">
              <button
                onClick={() => setShowCustomize(true)}
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 bg-white text-sm text-gray-600"
              >
                <Settings2 className="w-4 h-4" /> Customize
              </button>
              <DateRangePicker />
              <button onClick={refetch} disabled={loading} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 bg-white">
                <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* ── Department filter tabs ── */}
          <div className="flex flex-wrap gap-1.5 mb-5">
            <button
              onClick={() => setActiveCat('All')}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                activeCat === 'All'
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}
            >
              All <span className="opacity-70">({selectedMetrics.length})</span>
            </button>
            {CATEGORIES.map(cat => {
              const count = catCounts[cat] ?? 0;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCat(cat)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                    activeCat === cat
                      ? CATEGORY_COLORS[cat]
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {cat}
                  {count > 0 && <span className="ml-1 opacity-70">({count})</span>}
                </button>
              );
            })}
          </div>

          {/* ── KPI cards ── */}
          {selectedMetrics.length === 0 ? (
            <div className="bg-white border border-dashed border-gray-300 rounded-xl p-10 text-center mb-6">
              <Settings2 className="w-8 h-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-500">No metrics selected</p>
              <p className="text-xs text-gray-400 mt-1">Click <strong>Customize</strong> to choose which metrics to track</p>
            </div>
          ) : displayedMetrics.length === 0 ? (
            <div className="bg-white border border-dashed border-gray-300 rounded-xl p-8 text-center mb-6">
              <p className="text-sm font-medium text-gray-500">No {activeCat} metrics selected</p>
              <button
                onClick={() => setShowCustomize(true)}
                className="mt-2 text-xs text-[#10b981] hover:underline"
              >
                Add {activeCat} metrics →
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
              {displayedMetrics.map(m => (
                <div key={m.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 relative group">
                  <span className={`absolute top-3 right-3 w-2 h-2 rounded-full ${CATEGORY_DOT[m.category]}`} title={m.category} />
                  <p className={`text-xl font-bold text-gray-900 ${loading ? 'opacity-50' : ''}`}>
                    {formatMetricValue(kpis[m.id] ?? 0, m.format)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1 leading-snug">{m.label}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5 leading-snug hidden group-hover:block">{m.description}</p>
                </div>
              ))}
            </div>
          )}

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h2 className="font-semibold text-gray-900 text-sm mb-4">Revenue Trend (30 days)</h2>
              {revenueTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={revenueTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} interval={4} tickFormatter={(d: string) => d.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => formatINRCompact(v)} />
                    <Tooltip formatter={(v: number) => [formatINR(v), 'Revenue']} />
                    <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-60 flex items-center justify-center text-gray-300 text-sm">No data for period</div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h2 className="font-semibold text-gray-900 text-sm mb-4">Daily Order Volume (30 days)</h2>
              {revenueTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={revenueTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} interval={4} tickFormatter={(d: string) => d.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="orders" fill="#3b82f6" radius={[3, 3, 0, 0]} name="Orders" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-60 flex items-center justify-center text-gray-300 text-sm">No data for period</div>
              )}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
