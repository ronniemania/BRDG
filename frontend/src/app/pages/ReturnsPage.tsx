import { useState, useEffect, useMemo } from 'react';
import { RotateCcw, Search, RefreshCw, Download, ChevronDown } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { getToken } from '../context/AuthContext';
import { useDateRangeQuery } from '../hooks/useDateRangeQuery';
import { TableSkeleton, KPIGridSkeleton } from '../components/Skeletons';
import DateRangePicker from '../components/DateRangePicker';

const STATUS_COLORS: Record<string, string> = {
  requested:  'bg-blue-100 text-blue-700',
  approved:   'bg-yellow-100 text-yellow-700',
  received:   'bg-purple-100 text-purple-700',
  refunded:   'bg-green-100 text-green-700',
  exchanged:  'bg-indigo-100 text-indigo-700',
  rejected:   'bg-red-100 text-red-700',
};

const CHART_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function ReturnsPage() {
  const [brandId, setBrandId] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch('/api/brands', { credentials: 'include', headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.brands?.[0]) setBrandId(d.brands[0].id); })
      .catch(() => {});
  }, []);

  const { data, loading, initialLoading, refetch } = useDateRangeQuery({
    url: brandId ? `/api/brands/${brandId}/returns` : null,
    enabled: !!brandId,
  });

  const returns: any[] = data?.returns || [];

  const filtered = useMemo(() => returns.filter(r => {
    const matchSearch = !search || r.orderId.toLowerCase().includes(search.toLowerCase()) || r.customerName.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchSearch && matchStatus;
  }), [returns, search, statusFilter]);

  const totalValue = returns.reduce((s, r) => s + (r.amount ?? 0), 0);
  const refundedValue = returns.filter(r => r.status === 'refunded').reduce((s, r) => s + (r.amount ?? 0), 0);
  const byReason = returns.reduce((acc: any, r) => { const k = r.reason || 'Other'; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
  const reasonPieData = Object.entries(byReason).map(([name, value]) => ({ name, value }));

  const exportCSV = () => {
    const header = 'Order ID,Customer,Amount,Reason,Status,Channel,SKU,Date\n';
    const rows = filtered.map(r => `${r.orderId},${r.customerName},${r.amount},${r.reason},${r.status},${r.channel},${r.sku},${new Date(r.returnDate).toLocaleDateString()}`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'returns.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  if (initialLoading) return <div className="p-6"><KPIGridSkeleton count={4} /><div className="mt-6"><TableSkeleton /></div></div>;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-[#10b981]" /> Returns
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">{returns.length} returns in selected period</p>
          </div>
          <div className="flex gap-2 items-center">
            <DateRangePicker />
            <button onClick={refetch} disabled={loading} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 bg-white">
              <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 bg-white border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              <Download className="w-3.5 h-3.5" /> Export
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5 mb-6">
          <div className="col-span-1 lg:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Returns', value: returns.length },
              { label: 'Total Value', value: `₹${(totalValue / 1000).toFixed(1)}k` },
              { label: 'Refunded', value: `₹${(refundedValue / 1000).toFixed(1)}k` },
              { label: 'Pending', value: returns.filter(r => r.status === 'requested').length },
            ].map(k => (
              <div key={k.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <p className="text-2xl font-bold text-gray-900">{k.value}</p>
                <p className="text-xs text-gray-500 mt-1">{k.label}</p>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h3 className="text-xs font-semibold text-gray-700 mb-3">Returns by Reason</h3>
            {reasonPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={120}>
                <PieChart>
                  <Pie data={reasonPieData} cx="50%" cy="50%" outerRadius={50} dataKey="value" fontSize={9} label={({ name, percent }: any) => `${name.slice(0,8)} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                    {reasonPieData.map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="h-24 flex items-center justify-center text-gray-300 text-xs">No data</div>}
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search order or customer..."
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-[#10b981]" />
          </div>
          <div className="relative">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm bg-white appearance-none focus:outline-none focus:border-[#10b981]">
              <option value="all">All Status</option>
              {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
          <p className="self-center text-sm text-gray-500 ml-auto">{filtered.length} results</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Order ID', 'Customer', 'Amount', 'Reason', 'Channel', 'SKU', 'Status', 'Date'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length > 0 ? filtered.map((r: any) => (
                  <tr key={r.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{r.orderId}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{r.customerName}</td>
                    <td className="px-4 py-3 font-semibold">₹{(r.amount ?? 0).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{r.reason || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{r.channel || '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">{r.sku || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[r.status] || 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{new Date(r.returnDate).toLocaleDateString('en-IN')}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400 text-sm">No returns found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
