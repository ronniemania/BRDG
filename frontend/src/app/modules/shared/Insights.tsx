import { useState, useMemo } from 'react';
import { Lightbulb, RefreshCw, AlertTriangle, TrendingUp, TrendingDown, CheckCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useBrand } from '../../context/BrandContext';
import { useDateRangeQueries } from '../../hooks/useDateRangeQuery';
import { ChartSkeleton, KPIGridSkeleton } from '../../components/Skeletons';
import DateRangePicker from '../../components/DateRangePicker';
import { formatINRCompact } from '../../lib/format';

export default function Insights() {
  const { brandId } = useBrand();

  const urls = useMemo(() => ({
    kpis: brandId ? `/api/insights/kpis?brandId=${brandId}` : null,
    trends: brandId ? `/api/insights/trends?brandId=${brandId}&days=30` : null,
    anomalies: brandId ? `/api/insights/anomalies?brandId=${brandId}` : null,
  }), [brandId]);

  const { data, loading, initialLoading, refetch } = useDateRangeQueries(urls, {}, !!brandId);

  const kpis = data.kpis?.kpis || {};
  const trends: any[] = data.trends?.revenueTrend || [];
  const anomalies: any[] = data.anomalies?.anomalies || [];

  if (initialLoading) return <div className="p-6"><KPIGridSkeleton count={4} /><div className="mt-6"><ChartSkeleton /></div></div>;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Lightbulb className="w-6 h-6 text-[#10b981]" /> Insights
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Smart analysis of your business performance</p>
          </div>
          <div className="flex gap-2 items-center">
            <DateRangePicker />
            <button onClick={refetch} disabled={loading} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 bg-white">
              <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Anomaly Cards */}
        {anomalies.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Active Alerts</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {anomalies.map((a: any, i: number) => (
                <div key={i} className={`rounded-xl border p-4 ${a.severity === 'high' ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className={`w-4 h-4 flex-shrink-0 ${a.severity === 'high' ? 'text-red-500' : 'text-yellow-500'}`} />
                    <span className={`text-sm font-semibold ${a.severity === 'high' ? 'text-red-800' : 'text-yellow-800'}`}>{a.title}</span>
                  </div>
                  {a.detail && <p className={`text-xs ml-6 ${a.severity === 'high' ? 'text-red-600' : 'text-yellow-600'}`}>{a.detail}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {anomalies.length === 0 && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <span className="text-sm text-green-800 font-medium">All systems normal — no anomalies detected</span>
          </div>
        )}

        {/* KPI Summary */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          {[
            { label: 'Revenue', value: formatINRCompact(kpis.totalRevenue || 0), trend: 'up' },
            { label: 'Fulfilment', value: `${kpis.fulfilmentRate || 0}%`, trend: (kpis.fulfilmentRate || 0) > 80 ? 'up' : 'down' },
            { label: 'Repeat Rate', value: `${kpis.repeatRate || 0}%`, trend: 'up' },
            { label: 'Avg Dispatch', value: `${kpis.avgDispatchHours || 0}h`, trend: (kpis.avgDispatchHours || 0) < 24 ? 'up' : 'down' },
            { label: 'Return Rate', value: `${kpis.returnRate || 0}%`, trend: (kpis.returnRate || 0) < 10 ? 'up' : 'down' },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-500">{k.label}</p>
                {k.trend === 'up' ? <TrendingUp className="w-3.5 h-3.5 text-green-500" /> : <TrendingDown className="w-3.5 h-3.5 text-red-500" />}
              </div>
              <p className="text-xl font-bold text-gray-900">{k.value}</p>
            </div>
          ))}
        </div>

        {/* Trend Chart */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 text-sm mb-4">Revenue & Orders Trend (Last 30 Days)</h2>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} interval={4} tickFormatter={(d: string) => d.slice(5)} />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={(v: number) => formatINRCompact(v)} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} dot={false} name="Revenue" />
              <Line yAxisId="right" type="monotone" dataKey="orders" stroke="#3b82f6" strokeWidth={2} dot={false} name="Orders" strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
