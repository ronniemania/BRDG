import { useState, useEffect, useMemo } from 'react';
import { TrendingUp, RefreshCw } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getToken } from '../context/AuthContext';
import { useDateRangeQueries } from '../hooks/useDateRangeQuery';
import { ChartSkeleton, KPIGridSkeleton } from '../components/Skeletons';
import DateRangePicker from '../components/DateRangePicker';

export default function MetricsPage() {
  const [brandId, setBrandId] = useState('');

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch('/api/brands', { credentials: 'include', headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.brands?.[0]) setBrandId(d.brands[0].id); })
      .catch(() => {});
  }, []);

  const urls = useMemo(() => ({
    kpis: brandId ? `/api/insights/kpis?brandId=${brandId}` : null,
    trends: brandId ? `/api/insights/trends?brandId=${brandId}&days=30` : null,
  }), [brandId]);

  const { data, loading, initialLoading, refetch } = useDateRangeQueries(urls, {}, !!brandId);

  const kpis = data.kpis?.kpis || {};
  const revenueTrend: any[] = data.trends?.revenueTrend || [];

  if (initialLoading) return <div className="p-6"><KPIGridSkeleton count={6} /><div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-5"><ChartSkeleton /><ChartSkeleton /></div></div>;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-[#10b981]" /> Metrics
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Key performance indicators and business metrics</p>
          </div>
          <div className="flex gap-2 items-center">
            <DateRangePicker />
            <button onClick={refetch} disabled={loading} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 bg-white">
              <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
          {[
            { label: 'Total Revenue', value: `₹${((kpis.totalRevenue || 0) / 1000).toFixed(1)}k` },
            { label: 'Total Orders', value: kpis.totalOrders || 0 },
            { label: 'Avg Order Value', value: `₹${(kpis.avgOrderValue || 0).toLocaleString('en-IN')}` },
            { label: 'Fulfilment Rate', value: `${kpis.fulfilmentRate || 0}%` },
            { label: 'Repeat Rate', value: `${kpis.repeatRate || 0}%` },
            { label: 'Total Customers', value: kpis.totalCustomers || 0 },
            { label: 'Low Stock Items', value: kpis.lowStockCount || 0 },
            { label: 'Avg Dispatch', value: `${kpis.avgDispatchHours || 0}h` },
            { label: 'Return Rate', value: `${kpis.returnRate || 0}%` },
            { label: 'Total Returns', value: kpis.totalReturns || 0 },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <p className="text-xl font-bold text-gray-900">{k.value}</p>
              <p className="text-xs text-gray-500 mt-1">{k.label}</p>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="font-semibold text-gray-900 text-sm mb-4">Revenue Trend (30d)</h2>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={revenueTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} interval={4} tickFormatter={(d: string) => d.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => [`₹${v.toLocaleString('en-IN')}`, 'Revenue']} />
                <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="font-semibold text-gray-900 text-sm mb-4">Daily Order Volume (30d)</h2>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={revenueTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} interval={4} tickFormatter={(d: string) => d.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="orders" fill="#3b82f6" radius={[3, 3, 0, 0]} name="Orders" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
