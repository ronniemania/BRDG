import { useState, useMemo } from 'react';
import { MessageSquare, RefreshCw, Search, ChevronDown } from 'lucide-react';
import { useBrand } from '../../context/BrandContext';
import { useDateRangeQuery } from '../../hooks/useDateRangeQuery';
import { TableSkeleton, KPIGridSkeleton } from '../../components/Skeletons';
import DateRangePicker from '../../components/DateRangePicker';

const STATUS_COLORS: Record<string, string> = {
  open:     'bg-blue-100 text-blue-700',
  pending:  'bg-yellow-100 text-yellow-700',
  resolved: 'bg-green-100 text-green-700',
  closed:   'bg-gray-100 text-gray-600',
};

const PRIORITY_COLORS: Record<string, string> = {
  low:    'bg-gray-100 text-gray-600',
  medium: 'bg-yellow-100 text-yellow-700',
  high:   'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

export default function Touchpoints() {
  const { brandId } = useBrand();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data, loading, initialLoading, refetch } = useDateRangeQuery({
    url: brandId ? `/api/ecommerce/tickets?brandId=${brandId}` : null,
    enabled: !!brandId,
  });

  const tickets: any[] = data?.tickets || [];

  const filtered = useMemo(() => tickets.filter(t => {
    const matchSearch = !search || t.subject.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || t.status === statusFilter;
    return matchSearch && matchStatus;
  }), [tickets, search, statusFilter]);

  const avgResponseTime = tickets.filter(t => t.responseTimeHours != null).reduce((s, t, _, a) => s + (t.responseTimeHours! / a.length), 0);
  const openCount = tickets.filter(t => t.status === 'open').length;
  const resolvedCount = tickets.filter(t => t.status === 'resolved').length;

  if (initialLoading) return <div className="p-6"><KPIGridSkeleton count={4} /><div className="mt-6"><TableSkeleton /></div></div>;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-[#10b981]" /> Touchpoints
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Customer support tickets and touchpoints</p>
          </div>
          <div className="flex gap-2 items-center">
            <DateRangePicker />
            <button onClick={refetch} disabled={loading} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 bg-white">
              <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Tickets', value: tickets.length },
            { label: 'Open', value: openCount },
            { label: 'Resolved', value: resolvedCount },
            { label: 'Avg Response', value: `${Math.round(avgResponseTime * 10) / 10}h` },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <p className="text-2xl font-bold text-gray-900">{k.value}</p>
              <p className="text-xs text-gray-500 mt-1">{k.label}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tickets..."
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
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {tickets.length === 0 ? (
            <div className="p-12 text-center">
              <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No support tickets found. Connect Freshdesk in Data Sources to sync tickets.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Subject', 'Status', 'Priority', 'Response Time', 'Created', 'Resolved'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t: any) => (
                    <tr key={t.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-medium text-gray-800 max-w-[250px] truncate">{t.subject}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[t.status] || 'bg-gray-100 text-gray-600'}`}>{t.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${PRIORITY_COLORS[t.priority] || 'bg-gray-100 text-gray-600'}`}>{t.priority}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{t.responseTimeHours != null ? `${t.responseTimeHours}h` : '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">{new Date(t.createdAt).toLocaleDateString('en-IN')}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">{t.resolvedAt ? new Date(t.resolvedAt).toLocaleDateString('en-IN') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
