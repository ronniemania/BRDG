import { useState, useEffect, useMemo, useCallback } from 'react';
import { Users, Search, RefreshCw, Download, UserPlus, Clock } from 'lucide-react';
import { apiClient } from '../lib/apiClient';
import { useBrand } from '../context/BrandContext';
import { useDateRange } from '../context/DateRangeContext';
import { TableSkeleton, KPIGridSkeleton } from '../components/Skeletons';
import DateRangePicker from '../components/DateRangePicker';

type Segment = 'all' | 'new' | 'dormant';

export default function CustomersPage() {
  const { brandId } = useBrand();
  const { preset, params } = useDateRange();

  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState<Segment>('all');

  // Always fetch ALL customers (no date params) so dormant / new segments work
  const fetchCustomers = useCallback(() => {
    if (!brandId) return;
    setLoading(true);
    apiClient
      .get(`/api/brands/${brandId}/customers`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.customers) setCustomers(d.customers); })
      .catch(() => {})
      .finally(() => { setLoading(false); setInitialLoading(false); });
  }, [brandId]);

  useEffect(() => {
    setInitialLoading(true);
    fetchCustomers();
  }, [fetchCustomers]);

  // ── Segment computation ──────────────────────────────────────────────────────

  // rangeStart is null for 'all' preset (no meaningful "new customers" window)
  const rangeStart = useMemo(() => {
    if (preset === 'all') return null;
    if (preset === 'custom' && params.start_date) return new Date(params.start_date);
    // preset like '7d', '30d', etc. — params.start_date is always derived from preset
    if (params.start_date) return new Date(params.start_date);
    return null;
  }, [preset, params]);

  const rangeEnd = useMemo(() => {
    if (params.end_date) return new Date(params.end_date);
    return new Date();
  }, [params]);

  const sixMonthsAgo = useMemo(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 6); return d;
  }, []);

  // New customers: created within the selected date range (first-time buyers by account creation)
  const newCustomers = useMemo(() =>
    customers.filter(c => {
      if (!rangeStart || !c.createdAt) return false;
      const created = new Date(c.createdAt);
      return created >= rangeStart && created <= rangeEnd;
    }), [customers, rangeStart, rangeEnd]);

  // Dormant customers: last order was >6 months ago (or never ordered)
  const dormantCustomers = useMemo(() =>
    customers.filter(c => {
      if (!c.lastOrderDate) return c.totalOrders === 0;
      return new Date(c.lastOrderDate) < sixMonthsAgo;
    }), [customers, sixMonthsAgo]);

  const displayedCustomers =
    segment === 'new' ? newCustomers :
    segment === 'dormant' ? dormantCustomers :
    customers;

  const filtered = useMemo(() =>
    displayedCustomers.filter(c =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.email || '').toLowerCase().includes(search.toLowerCase())
    ), [displayedCustomers, search]);

  // Badge for each customer row
  const getCustomerBadge = (c: any) => {
    if (rangeStart && c.createdAt && new Date(c.createdAt) >= rangeStart && new Date(c.createdAt) <= rangeEnd) {
      return { label: 'New', className: 'bg-purple-100 text-purple-700' };
    }
    if (c.lastOrderDate && new Date(c.lastOrderDate) < sixMonthsAgo) {
      return { label: 'Dormant', className: 'bg-orange-100 text-orange-700' };
    }
    if (c.totalOrders > 1) return { label: 'Repeat', className: 'bg-emerald-100 text-emerald-700' };
    return { label: 'First-time', className: 'bg-gray-100 text-gray-600' };
  };

  // ── KPIs (always over full customer list) ────────────────────────────────────
  const totalSpent  = customers.reduce((s, c) => s + (c.totalSpent ?? 0), 0);
  const repeatCount = customers.filter(c => c.totalOrders > 1).length;
  const avgOrderValue = customers.length
    ? customers.reduce((s, c) => s + (c.totalSpent ?? 0) / (c.totalOrders || 1), 0) / customers.length
    : 0;

  const exportCSV = () => {
    const header = 'Name,Email,Total Orders,Total Spent,Last Order,Type\n';
    const rows = filtered.map(c => {
      const badge = getCustomerBadge(c);
      return `${c.name},${c.email || ''},${c.totalOrders},${c.totalSpent ?? 0},${c.lastOrderDate ? new Date(c.lastOrderDate).toLocaleDateString() : ''},${badge.label}`;
    }).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'customers.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  if (initialLoading) return (
    <div className="p-6">
      <KPIGridSkeleton count={4} />
      <div className="mt-6"><TableSkeleton /></div>
    </div>
  );

  const presetLabel = preset === 'all' ? 'all time' : preset === 'custom' ? 'selected range' : `last ${preset}`;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-[#10b981]" /> Customers
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">{customers.length} customers total</p>
          </div>
          <div className="flex gap-2 items-center">
            <DateRangePicker />
            <button onClick={fetchCustomers} disabled={loading}
              className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 bg-white disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={exportCSV}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 bg-white hover:bg-gray-50">
              <Download className="w-3.5 h-3.5" /> Export
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Customers',  value: customers.length },
            { label: 'Total Spent',      value: `₹${(totalSpent / 1000).toFixed(1)}k` },
            { label: 'Repeat Customers', value: repeatCount },
            { label: 'Avg Order Value',  value: `₹${Math.round(avgOrderValue).toLocaleString('en-IN')}` },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <p className="text-2xl font-bold text-gray-900">{k.value}</p>
              <p className="text-xs text-gray-500 mt-1">{k.label}</p>
            </div>
          ))}
        </div>

        {/* Segment tabs */}
        <div className="flex gap-2 mb-4 flex-wrap">
          <button
            onClick={() => setSegment('all')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              segment === 'all'
                ? 'bg-gray-800 text-white border-gray-800'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            }`}
          >
            <Users className="w-3.5 h-3.5" /> All
            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${segment === 'all' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
              {customers.length}
            </span>
          </button>

          <button
            onClick={() => setSegment('new')}
            disabled={preset === 'all'}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              segment === 'new'
                ? 'bg-purple-600 text-white border-purple-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-purple-400'
            }`}
            title={preset === 'all' ? 'Select a date range to see new customers' : `New customers in ${presetLabel}`}
          >
            <UserPlus className="w-3.5 h-3.5" /> New Customers
            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${segment === 'new' ? 'bg-white/20 text-white' : 'bg-purple-100 text-purple-700'}`}>
              {newCustomers.length}
            </span>
          </button>

          <button
            onClick={() => setSegment('dormant')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              segment === 'dormant'
                ? 'bg-orange-500 text-white border-orange-500'
                : 'bg-white text-gray-600 border-gray-200 hover:border-orange-400'
            }`}
          >
            <Clock className="w-3.5 h-3.5" /> Dormant 6mo+
            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${segment === 'dormant' ? 'bg-white/20 text-white' : 'bg-orange-100 text-orange-700'}`}>
              {dormantCustomers.length}
            </span>
          </button>

          {segment === 'new' && rangeStart && (
            <p className="self-center text-xs text-purple-600 ml-2">
              First-time buyers in {presetLabel} — excludes repeat purchasers
            </p>
          )}
          {segment === 'dormant' && (
            <p className="self-center text-xs text-orange-600 ml-2">
              Customers with no orders in the last 6 months
            </p>
          )}
        </div>

        {/* Search + count */}
        <div className="flex gap-3 mb-4">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or email..."
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-[#10b981]"
            />
          </div>
          <p className="self-center text-sm text-gray-500 ml-auto">{filtered.length} customers</p>
        </div>

        {/* Table */}
        <div className={`bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden ${loading ? 'opacity-60' : ''}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Customer', 'Email', 'Total Orders', 'Total Spent', 'Avg Order', 'Last Order', 'Status'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length > 0 ? filtered.map((c: any) => {
                  const badge = getCustomerBadge(c);
                  return (
                    <tr key={c.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {(c.name || '?').charAt(0)}
                          </div>
                          <span className="font-medium text-gray-800">{c.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{c.email || '—'}</td>
                      <td className="px-4 py-3 font-bold">{c.totalOrders}</td>
                      <td className="px-4 py-3 font-semibold text-[#10b981]">₹{(c.totalSpent ?? 0).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3 text-gray-500">
                        ₹{c.totalOrders ? Math.round((c.totalSpent ?? 0) / c.totalOrders).toLocaleString('en-IN') : 0}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {c.lastOrderDate ? new Date(c.lastOrderDate).toLocaleDateString('en-IN') : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${badge.className}`}>
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-400 text-sm">
                      {segment === 'new' && preset === 'all'
                        ? 'Select a date range to see new customers'
                        : `No ${segment === 'all' ? '' : segment + ' '}customers found`}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
