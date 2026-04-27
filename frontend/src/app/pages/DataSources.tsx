import { useState, useEffect } from 'react';
import { Database, Plus, RefreshCw, CheckCircle, AlertCircle, Clock, Trash2 } from 'lucide-react';
import { getToken } from '../context/AuthContext';
import { api } from '../lib/apiClient';
import { toast } from '../components/Toast';

const SYNC_STATUS_COLORS: Record<string, string> = {
  active:   'bg-green-100 text-green-700',
  pending:  'bg-yellow-100 text-yellow-700',
  syncing:  'bg-blue-100 text-blue-700',
  error:    'bg-red-100 text-red-700',
};

const SOURCE_TYPES = ['shopify', 'csv', 'google_sheets', 'freshdesk', 'custom'];

export default function DataSources() {
  const [brandId, setBrandId] = useState('');
  const [sources, setSources] = useState<any[]>([]);
  const [recentSyncs, setRecentSyncs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newSource, setNewSource] = useState({ name: '', type: 'shopify' });
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch('/api/brands', { credentials: 'include', headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.brands?.[0]) setBrandId(d.brands[0].id); })
      .catch(() => {});
  }, []);

  const loadData = () => {
    if (!brandId) return;
    setLoading(true);
    api.get(`/api/data-sources?brandId=${brandId}`)
      .then((d: any) => { setSources(d.sources || []); setRecentSyncs(d.recentSyncs || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, [brandId]);

  const handleSync = async (id: string) => {
    setSyncing(id);
    try {
      await api.post(`/api/data-sources/${id}/sync`, {});
      setSources(s => s.map(src => src.id === id ? { ...src, syncStatus: 'syncing' } : src));
      setTimeout(() => {
        setSources(s => s.map(src => src.id === id ? { ...src, syncStatus: 'active', lastSync: new Date().toISOString() } : src));
        setSyncing(null);
      }, 4000);
    } catch (err: any) {
      toast.error(err.message);
      setSyncing(null);
    }
  };

  const handleCreate = async () => {
    if (!brandId || !newSource.name) return;
    setSaving(true);
    try {
      const d: any = await api.post(`/api/data-sources?brandId=${brandId}`, newSource);
      setSources(s => [d.source, ...s]);
      setShowCreate(false);
      setNewSource({ name: '', type: 'shopify' });
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this data source?')) return;
    try {
      await api.delete(`/api/data-sources/${id}`);
      setSources(s => s.filter(src => src.id !== id));
    } catch (err: any) { toast.error(err.message); }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-5xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Database className="w-6 h-6 text-[#10b981]" /> Data Sources
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Connect and sync external data into your dashboard</p>
          </div>
          <div className="flex gap-2">
            <button onClick={loadData} disabled={loading} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 bg-white">
              <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 py-2 bg-[#10b981] text-white rounded-lg text-sm font-medium hover:bg-[#0ea572]">
              <Plus className="w-4 h-4" /> Add Source
            </button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 bg-white rounded-xl border border-gray-200 animate-pulse" />)}</div>
        ) : sources.length > 0 ? (
          <div className="space-y-3 mb-6">
            {sources.map(s => (
              <div key={s.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                      <Database className="w-5 h-5 text-gray-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">{s.name}</h3>
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-medium capitalize">{s.type}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SYNC_STATUS_COLORS[s.syncStatus] || 'bg-gray-100 text-gray-600'}`}>{s.syncStatus}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {s.recordCount > 0 && <span>{s.recordCount.toLocaleString()} records · </span>}
                        {s.lastSync ? `Last synced ${new Date(s.lastSync).toLocaleString('en-IN')}` : 'Never synced'}
                      </p>
                      {s.lastError && <p className="text-xs text-red-500 mt-0.5 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{s.lastError}</p>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleSync(s.id)} disabled={syncing === s.id || s.syncStatus === 'syncing'}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                      <RefreshCw className={`w-3.5 h-3.5 ${syncing === s.id ? 'animate-spin' : ''}`} />
                      {syncing === s.id ? 'Syncing...' : 'Sync Now'}
                    </button>
                    <button onClick={() => handleDelete(s.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center mb-6">
            <Database className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No data sources connected yet.</p>
          </div>
        )}

        {/* Sync History */}
        {recentSyncs.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="font-semibold text-gray-900 text-sm mb-4">Recent Sync Activity</h2>
            <div className="space-y-2">
              {recentSyncs.slice(0, 10).map((log: any) => (
                <div key={log.id} className="flex items-center gap-3 text-sm">
                  {log.status === 'completed' ? <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    : log.status === 'error' ? <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    : <Clock className="w-4 h-4 text-yellow-500 flex-shrink-0" />}
                  <span className="text-gray-600 flex-1 capitalize">{log.status}</span>
                  {log.recordCount > 0 && <span className="text-gray-400 text-xs">{log.recordCount} records</span>}
                  <span className="text-gray-400 text-xs">{new Date(log.syncedAt).toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Create Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Add Data Source</h3>
                <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
                  <input value={newSource.name} onChange={e => setNewSource(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Main Shopify Store"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#10b981]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                  <select value={newSource.type} onChange={e => setNewSource(p => ({ ...p, type: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-[#10b981]">
                    {SOURCE_TYPES.map(t => <option key={t} value={t} className="capitalize">{t.replace('_', ' ')}</option>)}
                  </select>
                </div>
              </div>
              <div className="px-5 py-4 border-t border-gray-100 flex gap-2 justify-end">
                <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleCreate} disabled={saving || !newSource.name}
                  className="px-4 py-2 text-sm bg-[#10b981] text-white rounded-lg hover:bg-[#0ea572] disabled:opacity-50">
                  {saving ? 'Adding...' : 'Add Source'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
