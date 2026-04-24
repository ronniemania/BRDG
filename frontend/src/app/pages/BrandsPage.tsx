import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Store, Plus, Trash2, Edit2, Check, X, FileText } from 'lucide-react';
import { getToken } from '../context/AuthContext';
import { api } from '../lib/apiClient';

export default function BrandsPage() {
  const navigate = useNavigate();
  const [brands, setBrands] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const loadBrands = () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    fetch('/api/brands', { credentials: 'include', headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => setBrands(d?.brands || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadBrands(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const d: any = await api.post('/api/brands', { name: newName.trim() });
      setBrands(b => [...b, d.brand]);
      setNewName('');
      setShowCreate(false);
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  };

  const handleEdit = async (id: string) => {
    if (!editName.trim()) return;
    try {
      const d: any = await api.patch(`/api/brands/${id}`, { name: editName.trim() });
      setBrands(b => b.map(br => br.id === id ? d.brand : br));
      setEditingId(null);
    } catch (err: any) { alert(err.message); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this brand? This cannot be undone.')) return;
    try {
      await api.delete(`/api/brands/${id}`);
      setBrands(b => b.filter(br => br.id !== id));
    } catch (err: any) { alert(err.message); }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Store className="w-6 h-6 text-[#10b981]" /> Brands
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage your brand workspaces</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 py-2 bg-[#10b981] text-white rounded-lg text-sm font-medium hover:bg-[#0ea572]">
            <Plus className="w-4 h-4" /> New Brand
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-white rounded-xl border border-gray-200 animate-pulse" />)}</div>
        ) : brands.length > 0 ? (
          <div className="space-y-3">
            {brands.map(brand => (
              <div key={brand.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-center justify-between">
                {editingId === brand.id ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input value={editName} onChange={e => setEditName(e.target.value)} autoFocus
                      className="flex-1 px-3 py-1.5 border border-[#10b981] rounded-lg text-sm focus:outline-none"
                      onKeyDown={e => { if (e.key === 'Enter') handleEdit(brand.id); if (e.key === 'Escape') setEditingId(null); }} />
                    <button onClick={() => handleEdit(brand.id)} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"><Check className="w-4 h-4" /></button>
                    <button onClick={() => setEditingId(null)} className="p-1.5 text-gray-400 hover:bg-gray-50 rounded-lg"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold text-sm">
                      {brand.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{brand.name}</h3>
                      <p className="text-xs text-gray-400">
                        Created {new Date(brand.createdAt).toLocaleDateString('en-IN')} ·
                        <span className={`ml-1 capitalize ${brand.status === 'active' ? 'text-green-600' : 'text-gray-500'}`}>{brand.status}</span>
                      </p>
                    </div>
                  </div>
                )}
                {editingId !== brand.id && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => navigate(`/brands/${brand.id}/reports`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[#10b981] border border-[#10b981]/30 hover:bg-[#10b981]/5 rounded-lg font-medium transition-colors"
                      title="View Reports"
                    >
                      <FileText className="w-3.5 h-3.5" /> Reports
                    </button>
                    <button onClick={() => { setEditingId(brand.id); setEditName(brand.name); }} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(brand.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
            <Store className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm mb-4">No brands yet. Create your first brand to get started.</p>
            <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-[#10b981] text-white rounded-lg text-sm font-medium hover:bg-[#0ea572]">Create Brand</button>
          </div>
        )}

        {/* Create Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Create New Brand</h3>
                <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
              </div>
              <div className="p-5">
                <label className="block text-xs font-medium text-gray-600 mb-2">Brand Name *</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Acme Corp"
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#10b981]" />
              </div>
              <div className="px-5 py-4 border-t border-gray-100 flex gap-2 justify-end">
                <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleCreate} disabled={saving || !newName.trim()}
                  className="px-4 py-2 text-sm bg-[#10b981] text-white rounded-lg hover:bg-[#0ea572] disabled:opacity-50">
                  {saving ? 'Creating...' : 'Create Brand'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
