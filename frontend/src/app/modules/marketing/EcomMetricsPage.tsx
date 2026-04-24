import { useState, useEffect, useMemo } from 'react';
import { TrendingUp, RefreshCw, Store } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { getToken } from '../../context/AuthContext';
import { useDateRangeQueries } from '../../hooks/useDateRangeQuery';
import { KPIGridSkeleton, ChartSkeleton } from '../../components/Skeletons';
import DateRangePicker from '../../components/DateRangePicker';

export default function EcomMetricsPage() {
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
    orders: brandId ? `/api/brands/${brandId}/orders` : null,
    returns: brandId ? `/api/brands/${brandId}/returns` : null,
    stores: brandId ? `/api/ecommerce/shopify-stores?brandId=${brandId}` : null,
  }), [brandId]);

  const { data, loading, initialLoading, refetch } = useDateRangeQueries(urls, {}, !!brandId);

  const orders: any[] = data.orders?.orders || [];
  const returns: any[] = data.returns?.returns || [];
  const stores: any[] = data.stores?.stores || [];

  const slaData = useMemo(() => {
    const byDay: Record<string, { met: number; breach: number; total: number }> = {};
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
      byDay[key] = { met: 0, breach: 0, total: 0 };
    }
    orders.filter(o => o.hoursToDispatch != null).forEach(o => {
      const diff = Math.floor((Date.now() - new Date(o.orderDate).getTime()) / 86400000);
      if (diff < 14) {
        const key = new Date(o.orderDate).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
        if (byDay[key]) {
          byDay[key].total++;
          if ((o.hoursToDispatch || 0) <= 24) byDay[key].met++;
          else byDay[key].breach++;
        }
      }
    });
    return Object.entries(byDay).map(([day, v]) => ({ day, ...v, rate: v.total ? Math.round((v.met / v.total) * 100) : 0 }));
  }, [orders]);

  const channelData = useMemo(() => {
    const map: Record<string, number> = {};
    returns.forEach(r => { const k = r.channel || 'Unknown'; map[k] = (map[k] || 0) + 1; });
    return Object.entries(map).map(([channel, count]) => ({ channel, count })).sort((a, b) => b.count - a.count);
  }, [returns]);

  const slaRate = orders.filter(o => o.hoursToDispatch != null).length
    ? Math.round((orders.filter(o => (o.hoursToDispatch || 0) <= 24).length / orders.filter(o => o.hoursToDispatch != null).length) * 100)
    : 0;
  const returnRate = orders.length ? Math.round((returns.length / orders.length) * 100) : 0;
  const avgDispatch = orders.filter(o => o.hoursToDispatch != null).reduce((s, o, _, a) => s + (o.hoursToDispatch! / a.length), 0);

  if (initialLoading) return <div className="p-6"><KPIGridSkeleton count={4} /><div className="mt-6 grid grid-cols-2 gap-5"><ChartSkeleton /><ChartSkeleton /></div></div>;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-[#10b981]" /> Ecom Metrics
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">E-commerce performance — SLA, returns, channel breakdown</p>
          </div>
          <div className="flex gap-2 items-center">
            <DateRangePicker />
            <button onClick={refetch} disabled={loading} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 bg-white">
              <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'SLA Compliance', value: `${slaRate}%`, note: '< 24h dispatch' },
            { label: 'Avg Dispatch Time', value: `${Math.round(avgDispatch * 10) / 10}h`, note: 'hours to ship' },
            { label: 'Return Rate', value: `${returnRate}%`, note: `${returns.length} returns` },
            { label: 'Shopify Stores', value: stores.length, note: 'connected' },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <p className="text-2xl font-bold text-gray-900">{k.value}</p>
              <p className="text-xs text-gray-500 mt-1">{k.label}</p>
              <p className="text-xs text-gray-400">{k.note}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="font-semibold text-gray-900 text-sm mb-4">SLA Compliance (14 days)</h2>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={slaData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 8 }} interval={1} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                <Tooltip formatter={(v: number) => [`${v}%`, 'SLA Rate']} />
                <Line type="monotone" dataKey="rate" stroke="#10b981" strokeWidth={2} dot={false} name="SLA %" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="font-semibold text-gray-900 text-sm mb-4">Returns by Channel</h2>
            {channelData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={channelData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="channel" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#ef4444" radius={[0, 4, 4, 0]} name="Returns" />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="h-48 flex items-center justify-center text-gray-300 text-sm">No return data</div>}
          </div>
        </div>

        {/* Shopify stores */}
        {stores.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="font-semibold text-gray-900 text-sm mb-4">Connected Shopify Stores</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {stores.map((store: any) => (
                <div key={store.id} className="border border-gray-100 rounded-lg p-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center">
                    <Store className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm text-gray-900">{store.shopName}</p>
                    <p className="text-xs text-gray-400 capitalize">{store.syncStatus}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
