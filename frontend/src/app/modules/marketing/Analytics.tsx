import { useState, useEffect, useMemo } from 'react';
import { TrendingUp, TrendingDown, RefreshCw, Package, Truck, Users, RotateCcw, AlertTriangle } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line
} from 'recharts';
import DateRangePicker from '../../components/DateRangePicker';
import { useDateRange } from '../../context/DateRangeContext';
import { getToken } from '../../context/AuthContext';
import { useBrand } from '../../context/BrandContext';
import { useDateRangeQueries } from '../../hooks/useDateRangeQuery';
import { AnalyticsSkeleton } from '../../components/Skeletons';
import { formatINR, formatINRCompact } from '../../lib/format';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

function StatCard({ label, value, sub, trend, icon: Icon, color = 'green' }: any) {
  const colors: any = {
    green: 'text-emerald-600 bg-emerald-50',
    blue: 'text-blue-600 bg-blue-50',
    yellow: 'text-yellow-600 bg-yellow-50',
    red: 'text-red-600 bg-red-50',
    purple: 'text-purple-600 bg-purple-50',
  };
  const cls = colors[color] || colors.green;
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${cls}`}><Icon className="w-5 h-5" /></div>
        {trend != null && (
          <div className={`flex items-center gap-1 text-xs font-medium ${trend >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {trend >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function Analytics() {
  const { range, preset } = useDateRange();
  const { brandId } = useBrand();
  const [breachStats, setBreachStats] = useState<{ topFailures: any[]; trend: any[]; total: number } | null>(null);

  useEffect(() => {
    if (!brandId) return;
    const token = getToken();
    fetch(`/api/fulfillment/breach-stats?brandId=${brandId}&days=30`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setBreachStats(d); })
      .catch(() => {});
  }, [brandId]);

  const urls = useMemo(() => ({
    orders: brandId ? `/api/brands/${brandId}/orders` : null,
    inventory: brandId ? `/api/brands/${brandId}/inventory` : null,
    customers: brandId ? `/api/brands/${brandId}/customers` : null,
    returns: brandId ? `/api/brands/${brandId}/returns` : null,
  }), [brandId]);

  const { data, loading, initialLoading, refetch } = useDateRangeQueries(urls, {}, !!brandId);

  const orders = data.orders?.orders || [];
  const inventory = data.inventory?.items || [];
  const customers = data.customers?.customers || [];
  const returns = data.returns?.returns || [];

  const totalRevenue = orders.reduce((s: number, o: any) => s + (o.amount || 0), 0);
  const avgOrderValue = orders.length ? totalRevenue / orders.length : 0;
  const deliveredOrders = orders.filter((o: any) => o.status === 'delivered');
  const fulfilmentRate = orders.length ? Math.round((deliveredOrders.length / orders.length) * 100) : 0;
  const repeatCustomers = customers.filter((c: any) => (c.totalOrders ?? 0) > 1).length;
  const repeatRate = customers.length ? Math.round((repeatCustomers / customers.length) * 100) : 0;
  const totalReturnValue = returns.filter((r: any) => r.status === 'refunded').reduce((s: number, r: any) => s + r.amount, 0);

  const days = preset === 'all' ? 90 : (preset === 'custom'
    ? Math.ceil((range.end.getTime() - range.start.getTime()) / 86400000) || 30
    : parseInt(preset) || 30);
  const chartDays = Math.min(days, 60);

  const revenueByDay = useMemo(() => {
    const map: Record<string, number> = {};
    for (let i = chartDays - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      map[d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })] = 0;
    }
    orders.forEach((o: any) => {
      const d = new Date(o.orderDate);
      const key = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      if (key in map) map[key] = (map[key] || 0) + (o.amount || 0);
    });
    return Object.entries(map).map(([day, revenue]) => ({ day, revenue: Math.round(revenue) }));
  }, [orders, chartDays]);

  const statusCounts = orders.reduce((acc: any, o: any) => { acc[o.status] = (acc[o.status] || 0) + 1; return acc; }, {});
  const orderPieData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));

  const invStats = inventory.reduce((acc: any, i: any) => { acc[i.status] = (acc[i.status] || 0) + 1; return acc; }, {});
  const inventoryPieData = [
    { name: 'In Stock', value: invStats.in_stock || 0 },
    { name: 'Low Stock', value: invStats.low_stock || 0 },
    { name: 'Out of Stock', value: invStats.out_of_stock || 0 },
    { name: 'Near Expiry', value: invStats.near_expiry || 0 },
  ].filter(d => d.value > 0);

  const topCustomers = [...customers].sort((a: any, b: any) => (b.totalSpent ?? 0) - (a.totalSpent ?? 0)).slice(0, 5);
  const maxSpend = topCustomers[0]?.totalSpent || 1;

  const slaData = useMemo(() => {
    const slaDays = Math.min(chartDays, 14);
    const map: Record<string, { met: number; breach: number }> = {};
    for (let i = slaDays - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      map[d.toLocaleDateString('en-IN', { weekday: 'short' })] = { met: 0, breach: 0 };
    }
    orders.filter((o: any) => o.hoursToDispatch != null).forEach((o: any) => {
      const d = new Date(o.orderDate);
      const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
      if (diff < slaDays) {
        const key = d.toLocaleDateString('en-IN', { weekday: 'short' });
        if (map[key]) { if ((o.hoursToDispatch || 0) <= 24) map[key].met++; else map[key].breach++; }
      }
    });
    return Object.entries(map).map(([day, v]) => ({ day, ...v }));
  }, [orders, chartDays]);

  const categoryChartData = Object.values(
    inventory.reduce((acc: any, item: any) => {
      const cat = item.category || 'Other';
      if (!acc[cat]) acc[cat] = { category: cat, value: item.salePrice * item.stockLevel };
      else acc[cat].value += item.salePrice * item.stockLevel;
      return acc;
    }, {})
  ).sort((a: any, b: any) => b.value - a.value).slice(0, 6);

  if (initialLoading) return <AnalyticsSkeleton />;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
            <p className="text-sm text-gray-500 mt-0.5">Live business intelligence derived from your operational data</p>
          </div>
          <div className="flex gap-2 items-center">
            <DateRangePicker />
            <button onClick={refetch} disabled={loading}
              className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 bg-white disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className={`transition-opacity duration-200 ${loading && !initialLoading ? 'opacity-60 pointer-events-none' : 'opacity-100'}`}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard label="Total Revenue" value={formatINRCompact(totalRevenue)} trend={8} icon={TrendingUp} color="green" sub={`${orders.length} orders`} />
            <StatCard label="Avg Order Value" value={formatINR(Math.round(avgOrderValue))} trend={3} icon={Package} color="blue" />
            <StatCard label="Fulfilment Rate" value={`${fulfilmentRate}%`} trend={fulfilmentRate > 70 ? 5 : -5} icon={Truck} color={fulfilmentRate > 70 ? 'green' : 'red'} sub={`${deliveredOrders.length} delivered`} />
            <StatCard label="Customer Repeat Rate" value={`${repeatRate}%`} trend={2} icon={Users} color="purple" sub={`${repeatCustomers} repeat buyers`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
            <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h2 className="font-semibold text-gray-900 text-sm mb-4">Revenue Trend</h2>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={revenueByDay}>
                  <defs><linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.25} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => formatINRCompact(v)} />
                  <Tooltip formatter={(v: number) => [formatINR(v), 'Revenue']} />
                  <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2.5} fill="url(#revGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h2 className="font-semibold text-gray-900 text-sm mb-4">Order Status Split</h2>
              {orderPieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart><Pie data={orderPieData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                    {orderPieData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie><Tooltip /></PieChart>
                </ResponsiveContainer>
              ) : <div className="h-40 flex items-center justify-center text-gray-300 text-sm">No order data</div>}
              <div className="grid grid-cols-2 gap-2 mt-2">
                {orderPieData.map((d: any, i: number) => (
                  <div key={d.name} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-xs text-gray-500 capitalize">{d.name}: <strong>{d.value}</strong></span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h2 className="font-semibold text-gray-900 text-sm mb-4">SLA Performance</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={slaData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip /><Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="met" name="SLA Met" fill="#10b981" radius={[4, 4, 0, 0]} stackId="a" />
                  <Bar dataKey="breach" name="Breach" fill="#ef4444" radius={[4, 4, 0, 0]} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h2 className="font-semibold text-gray-900 text-sm mb-4">Inventory Health</h2>
              {inventoryPieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart><Pie data={inventoryPieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" paddingAngle={3}>
                    {inventoryPieData.map((_: any, i: number) => <Cell key={i} fill={['#10b981', '#f59e0b', '#ef4444', '#f97316'][i]} />)}
                  </Pie><Tooltip /></PieChart>
                </ResponsiveContainer>
              ) : <div className="h-40 flex items-center justify-center text-gray-300 text-sm">No inventory data</div>}
              <div className="grid grid-cols-2 gap-2 mt-2">
                {inventoryPieData.map((d: any, i: number) => (
                  <div key={d.name} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: ['#10b981', '#f59e0b', '#ef4444', '#f97316'][i] }} />
                    <span className="text-xs text-gray-500">{d.name}: <strong>{d.value}</strong></span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h2 className="font-semibold text-gray-900 text-sm mb-4">Top 5 Customers by Revenue</h2>
              {topCustomers.length > 0 ? (
                <div className="space-y-3">
                  {topCustomers.map((c: any, i: number) => (
                    <div key={c.id} className="flex items-center gap-3">
                      <span className="w-5 text-xs text-gray-400 font-mono">{i + 1}</span>
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{c.name.charAt(0)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-gray-800 truncate">{c.name}</span>
                          <span className="text-xs font-bold text-gray-900 ml-2">{formatINR(c.totalSpent ?? 0)}</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5"><div className="h-1.5 rounded-full bg-[#10b981]" style={{ width: `${((c.totalSpent ?? 0) / maxSpend) * 100}%` }} /></div>
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0">{c.totalOrders ?? 0} orders</span>
                    </div>
                  ))}
                </div>
              ) : <div className="h-32 flex items-center justify-center text-gray-300 text-sm">No customer data</div>}
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h2 className="font-semibold text-gray-900 text-sm mb-4">Inventory Value by Category</h2>
              {categoryChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={categoryChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: number) => formatINRCompact(v)} />
                    <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} width={80} />
                    <Tooltip formatter={(v: number) => [formatINR(v), 'Value']} />
                    <Bar dataKey="value" fill="#10b981" radius={[0, 4, 4, 0]}>{categoryChartData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <div className="h-40 flex items-center justify-center text-gray-300 text-sm">No inventory data</div>}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
            <StatCard label="Pending Orders" value={orders.filter((o: any) => o.status === 'pending').length} icon={Truck} color="yellow" />
            <StatCard label="Returns Pending" value={returns.filter((r: any) => r.status === 'requested').length} icon={RotateCcw} color="red" />
            <StatCard label="Total Refunded" value={formatINR(totalReturnValue)} icon={RotateCcw} color="red" />
            <StatCard label="Total Customers" value={customers.length} icon={Users} color="blue" />
          </div>

          {/* SLA Breach Intelligence */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <h2 className="font-semibold text-gray-900 text-sm">Top 5 SLA Failure Steps (30d)</h2>
                {breachStats && breachStats.total > 0 && (
                  <span className="ml-auto text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">{breachStats.total} breaches</span>
                )}
              </div>
              {breachStats && breachStats.topFailures.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={breachStats.topFailures} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="step" tick={{ fontSize: 10 }} width={110} />
                    <Tooltip formatter={(v: number, name: string) => [v, name === 'count' ? 'Breaches' : 'Avg Over (min)']} />
                    <Bar dataKey="count" name="count" fill="#ef4444" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-44 flex flex-col items-center justify-center gap-2 text-gray-300">
                  <AlertTriangle className="w-8 h-8 text-gray-200" />
                  <p className="text-sm">No SLA breaches in the last 30 days</p>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h2 className="font-semibold text-gray-900 text-sm mb-4">Daily Breach Trend (30d)</h2>
              {breachStats && breachStats.trend.some((t: any) => t.count > 0) ? (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={breachStats.trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(v: string) => v.slice(5)} interval={4} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip labelFormatter={(v: string) => new Date(v).toLocaleDateString('en-IN')} formatter={(v: number) => [v, 'Breaches']} />
                    <Line type="monotone" dataKey="count" stroke="#ef4444" strokeWidth={2} dot={false} name="Breaches" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-44 flex items-center justify-center text-gray-300 text-sm">No breach data</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
