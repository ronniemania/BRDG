import { useState, useEffect, useMemo, useCallback } from 'react';
import { Package, Search, RefreshCw, Download, Plus, AlertTriangle, ChevronDown, Eye, EyeOff } from 'lucide-react';
import { getToken } from '../../context/AuthContext';
import { useDateRangeQuery } from '../../hooks/useDateRangeQuery';
import { TableSkeleton, KPIGridSkeleton } from '../../components/Skeletons';
import { api } from '../../lib/apiClient';
import { formatINR, formatINRCompact } from '../../lib/format';
import { toast } from '../../components/Toast';

const STATUS_COLORS: Record<string, string> = {
  in_stock:     'bg-green-100 text-green-700',
  low_stock:    'bg-yellow-100 text-yellow-700',
  out_of_stock: 'bg-red-100 text-red-700',
  near_expiry:  'bg-orange-100 text-orange-700',
};

const BIN_COLORS: Record<string, string> = {
  sellable: 'bg-emerald-100 text-emerald-700',
  damaged:  'bg-red-100 text-red-700',
  expired:  'bg-gray-200 text-gray-600',
};

export default function InventoryPage() {
  const [brandId, setBrandId] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [shopifyStatusFilter, setShopifyStatusFilter] = useState('all');
  const [binTypeFilter, setBinTypeFilter] = useState('all');
  const [trackedFilter, setTrackedFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItem, setNewItem] = useState({ sku: '', name: '', stockLevel: 0, reorderPoint: 10, category: 'General', costPrice: 0, salePrice: 0 });
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch('/api/brands', { credentials: 'include', headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.brands?.[0]) setBrandId(d.brands[0].id); })
      .catch(() => {});
  }, []);

  const { data, loading, initialLoading, refetch } = useDateRangeQuery({
    url: brandId ? `/api/inventory?brandId=${brandId}` : null,
    enabled: !!brandId,
  });

  const items: any[] = data?.items || [];
  const categories: string[] = data?.categories || [];

  const filtered = useMemo(() => {
    return items.filter(i => {
      const matchSearch = !search || i.sku.toLowerCase().includes(search.toLowerCase()) || i.name.toLowerCase().includes(search.toLowerCase());
      const matchCat = categoryFilter === 'all' || i.category === categoryFilter;
      const matchStatus = statusFilter === 'all' || i.status === statusFilter;
      const matchShopify = shopifyStatusFilter === 'all' || (i.shopifyStatus || 'active') === shopifyStatusFilter;
      const matchBin = binTypeFilter === 'all' || (i.binType || 'sellable') === binTypeFilter;
      const matchTracked = trackedFilter === 'all' || (trackedFilter === 'tracked' ? i.trackedOnDashboard !== false : i.trackedOnDashboard === false);
      return matchSearch && matchCat && matchStatus && matchShopify && matchBin && matchTracked;
    });
  }, [items, search, categoryFilter, statusFilter, shopifyStatusFilter, binTypeFilter, trackedFilter]);

  const handleToggleTracking = useCallback(async (item: any) => {
    setTogglingId(item.id);
    try {
      await api.patch(`/api/inventory/${item.id}`, { trackedOnDashboard: !item.trackedOnDashboard });
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setTogglingId(null);
    }
  }, [refetch]);

  const totalValue    = (data?.totalValue ?? items.reduce((s, i) => s + (i.salePrice ?? 0) * (i.stockLevel ?? 0), 0));
  const totalCostVal  = (data?.totalCostValue ?? 0);
  const lowStockItems = items.filter(i => i.stockLevel <= i.reorderPoint && i.stockLevel > 0);
  const outOfStock    = items.filter(i => i.stockLevel === 0);

  const handleAddItem = async () => {
    if (!brandId || !newItem.sku || !newItem.name) return;
    setSaving(true);
    try {
      await api.post(`/api/inventory?brandId=${brandId}`, newItem);
      setShowAddModal(false);
      setNewItem({ sku: '', name: '', stockLevel: 0, reorderPoint: 10, category: 'General', costPrice: 0, salePrice: 0 });
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const exportCSV = () => {
    const header = 'SKU,Name,Category,Bin,Stock,ROP,Dynamic ROP,Days Cover,Status,Cost Price,Sale Price,Value\n';
    const rows = filtered.map(i =>
      `${i.sku},${i.name},${i.category},${i.binType || 'sellable'},${i.stockLevel},${i.reorderPoint},${i.dynamicRop ?? ''},${i.daysOfCover ?? ''},${i.status},${i.costPrice},${i.salePrice},${(i.salePrice??0)*(i.stockLevel??0)}`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'inventory.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  if (initialLoading) return <div className="p-6"><KPIGridSkeleton count={4} /><div className="mt-6"><TableSkeleton /></div></div>;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Package className="w-5 h-5 text-[#10b981]" /> Inventory
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">{items.length} SKUs tracked</p>
          </div>
          <div className="flex gap-2">
            <button onClick={refetch} disabled={loading} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 bg-white">
              <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 bg-white hover:bg-gray-50">
              <Download className="w-3.5 h-3.5" /> Export
            </button>
            <button onClick={() => setShowAddModal(true)} className="flex items-center gap-1.5 px-3 py-2 bg-[#10b981] text-white rounded-lg text-sm font-medium hover:bg-[#0ea572]">
              <Plus className="w-3.5 h-3.5" /> Add Item
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          {[
            { label: 'Total SKUs', value: items.length, color: 'text-blue-600 bg-blue-50', hint: null },
            { label: 'Retail Value', value: formatINRCompact(totalValue), color: 'text-green-600 bg-green-50', hint: 'Stock on hand × sale price. OOS items excluded (zero stock).' },
            { label: 'Cost Value', value: formatINRCompact(totalCostVal), color: 'text-teal-600 bg-teal-50', hint: 'Stock on hand × cost price — actual capital tied up.' },
            { label: 'Low Stock', value: lowStockItems.length, color: 'text-yellow-600 bg-yellow-50', hint: 'SKUs with stock ≤ reorder point (but not zero).' },
            { label: 'Out of Stock', value: outOfStock.length, color: 'text-red-600 bg-red-50', hint: 'SKUs with zero units on hand.' },
            { label: 'Below Dynamic ROP', value: items.filter(i => (i as any).belowRop).length, color: 'text-orange-600 bg-orange-50', hint: 'SKUs below calculated ROP = (avg daily sales × 7 days lead time) + 2 days safety stock.' },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 relative group">
              <p className="text-2xl font-bold text-gray-900">{k.value}</p>
              <p className={`text-xs mt-1 font-medium ${k.color.split(' ')[0]}`}>{k.label}</p>
              {k.hint && (
                <div className="absolute bottom-full left-0 mb-1 z-10 hidden group-hover:block w-52 bg-gray-900 text-white text-[10px] rounded-lg p-2 shadow-xl leading-relaxed">
                  {k.hint}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Low stock alert */}
        {(lowStockItems.length > 0 || outOfStock.length > 0) && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 mb-4 flex items-center gap-3 text-sm text-yellow-800">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span><strong>{outOfStock.length}</strong> out of stock, <strong>{lowStockItems.length}</strong> below reorder point</span>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search SKU or name..."
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-[#10b981]" />
          </div>
          <div className="relative">
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
              className="pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm bg-white appearance-none focus:outline-none focus:border-[#10b981]">
              <option value="all">All Categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
          <div className="relative">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm bg-white appearance-none focus:outline-none focus:border-[#10b981]">
              <option value="all">All Status</option>
              <option value="in_stock">In Stock</option>
              <option value="low_stock">Low Stock</option>
              <option value="out_of_stock">Out of Stock</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
          <div className="relative">
            <select value={shopifyStatusFilter} onChange={e => setShopifyStatusFilter(e.target.value)}
              className="pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm bg-white appearance-none focus:outline-none focus:border-[#10b981]">
              <option value="all">All Products</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
          <div className="relative">
            <select value={binTypeFilter} onChange={e => setBinTypeFilter(e.target.value)}
              className="pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm bg-white appearance-none focus:outline-none focus:border-[#10b981]">
              <option value="all">All Bins</option>
              <option value="sellable">Sellable</option>
              <option value="damaged">Damaged</option>
              <option value="expired">Expired</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
          <div className="relative">
            <select value={trackedFilter} onChange={e => setTrackedFilter(e.target.value)}
              className="pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm bg-white appearance-none focus:outline-none focus:border-[#10b981]">
              <option value="all">All SKUs</option>
              <option value="tracked">Tracked only</option>
              <option value="untracked">Ignored only</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
          <p className="self-center text-sm text-gray-500 ml-auto">{filtered.length} items</p>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['SKU', 'Name', 'Category', 'Bin', 'Stock', 'ROP', 'Dyn. ROP', 'Days Cover', 'Status', 'Cost', 'Sale Price', 'Value', 'Tracking'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length > 0 ? filtered.map((i: any) => {
                  const belowRop = i.belowRop ?? (i.stockLevel < i.reorderPoint);
                  const rowBg = i.stockLevel === 0
                    ? 'bg-red-50/40'
                    : belowRop
                    ? 'bg-orange-50/40'
                    : i.stockLevel <= i.reorderPoint
                    ? 'bg-yellow-50/30'
                    : '';
                  return (
                  <tr key={i.id} className={`border-t border-gray-50 hover:bg-gray-50/50 ${rowBg}`}>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{i.sku}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{i.name}</td>
                    <td className="px-4 py-3 text-gray-500">{i.category}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${BIN_COLORS[i.binType || 'sellable'] || 'bg-gray-100 text-gray-600'}`}>
                        {(i.binType || 'sellable').charAt(0).toUpperCase() + (i.binType || 'sellable').slice(1)}
                      </span>
                    </td>
                    <td className={`px-4 py-3 font-bold ${i.stockLevel === 0 ? 'text-red-600' : belowRop ? 'text-orange-600' : 'text-gray-900'}`}>{i.stockLevel}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{i.reorderPoint}</td>
                    <td className="px-4 py-3 text-xs">
                      {i.dynamicRop != null
                        ? <span className={`font-medium ${i.stockLevel < i.dynamicRop ? 'text-orange-600' : 'text-gray-600'}`}>{i.dynamicRop}</span>
                        : <span className="text-gray-300">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {i.daysOfCover != null && i.stockLevel > 0
                        ? <span className={`font-semibold ${i.daysOfCover < 7 ? 'text-red-600' : i.daysOfCover < 14 ? 'text-yellow-600' : 'text-emerald-600'}`}>
                            {i.daysOfCover}d
                          </span>
                        : <span className="text-red-500 font-semibold">0d</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[i.status] || 'bg-gray-100 text-gray-600'}`}>
                        {i.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatINR(i.costPrice ?? 0)}</td>
                    <td className="px-4 py-3 font-medium">{formatINR(i.salePrice ?? 0)}</td>
                    <td className="px-4 py-3 text-gray-600">{formatINR((i.salePrice ?? 0) * (i.stockLevel ?? 0))}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 bg-gray-100 rounded-full p-0.5 w-fit">
                        <button
                          onClick={() => i.trackedOnDashboard === false && handleToggleTracking(i)}
                          disabled={togglingId === i.id || i.trackedOnDashboard !== false}
                          title="Track this SKU in dashboard KPIs"
                          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${
                            i.trackedOnDashboard !== false
                              ? 'bg-white shadow-sm text-emerald-600'
                              : 'text-gray-400 hover:text-gray-600 cursor-pointer'
                          } disabled:cursor-default`}
                        >
                          <Eye className="w-3 h-3" />
                          Track
                        </button>
                        <button
                          onClick={() => i.trackedOnDashboard !== false && handleToggleTracking(i)}
                          disabled={togglingId === i.id || i.trackedOnDashboard === false}
                          title="Ignore this SKU — won't appear in dashboard KPIs"
                          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${
                            i.trackedOnDashboard === false
                              ? 'bg-white shadow-sm text-red-500'
                              : 'text-gray-400 hover:text-gray-600 cursor-pointer'
                          } disabled:cursor-default`}
                        >
                          <EyeOff className="w-3 h-3" />
                          Ignore
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                }) : (
                  <tr><td colSpan={13} className="px-4 py-10 text-center text-gray-400 text-sm">No items found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add Item Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Add Inventory Item</h3>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-3">
              {[
                { label: 'SKU *', key: 'sku', type: 'text' },
                { label: 'Name *', key: 'name', type: 'text' },
                { label: 'Category', key: 'category', type: 'text' },
                { label: 'Stock Level', key: 'stockLevel', type: 'number' },
                { label: 'Reorder Point', key: 'reorderPoint', type: 'number' },
                { label: 'Cost Price (₹)', key: 'costPrice', type: 'number' },
                { label: 'Sale Price (₹)', key: 'salePrice', type: 'number' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
                  <input
                    type={f.type}
                    value={(newItem as any)[f.key]}
                    onChange={e => setNewItem(p => ({ ...p, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#10b981]"
                  />
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleAddItem} disabled={saving || !newItem.sku || !newItem.name}
                className="px-4 py-2 text-sm bg-[#10b981] text-white rounded-lg hover:bg-[#0ea572] disabled:opacity-50">
                {saving ? 'Saving...' : 'Add Item'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
