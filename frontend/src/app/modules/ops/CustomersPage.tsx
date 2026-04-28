import { useState, useMemo } from 'react';
import { Users, Search, RefreshCw, Download, UserPlus, Clock } from 'lucide-react';
import { useBrand } from '../../context/BrandContext';
import { useDateRangeQuery } from '../../hooks/useDateRangeQuery';
import { useDateRange } from '../../context/DateRangeContext';
import { TableSkeleton, KPIGridSkeleton } from '../../components/Skeletons';
import DateRangePicker from '../../components/DateRangePicker';
import { formatINR, formatINRCompact } from '../../lib/format';

type Segment = 'all' | 'new' | 'dormant';

export default function CustomersPage() {
  const { brandId } = useBrand();
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState<Segment>('all');
  const { preset, params } = useDateRange();

  // Fetch ALL customers (no date filter) — segmentation done client-side
  const { data, loading, initialLoading, refetch } = useDateRangeQuery({
    url: brandId ? `/api/brands/${brandId}/customers` : null,
    enabled: !!brandId,
  });

  const customers: any[] = data?.customers || [];

  // ── Date range bounds for "new customer" calculation ─────────────────────────
  const rangeStart = useMemo(() => {
    if (preset === 'custom' && params.start_date) return new Date(params.start_date);
    if (preset && preset !== 'all' && preset !== 'custom') {
      const match = preset.match(/^(\d+)d$/);
      if (match) {
        const d = new Date();
        d.setDate(d.getDate() - parseInt(match[1]));
        return d;
      }
    }
    return null;
  }, [preset, params]);

  const rangeEnd = useMemo(() => {
    if (preset === 'custom' && params.end_date) return new Date(params.end_date);
    return new Date();
  }, [preset, params]);

  // Six months ago for dormant calculation
  const sixMonthsAgo = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return d;
  }, []);

  // ── Segments ─────────────────────────────────────────────────────────────────
  const newCustomers = useMemo(() =>
    customers.filter(c => {
      if (!rangeStart) return false;
      const created = new Date(c.createdAt);
      return created >= rangeStart && created <= rangeEnd;
    }),
    [customers, rangeStart, rangeEnd]
  );

  const dormantCustomers = useMemo(() =>
    customers.filter(c => {
      if (!c.lastOrderDate) return false;
      return new Date(c.lastOrderDate) < sixMonthsAgo;
    }),
    [customers, sixMonthsAgo]
  );

  const segmented = useMemo(() => {
    if (segment === 'new') return newCustomers;
    if (segment === 'dormant') return dormantCustomers;
    return customers;
  }, [segment, customers, newCustomers, dormantCustomers]);

  const filtered = useMemo(() =>
    segmented.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.email || '').toLowerCase().includes(search.toLowerCase())),
    [segmented, search]
  );

  // ── KPIs (based on all customers) ────────────────────────────────────────────
  const totalSpent = customers.reduce((s, c) => s + (c.totalSpent ?? 0), 0);
  const repeatCount = customers.filter(c => c.totalOrders > 1).length;
  const avgOrderValue = customers.length ? customers.reduce((s, c) => s + (c.totalSpent / (c.totalOrders || 1)), 0) / customers.length : 0;

  const exportCSV = () => {
    const header = 'Name,Email,Total Orders,Total Spent,Last Order,Segment\n';
    const rows = filtered.map(c => {
      const isNew = rangeStart && new Date(c.createdAt) >= rangeStart;
      const isDormant = c.lastOrderDate && new Date(c.lastOrderDate) < sixMonthsAgo;
      const seg = isNew ? 'New' : isDormant ? 'Dormant' : 'Active';
      return `${c.name},${c.email || ''},${c.totalOrders},${c.totalSpent},${c.lastOrderDate ? new Date(c.lastOrderDate).toLocaleDateString() : ''},${seg}`;
    }).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'customers.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  if (initialLoading) return <div className="p-6"><KPIGridSkeleton count={4} /><div className="mt-6"><TableSkeleton /></div></div>;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
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
            <button onClick={refetch} disabled={loading} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 bg-white">
              <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 bg-white hover:bg-gray-50">
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
            { label: 'Total Spent',      value: formatINRCompact(totalSpent) },
            { label: 'Repeat Customers', value: repeatCount },
            { label: 'Avg Order Value',  value: formatINR(Math.round(avgOrderValue)) },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <p className="text-2xl font-bold text-gray-900">{k.value}</p>
              <p className="text-xs text-gray-500 mt-1">{k.label}</p>
            </div>
          ))}
        </div>

        {/* Segment badges */}
        <div className="flex gap-3 mb-5 flex-wrap">
          <button
            onClick={() => setSegment('all')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
              segment === 'all' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            All
            <span className="ml-1 text-xs opacity-70">{customers.length}</span>
          </button>
          <button
            onClick={() => setSegment('new')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
              segment === 'new' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300 hover:text-purple-600'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            New Customers
            <span className="ml-1 text-xs opacity-70">{newCustomers.length}</span>
          </button>
          <button
            onClick={() => setSegment('dormant')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
              segment === 'dormant' ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300 hover:text-orange-500'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Dormant (6mo+)
            <span className="ml-1 text-xs opacity-70">{dormantCustomers.length}</span>
          </button>
        </div>

        {/* Segment description */}
        {segment === 'new' && rangeStart && (
          <div className="mb-4 px-4 py-2.5 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-700">
            <strong>New Customers</strong> — made their first purchase between {rangeStart.toLocaleDateString('en-IN')} and {rangeEnd.toLocaleDateString('en-IN')}. Excludes repeat purchasers.
          </div>
        )}
        {segment === 'new' && !rangeStart && (
          <div className="mb-4 px-4 py-2.5 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-700">
            Select a date range above to see new customers for that period.
          </div>
        )}
        {segment === 'dormant' && (
          <div className="mb-4 px-4 py-2.5 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-700">
            <strong>Dormant Customers</strong> — have not placed an order in the last 6 months. Consider a re-engagement campaign.
          </div>
        )}

        {/* Search */}
        <div className="flex gap-3 mb-4">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email..."
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-[#10b981]" />
          </div>
          <p className="self-center text-sm text-gray-500 ml-auto">{filtered.length} customers</p>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Customer', 'Email', 'Total Orders', 'Total Spent', 'Avg Order', 'Last Order', 'Type'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length > 0 ? filtered.map((c: any) => {
                  const isNew = rangeStart && new Date(c.createdAt) >= rangeStart && new Date(c.createdAt) <= rangeEnd;
                  const isDormant = c.lastOrderDate && new Date(c.lastOrderDate) < sixMonthsAgo;
                  return (
                    <tr key={c.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {c.name.charAt(0)}
                          </div>
                          <span className="font-medium text-gray-800">{c.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{c.email || '—'}</td>
                      <td className="px-4 py-3 font-bold">{c.totalOrders}</td>
                      <td className="px-4 py-3 font-semibold text-[#10b981]">{formatINR(c.totalSpent ?? 0)}</td>
                      <td className="px-4 py-3 text-gray-500">{c.totalOrders ? formatINR(Math.round((c.totalSpent ?? 0) / c.totalOrders)) : formatINR(0)}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">{c.lastOrderDate ? new Date(c.lastOrderDate).toLocaleDateString('en-IN') : '—'}</td>
                      <td className="px-4 py-3">
                        {isNew ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-700">New</span>
                        ) : isDormant ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-100 text-orange-700">Dormant</span>
                        ) : c.totalOrders > 1 ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700">Repeat</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">New</span>
                        )}
                      </td>
                    </tr>
                  );
                }) : (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400 text-sm">No customers found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
