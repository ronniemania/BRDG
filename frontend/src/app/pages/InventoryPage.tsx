import { useState, useEffect, useMemo } from 'react';
import { Package, Search, RefreshCw, Download, Plus, AlertTriangle, ChevronDown } from 'lucide-react';
import { getToken } from '../context/AuthContext';
import { useDateRangeQuery } from '../hooks/useDateRangeQuery';
import { TableSkeleton, KPIGridSkeleton } from '../components/Skeletons';
import { api } from '../lib/apiClient';

const STATUS_COLORS: Record<string, string> = {
  in_stock:     'bg-green-100 text-green-700',
  low_stock:    'bg-yellow-100 text-yellow-700',
  out_of_stock: 'bg-red-100 text-red-700',
  near_expiry:  'bg-orange-100 text-orange-700',
};

export default function InventoryPage() {
  const [brandId, setBrandId] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItem, setNewItem] = useState({ sku: '', name: '', stockLevel: 0, reorderPoint: 10, category: 'General', costPrice: 0, salePrice: 0 });
  const [saving, setSaving] = useState(false);

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
      return matchSearch && matchCat && matchStatus;
    });
  }, [items, search, categoryFilter, statusFilter]);

  const totalValue = items.reduce((s, i) => s + (i.salePrice ?? 0) * (i.stockLevel ?? 0), 0);
  const lowStockItems = items.filter(i => i.stockLevel <= i.reorderPoint && i.stockLevel > 0);
  const outOfStock = items.filter(i => i.stockLevel === 0);

  const handleAddItem = async () => {
    if (!brandId || !newItem.sku || !newItem.name) return;
    setSaving(true);
    try {
      await api.post(`/api/inventory?brandId=${brandId}`, newItem);
      setShowAddModal(false);
      setNewItem({ sku: '', name: '', stockLevel: 0, reorderPoint: 10, category: 'General', costPrice: 0, salePrice: 0 });
      refetch();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const exportCSV = () => {
    const header = 'SKU,Name,Category,Stock,Reorder Point,Status,Cost Price,Sale Price\n';
    const rows = filtered.map(i => `${i.sku},${i.name},${i.category},${i.stockLevel},${i.reorderPoint},${i.status},${i.costPrice},${i.salePrice}`).join('\n');
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total SKUs', value: items.length, color: 'text-blue-600 bg-blue-50' },
            { label: 'Total Value', value: `₹${(totalValue / 1000).toFixed(1)}k`, color: 'text-green-600 bg-green-50' },
            { label: 'Low Stock', value: lowStockItems.length, color: 'text-yellow-600 bg-yellow-50' },
            { label: 'Out of Stock', value: outOfStock.length, color: 'text-red-600 bg-red-50' },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <p className="text-2xl font-bold text-gray-900">{k.value}</p>
              <p className="text-xs text-gray-500 mt-1">{k.label}</p>
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
          <p className="self-center text-sm text-gray-500 ml-auto">{filtered.length} items</p>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['SKU', 'Name', 'Category', 'Stock', 'Reorder Point', 'Status', 'Cost', 'Sale Price', 'Value'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length > 0 ? filtered.map((i: any) => (
                  <tr key={i.id} className={`border-t border-gray-50 hover:bg-gray-50/50 ${i.stockLevel === 0 ? 'bg-red-50/30' : i.stockLevel <= i.reorderPoint ? 'bg-yellow-50/30' : ''}`}>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{i.sku}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{i.name}</td>
                    <td className="px-4 py-3 text-gray-500">{i.category}</td>
                    <td className="px-4 py-3 font-bold">{i.stockLevel}</td>
                    <td className="px-4 py-3 text-gray-500">{i.reorderPoint}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[i.status] || 'bg-gray-100 text-gray-600'}`}>
                        {i.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">₹{(i.costPrice ?? 0).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 font-medium">₹{(i.salePrice ?? 0).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-gray-600">₹{((i.salePrice ?? 0) * (i.stockLevel ?? 0)).toLocaleString('en-IN')}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400 text-sm">No items found</td></tr>
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
