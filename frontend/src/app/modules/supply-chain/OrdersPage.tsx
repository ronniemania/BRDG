import { useState, useMemo } from 'react';
import { ShoppingCart, Search, RefreshCw, Download, ChevronDown, TrendingUp, Truck, Clock, XCircle, FileText } from 'lucide-react';
import { api } from '../../lib/apiClient';
import { useBrand } from '../../context/BrandContext';
import { useDateRangeQuery } from '../../hooks/useDateRangeQuery';
import { OrdersSkeleton } from '../../components/Skeletons';
import DateRangePicker from '../../components/DateRangePicker';
import { formatINR, formatINRCompact } from '../../lib/format';
import { toast } from '../../components/Toast';

const STATUS_COLORS: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-500',
  pending:   'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-blue-100 text-blue-700',
  shipped:   'bg-indigo-100 text-indigo-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  returned:  'bg-orange-100 text-orange-700',
};

export default function OrdersPage() {
  // Use the shared BrandContext — brand-switcher changes reflect immediately
  // and the same brandId is used everywhere (no cross-brand contamination).
  const { brandId } = useBrand();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [cancelling, setCancelling] = useState<string | null>(null);

  const { data, loading, initialLoading, refetch } = useDateRangeQuery({
    url: brandId ? `/api/brands/${brandId}/orders` : null,
    enabled: !!brandId,
  });

  const orders: any[] = data?.orders || [];

  const filtered = useMemo(() => {
    return orders.filter(o => {
      const matchSearch = !search || o.orderId.toLowerCase().includes(search.toLowerCase()) || o.customerName.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'all' || o.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [orders, search, statusFilter]);

  const totalRevenue = orders.reduce((s, o) => s + (o.amount ?? 0), 0);
  const byStatus = orders.reduce((acc: any, o) => { acc[o.status] = (acc[o.status] || 0) + 1; return acc; }, {});
  const avgDispatch = orders.filter(o => o.hoursToDispatch != null).reduce((s, o, _, a) => s + o.hoursToDispatch / a.length, 0);

  const handleCancelOrder = async (orderId: string, internalId: string) => {
    if (!window.confirm(`Cancel order ${orderId}? This updates the status in the dashboard only — it does not cancel the order on Shopify or any external platform.`)) return;
    setCancelling(internalId);
    try {
      await api.patch(`/api/ecommerce/orders/${internalId}`, { status: 'cancelled' });
      refetch();
    } catch (err: any) {
      toast.error(`Failed to cancel: ${err.message}`);
    } finally {
      setCancelling(null);
    }
  };

  const exportCSV = () => {
    const header = 'Order ID,Customer,Amount,Status,Date,Hours to Dispatch\n';
    const rows = filtered.map(o => `${o.orderId},${o.customerName},${o.amount},${o.status},${new Date(o.orderDate).toLocaleDateString()},${o.hoursToDispatch ?? ''}`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'orders.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  if (initialLoading) return <OrdersSkeleton />;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-[#10b981]" /> Orders
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">{orders.length} orders in selected period</p>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <DateRangePicker />
            <button onClick={refetch} disabled={loading} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 bg-white disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-2 bg-[#10b981] text-white rounded-lg text-sm font-medium hover:bg-[#0ea572]">
              <Download className="w-3.5 h-3.5" /> Export
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
          {[
            { label: 'Total Orders', value: orders.length, icon: ShoppingCart, color: 'blue' },
            { label: 'Revenue', value: formatINRCompact(totalRevenue), icon: TrendingUp, color: 'green' },
            { label: 'Draft', value: byStatus.draft || 0, icon: FileText, color: 'gray' },
            { label: 'Pending', value: byStatus.pending || 0, icon: Clock, color: 'yellow' },
            { label: 'Confirmed', value: byStatus.confirmed || 0, icon: ShoppingCart, color: 'blue' },
            { label: 'Shipped', value: byStatus.shipped || 0, icon: Truck, color: 'indigo' },
            { label: 'Delivered', value: byStatus.delivered || 0, icon: Truck, color: 'green' },
            { label: 'Cancelled', value: byStatus.cancelled || 0, icon: XCircle, color: 'red' },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <k.icon className="w-4 h-4 text-gray-400 mb-2" />
              <p className="text-xl font-bold text-gray-900">{k.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{k.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search orders or customers..."
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-[#10b981]"
            />
          </div>
          <div className="relative">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm bg-white appearance-none focus:outline-none focus:border-[#10b981]"
            >
              <option value="all">All Status</option>
              {['draft', 'pending', 'confirmed', 'shipped', 'delivered', 'cancelled', 'returned'].map(s => (
                <option key={s} value={s} className="capitalize">{s}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
          {(search || statusFilter !== 'all') && (
            <button onClick={() => { setSearch(''); setStatusFilter('all'); }} className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
              Clear filters
            </button>
          )}
          <p className="self-center text-sm text-gray-500 ml-auto">{filtered.length} results</p>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 border-b border-gray-100">
                <tr>
                  {['Order ID', 'Customer', 'Amount', 'Status', 'Order Date', 'Dispatch Date', 'SLA', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length > 0 ? filtered.map((o: any) => (
                  <tr key={o.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{o.orderId}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{o.customerName}</td>
                    <td className="px-4 py-3 font-semibold">{formatINR(o.amount ?? 0)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[o.status] || 'bg-gray-100 text-gray-600'}`}>{o.status}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{new Date(o.orderDate).toLocaleDateString('en-IN')}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{o.dispatchDate ? new Date(o.dispatchDate).toLocaleDateString('en-IN') : '—'}</td>
                    <td className="px-4 py-3">
                      {o.hoursToDispatch != null ? (
                        <span className={`text-xs font-medium ${o.hoursToDispatch <= 24 ? 'text-green-600' : 'text-red-500'}`}>
                          {o.hoursToDispatch <= 24 ? '✓ Met' : `⚠ ${o.hoursToDispatch}h`}
                        </span>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {!['cancelled', 'returned', 'delivered'].includes(o.status) && (
                        <button
                          onClick={() => handleCancelOrder(o.orderId, o.id)}
                          disabled={cancelling === o.id}
                          className="px-2 py-1 text-[10px] font-medium text-red-600 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50"
                        >
                          {cancelling === o.id ? '...' : 'Cancel'}
                        </button>
                      )}
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400 text-sm">No orders found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
