import { useState, useEffect, useMemo } from 'react';
import {
  ShoppingCart, Package, Users, RotateCcw, TrendingUp,
  RefreshCw, AlertTriangle, Truck, Store, MessageSquare, Crown, Settings2,
  Layers3, UserPlus,
} from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { getToken, useAuth } from '../context/AuthContext';
import { useBrand } from '../context/BrandContext';
import { DashboardSkeleton } from '../components/Skeletons';
import DateRangePicker from '../components/DateRangePicker';
import { useDateRangeQuery, useDateRangeQueries } from '../hooks/useDateRangeQuery';
import { useMetricSelection, formatMetricValue } from '../hooks/useMetricSelection';
import { Link } from 'react-router';
import { api } from '../lib/apiClient';
import { formatINR, formatINRCompact } from '../lib/format';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

// ─── Executive Summary (boss-only, date-range-aware, all-brands aggregate) ─────

interface BusinessHealth {
  totalRevenue: number;
  totalOrders: number;
  pendingOrders: number;
  lowStockItems: number;
  openTickets: number;
  pendingReturns: number;
  totalCustomers: number;
  brandsCount: number;
  lastUpdated: string;
}

interface OrderSummary {
  id: string;
  orderId: string;
  customerName: string;
  amount: number;
  status: string;
  orderDate: string;
}

interface AnomalySummary {
  title: string;
  detail?: string;
  severity: 'high' | 'medium' | 'low';
}

interface AgentUsageSummary {
  totalCostUsd: number;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  periodDays: number;
}

function AgentUsageCards({ brandId, isHolistic }: { brandId: string | null; isHolistic: boolean }) {
  const [summary, setSummary] = useState<AgentUsageSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isHolistic && !brandId) {
      setSummary(null);
      return;
    }

    let active = true;
    setLoading(true);

    const query = new URLSearchParams({ days: '30' });
    if (!isHolistic && brandId) query.set('brandId', brandId);

    api.get(`/api/clawbot/costs?${query.toString()}`)
      .then((data) => {
        if (!active) return;
        setSummary(data as AgentUsageSummary);
      })
      .catch(() => {
        if (!active) return;
        setSummary(null);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => { active = false; };
  }, [brandId, isHolistic]);

  const totalTokens = (summary?.totalInputTokens ?? 0) + (summary?.totalOutputTokens ?? 0);
  const avgCostPerTask = (summary?.totalCalls ?? 0) > 0
    ? (summary?.totalCostUsd ?? 0) / (summary?.totalCalls ?? 0)
    : 0;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">AI Usage Overview</span>
        <span className="text-[10px] text-gray-400">Last {summary?.periodDays ?? 30} days</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className={`bg-white rounded-xl border border-gray-200 p-4 ${loading ? 'opacity-60' : ''}`}>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Tasks Run</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{(summary?.totalCalls ?? 0).toLocaleString('en-IN')}</p>
          <p className="text-[11px] text-gray-400 mt-1">Total AI operations executed</p>
        </div>
        <div className={`bg-white rounded-xl border border-gray-200 p-4 ${loading ? 'opacity-60' : ''}`}>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Tokens Consumed</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{totalTokens.toLocaleString('en-IN')}</p>
          <p className="text-[11px] text-gray-400 mt-1">
            In {summary?.totalInputTokens?.toLocaleString('en-IN') ?? 0} / Out {summary?.totalOutputTokens?.toLocaleString('en-IN') ?? 0}
          </p>
        </div>
        <div className={`bg-white rounded-xl border border-gray-200 p-4 ${loading ? 'opacity-60' : ''}`}>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Cost (USD)</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">${(summary?.totalCostUsd ?? 0).toFixed(4)}</p>
          <p className="text-[11px] text-gray-400 mt-1">Overall API spend across agents</p>
        </div>
        <div className={`bg-white rounded-xl border border-gray-200 p-4 ${loading ? 'opacity-60' : ''}`}>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Avg Cost / Task (USD)</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">${avgCostPerTask.toFixed(6)}</p>
          <p className="text-[11px] text-gray-400 mt-1">Average spend per AI operation</p>
        </div>
      </div>
    </div>
  );
}

function ExecutiveSummary() {
  // Uses useDateRangeQuery so the summary reflects the same date range as the rest of the dashboard
  const { data, loading } = useDateRangeQuery<BusinessHealth>({
    url: '/api/business-health',
    enabled: true,
  });

  if (loading) {
    return (
      <div className="mb-6 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-20 bg-white border border-gray-200 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const cards = [
    { label: 'Total Revenue',   value: formatINRCompact(data.totalRevenue),                              icon: TrendingUp,   color: 'emerald' },
    { label: 'All Orders',      value: data.totalOrders,                              icon: ShoppingCart,  color: 'blue' },
    { label: 'Pending Orders',  value: data.pendingOrders,                            icon: Truck,         color: data.pendingOrders > 20 ? 'red' : 'yellow' },
    { label: 'Low Stock SKUs',  value: data.lowStockItems,                            icon: Package,       color: data.lowStockItems > 10 ? 'red' : 'yellow' },
    { label: 'Open Tickets',    value: data.openTickets,                              icon: MessageSquare, color: data.openTickets > 15 ? 'red' : 'blue' },
    { label: 'Open Returns',    value: data.pendingReturns,                           icon: RotateCcw,     color: data.pendingReturns > 10 ? 'red' : 'yellow' },
    { label: 'Customers',       value: data.totalCustomers,                           icon: Users,         color: 'purple' },
    { label: 'Active Brands',   value: data.brandsCount,                              icon: Store,         color: 'emerald' },
  ] as const;

  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-600 bg-emerald-50 border-emerald-100',
    blue:    'text-blue-600 bg-blue-50 border-blue-100',
    yellow:  'text-yellow-600 bg-yellow-50 border-yellow-100',
    red:     'text-red-600 bg-red-50 border-red-100',
    purple:  'text-purple-600 bg-purple-50 border-purple-100',
  };

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Crown className="w-4 h-4 text-amber-500" />
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Executive Overview — All Brands</span>
        <span className="text-[10px] text-gray-400 ml-auto">
          Updated {new Date(data.lastUpdated).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {cards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className={`bg-white rounded-xl border p-3 ${colorMap[color] || colorMap.blue}`}>
            <Icon className="w-4 h-4 mb-2" />
            <p className="text-lg font-bold text-gray-900 leading-none">{value}</p>
            <p className="text-[10px] text-gray-500 mt-1 leading-tight">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── New Customers card ────────────────────────────────────────────────────────
// Always visible in isolated view. Shows first-time buyers in the selected period.

function NewCustomersCard({ newCustomers, loading }: { newCustomers: number; loading: boolean }) {
  return (
    <div className={`bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl border border-purple-200 p-5 flex items-center gap-4 mb-6 ${loading ? 'opacity-60' : ''}`}>
      <div className="w-12 h-12 rounded-xl bg-purple-500 flex items-center justify-center flex-shrink-0">
        <UserPlus className="w-6 h-6 text-white" />
      </div>
      <div>
        <p className="text-3xl font-bold text-purple-900">{newCustomers}</p>
        <p className="text-sm font-medium text-purple-700 mt-0.5">New Customers</p>
        <p className="text-xs text-purple-500 mt-0.5">First-time buyers in selected period — excludes repeat purchasers</p>
      </div>
    </div>
  );
}

// ─── Holistic Dashboard (aggregated cross-brand view) ────────────────────────

interface BrandBreakdown {
  brandId: string;
  brandName: string;
  revenue: number;
  orders: number;
  pendingOrders: number;
  customers: number;
  returns: number;
  pendingReturns: number;
  lowStock: number;
  slaBreaches: number;
  inventoryValue: number;
}

interface HolisticData {
  aggregate: {
    totalRevenue: number;
    totalOrders: number;
    totalPendingOrders: number;
    totalCustomers: number;
    totalReturns: number;
    totalPendingReturns: number;
    totalLowStock: number;
    totalSLABreaches: number;
    totalInventoryValue: number;
    brandsCount: number;
    lastUpdated: string;
  } | null;
  byBrand: BrandBreakdown[];
}

function HolisticDashboard() {
  const [data, setData] = useState<HolisticData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) { setLoading(false); return; }
    let active = true;
    fetch('/api/dashboard/holistic', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (active && d) setData(d); })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading) {
    return (
      <div className="space-y-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 bg-white border border-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!data?.aggregate) return null;

  const ag = data.aggregate;
  const fmt = formatINRCompact;

  const aggCards = [
    { label: 'Total Revenue',    value: fmt(ag.totalRevenue),          color: 'emerald', icon: TrendingUp   },
    { label: 'Orders',           value: ag.totalOrders,                 color: 'blue',    icon: ShoppingCart },
    { label: 'Pending Orders',   value: ag.totalPendingOrders,          color: ag.totalPendingOrders > 20 ? 'red' : 'yellow', icon: Truck },
    { label: 'Customers',        value: ag.totalCustomers,              color: 'purple',  icon: Users        },
    { label: 'Returns',          value: ag.totalReturns,                color: 'yellow',  icon: RotateCcw    },
    { label: 'Low Stock SKUs',   value: ag.totalLowStock,               color: ag.totalLowStock > 10 ? 'red' : 'yellow', icon: Package },
    { label: 'SLA Breaches',     value: ag.totalSLABreaches,            color: ag.totalSLABreaches > 0 ? 'red' : 'emerald', icon: AlertTriangle },
    { label: 'Active Brands',    value: ag.brandsCount,                 color: 'emerald', icon: Store        },
  ] as const;

  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-600 bg-emerald-50 border-emerald-100',
    blue:    'text-blue-600 bg-blue-50 border-blue-100',
    yellow:  'text-yellow-600 bg-yellow-50 border-yellow-100',
    red:     'text-red-600 bg-red-50 border-red-100',
    purple:  'text-purple-600 bg-purple-50 border-purple-100',
  };

  return (
    <div className="mb-6 space-y-4">
      {/* Aggregate KPIs */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Layers3 className="w-4 h-4 text-[#10b981]" />
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Holistic View — All Brands</span>
          <span className="text-[10px] text-gray-400 ml-auto">
            Updated {new Date(ag.lastUpdated).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {aggCards.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className={`bg-white rounded-xl border p-3 ${colorMap[color] || colorMap.blue}`}>
              <Icon className="w-4 h-4 mb-2" />
              <p className="text-lg font-bold text-gray-900 leading-none">{value}</p>
              <p className="text-[10px] text-gray-500 mt-1 leading-tight">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Per-brand breakdown */}
      {data.byBrand.length > 1 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Brand Breakdown</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.byBrand.map(b => (
              <div key={b.brandId} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#10b981] to-emerald-700 flex items-center justify-center text-white text-xs font-bold">
                    {b.brandName.charAt(0)}
                  </div>
                  <p className="text-sm font-semibold text-gray-900 truncate">{b.brandName}</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Revenue',  value: fmt(b.revenue),    color: 'text-emerald-600' },
                    { label: 'Orders',   value: b.orders,           color: 'text-blue-600'   },
                    { label: 'Returns',  value: b.returns,          color: 'text-yellow-600' },
                    { label: 'Customers',value: b.customers,        color: 'text-purple-600' },
                    { label: 'Low Stock',value: b.lowStock,         color: b.lowStock > 5 ? 'text-red-600' : 'text-gray-600' },
                    { label: 'Breaches', value: b.slaBreaches,      color: b.slaBreaches > 0 ? 'text-red-600' : 'text-gray-400' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="text-center">
                      <p className={`text-base font-bold ${color}`}>{value}</p>
                      <p className="text-[10px] text-gray-400">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Per-brand KPI cards (driven by metric selection) ────────────────────────

function MetricCards({ kpis, loading }: { kpis: Record<string, number>; loading: boolean }) {
  const { selectedMetrics } = useMetricSelection();

  if (selectedMetrics.length === 0) {
    return (
      <div className="mb-6 bg-white border border-dashed border-gray-300 rounded-xl p-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">No metrics selected</p>
          <p className="text-xs text-gray-400 mt-0.5">Go to Metrics page to choose what to track</p>
        </div>
        <Link
          to="/metrics"
          className="flex items-center gap-1.5 px-3 py-2 bg-[#10b981]/10 text-[#10b981] text-xs font-medium rounded-lg hover:bg-[#10b981]/20"
        >
          <Settings2 className="w-3.5 h-3.5" /> Customize
        </Link>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Your Tracked Metrics</span>
        <Link to="/metrics" className="flex items-center gap-1 text-xs text-gray-400 hover:text-[#10b981]">
          <Settings2 className="w-3 h-3" /> Customize
        </Link>
      </div>
      <div className={`grid gap-4 ${
        selectedMetrics.length <= 3 ? 'grid-cols-3'
        : selectedMetrics.length <= 4 ? 'grid-cols-2 md:grid-cols-4'
        : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6'
      }`}>
        {selectedMetrics.map(m => (
          <div key={m.id} className={`bg-white rounded-xl border border-gray-200 shadow-sm p-5 ${loading ? 'opacity-60' : ''}`}>
            <p className="text-2xl font-bold text-gray-900">
              {formatMetricValue(kpis[m.id] ?? 0, m.format)}
            </p>
            <p className="text-xs text-gray-500 mt-1">{m.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth();
  const { brandId, viewMode } = useBrand();
  const isBoss = user?.role === 'boss';
  const isHolistic = viewMode === 'holistic';

  const urls = useMemo(() => ({
    kpis:      brandId ? `/api/insights/kpis?brandId=${brandId}` : null,
    orders:    brandId ? `/api/brands/${brandId}/orders` : null,
    anomalies: brandId ? `/api/insights/anomalies?brandId=${brandId}` : null,
  }), [brandId]);

  const { data, loading, initialLoading, refetch } = useDateRangeQueries(urls, {}, !!brandId && !isHolistic);

  const kpis        = (data.kpis?.kpis ?? {}) as Record<string, number>;
  const orders      = (data.orders?.orders ?? []) as OrderSummary[];
  const anomalies   = (data.anomalies?.anomalies ?? []) as AnomalySummary[];
  const newCustomers = kpis.newCustomers ?? 0;

  const revenueChartData = useMemo(() => {
    const map: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      map[d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })] = 0;
    }
    orders.forEach((o) => {
      const key = new Date(o.orderDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      if (key in map) map[key] += o.amount;
    });
    return Object.entries(map).map(([day, revenue]) => ({ day, revenue: Math.round(revenue) }));
  }, [orders]);

  const statusData = useMemo(() => {
    const ordersByStatus = orders.reduce<Record<string, number>>((acc, o) => {
      acc[o.status] = (acc[o.status] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(ordersByStatus).map(([name, value]) => ({ name, value }));
  }, [orders]);

  if (initialLoading && !isHolistic) return <DashboardSkeleton />;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {isHolistic ? 'Aggregate view across all brands' : 'Your operational overview at a glance'}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <DateRangePicker />
            {!isHolistic && (
              <button onClick={refetch} disabled={loading}
                className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 bg-white disabled:opacity-50">
                <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
        </div>

        {/* Holistic view — replaces isolated brand content */}
        {isHolistic && <HolisticDashboard />}
        <AgentUsageCards brandId={brandId} isHolistic={isHolistic} />

        {/* Isolated view content */}
        {!isHolistic && (
        <>

        {/* Executive Summary — boss only, date-range aware */}
        {isBoss && <ExecutiveSummary />}

        {/* Anomaly banners */}
        {anomalies.length > 0 && (
          <div className="mb-5 space-y-2">
            {anomalies.slice(0, 3).map((a, i: number) => (
              <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm ${
                a.severity === 'high' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-yellow-50 border-yellow-200 text-yellow-800'
              }`}>
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span className="font-medium">{a.title}</span>
                {a.detail && <span className="text-xs opacity-70 truncate">{a.detail}</span>}
              </div>
            ))}
          </div>
        )}

        {/* New Customers highlight card */}
        <NewCustomersCard newCustomers={newCustomers} loading={loading} />

        {/* User-selected KPI cards */}
        <MetricCards kpis={kpis} loading={loading} />

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="font-semibold text-gray-900 text-sm mb-4">Revenue (Last 30 days)</h2>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={revenueChartData}>
                <defs>
                  <linearGradient id="dashRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 9 }} interval={4} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => formatINRCompact(v)} />
                <Tooltip formatter={(v: number) => [formatINR(v), 'Revenue']} />
                <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} fill="url(#dashRev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="font-semibold text-gray-900 text-sm mb-4">Orders by Status</h2>
            {statusData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={statusData}>
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {statusData.map((_, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-3 space-y-1.5">
                  {statusData.map((d, i: number) => (
                    <div key={d.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="text-gray-600 capitalize">{d.name}</span>
                      </div>
                      <span className="font-medium text-gray-900">{d.value as number}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-32 flex items-center justify-center text-gray-300 text-sm">No orders yet</div>
            )}
          </div>
        </div>

        {/* Recent orders */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 text-sm">Recent Orders</h2>
            <Link to="/orders" className="text-xs text-[#10b981] hover:underline">View all</Link>
          </div>
          {orders.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    {['Order ID', 'Customer', 'Amount', 'Status', 'Date'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.slice(0, 8).map((o) => (
                    <tr key={o.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-2.5 font-mono text-gray-500">{o.orderId}</td>
                      <td className="px-4 py-2.5 text-gray-800">{o.customerName}</td>
                      <td className="px-4 py-2.5 font-medium">{formatINR(o.amount ?? 0)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          o.status === 'delivered' ? 'bg-green-100 text-green-700'
                          : o.status === 'pending' ? 'bg-yellow-100 text-yellow-700'
                          : o.status === 'cancelled' ? 'bg-red-100 text-red-700'
                          : 'bg-blue-100 text-blue-700'
                        }`}>{o.status}</span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-400">{new Date(o.orderDate).toLocaleDateString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-gray-400 text-sm">No orders found for this period</div>
          )}
        </div>

        </> /* end !isHolistic */
        )}

      </div>
    </div>
  );
}
