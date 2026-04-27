import { useState, useEffect, useRef } from 'react';
import { Database, Plus, RefreshCw, CheckCircle, AlertCircle, Clock, Trash2, Upload, Link2, Link2Off } from 'lucide-react';
import { getToken } from '../../context/AuthContext';
import { api } from '../../lib/apiClient';
import { toast } from '../../components/Toast';

const SYNC_STATUS_COLORS: Record<string, string> = {
  active:   'bg-green-100 text-green-700',
  pending:  'bg-yellow-100 text-yellow-700',
  syncing:  'bg-blue-100 text-blue-700',
  error:    'bg-red-100 text-red-700',
};

const SOURCE_TYPES = ['shopify', 'csv', 'google_sheets', 'freshdesk', 'custom'];

// ─── Freshdesk Connector ──────────────────────────────────────────────────────

interface FreshdeskStatus {
  connected: boolean;
  domain?: string;
  sourceId?: string;
  lastSync?: string;
  recordCount?: number;
  syncStatus?: string;
}

function FreshdeskConnector({ brandId }: { brandId: string }) {
  const [status, setStatus] = useState<FreshdeskStatus>({ connected: false });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ domain: '', apiKey: '' });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const loadStatus = () => {
    if (!brandId) return;
    const token = getToken();
    fetch(`/api/freshdesk/status?brandId=${brandId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setStatus(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadStatus(); }, [brandId]);

  const handleConnect = async () => {
    if (!form.domain || !form.apiKey) return;
    setSaving(true);
    setToast('');
    try {
      const res = await api.post(`/api/freshdesk/connect?brandId=${brandId}`, form);
      if ((res as any).message) {
        setToast('Connected successfully!');
        setShowForm(false);
        setForm({ domain: '', apiKey: '' });
        loadStatus();
      }
    } catch (err: any) {
      setToast(err.message || 'Connection failed');
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setToast('');
    try {
      await api.post(`/api/freshdesk/sync?brandId=${brandId}`, {});
      setToast('Sync started — tickets will appear shortly');
      setTimeout(loadStatus, 5000);
    } catch (err: any) {
      setToast(err.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect Freshdesk? Your synced tickets will remain in the database.')) return;
    try {
      await api.delete(`/api/freshdesk/disconnect?brandId=${brandId}`);
      setStatus({ connected: false });
      setToast('Disconnected');
    } catch (err: any) {
      setToast(err.message);
    }
  };

  if (loading) return <div className="h-24 bg-white rounded-xl border border-gray-200 animate-pulse mb-6" />;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
            <span className="text-blue-600 font-bold text-sm">FD</span>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              Freshdesk
              {status.connected && (
                <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">Connected</span>
              )}
            </h3>
            <p className="text-xs text-gray-400">
              {status.connected
                ? `${status.domain} · ${status.recordCount ?? 0} tickets${status.lastSync ? ' · Last synced ' + new Date(status.lastSync).toLocaleDateString('en-IN') : ''}`
                : 'Connect to sync support tickets from Freshdesk'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {status.connected ? (
            <>
              <button onClick={handleSync} disabled={syncing}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : 'Sync Now'}
              </button>
              <button onClick={handleDisconnect}
                className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50" title="Disconnect">
                <Link2Off className="w-4 h-4" />
              </button>
            </>
          ) : (
            <button onClick={() => setShowForm(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">
              <Link2 className="w-3.5 h-3.5" /> Connect
            </button>
          )}
        </div>
      </div>

      {toast && (
        <p className={`text-xs px-3 py-2 rounded-lg mb-3 ${toast.includes('success') || toast.includes('started') || toast.includes('Disconnected') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
          {toast}
        </p>
      )}

      {showForm && !status.connected && (
        <div className="border-t border-gray-100 pt-4 space-y-3">
          <p className="text-xs text-gray-500">Enter your Freshdesk subdomain and API key. Find your API key at <strong>Profile Settings → API Key</strong> in Freshdesk.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Freshdesk Domain *</label>
              <input value={form.domain} onChange={e => setForm(p => ({ ...p, domain: e.target.value }))}
                placeholder="yourcompany.freshdesk.com"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">API Key *</label>
              <input type="password" value={form.apiKey} onChange={e => setForm(p => ({ ...p, apiKey: e.target.value }))}
                placeholder="••••••••••••••••••••"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleConnect} disabled={saving || !form.domain || !form.apiKey}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Verifying...' : 'Connect & Verify'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-200 text-sm text-gray-600 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DataSources() {
  const [brandId, setBrandId] = useState('');
  const [sources, setSources] = useState<any[]>([]);
  const [recentSyncs, setRecentSyncs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newSource, setNewSource] = useState({ name: '', type: 'shopify' });
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);

  // File upload state
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<any[]>([]);
  const [forceDataType, setForceDataType] = useState('auto');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

      // Poll the real status from the server instead of faking it
      let attempts = 0;
      const maxAttempts = 20; // 40 seconds max
      const poll = setInterval(async () => {
        attempts++;
        try {
          const d: any = await api.get(`/api/data-sources/${id}`);
          if (d.source.syncStatus !== 'syncing' || attempts >= maxAttempts) {
            clearInterval(poll);
            setSources(s => s.map(src => src.id === id ? { ...src, ...d.source } : src));
            setSyncing(null);
          }
        } catch {
          clearInterval(poll);
          setSyncing(null);
        }
      }, 2000);
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

  const handleUpload = async () => {
    if (!brandId || uploadFiles.length === 0) return;
    setUploading(true);
    setUploadResults([]);
    try {
      const formData = new FormData();
      formData.append('brandId', brandId);
      if (forceDataType !== 'auto') formData.append('dataType', forceDataType);
      uploadFiles.forEach(f => formData.append('files', f));
      const result: any = await api.upload('/api/files/upload', formData);
      setUploadResults(result.results || []);
      setUploadFiles([]);
      setForceDataType('auto');
      if (fileInputRef.current) fileInputRef.current.value = '';
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
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

        {/* Freshdesk Connector */}
        {brandId && <FreshdeskConnector brandId={brandId} />}

        {/* File Upload Section */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
          <h2 className="font-semibold text-gray-900 text-sm mb-1 flex items-center gap-2">
            <Upload className="w-4 h-4 text-[#10b981]" /> Upload Data File
          </h2>
          <p className="text-xs text-gray-500 mb-3">
            Import orders, inventory, customers, returns, or <strong>fulfillment pipeline</strong> data from CSV, JSON, or Excel (.xlsx).
            {' '}Rename your file to include the data type (e.g. <em>orders_may.csv</em>) or use the override below.
          </p>

          {/* Data type override */}
          <div className="flex gap-3 flex-wrap items-center mb-3">
            <div>
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block mb-1">Data Type Override</label>
              <div className="flex gap-1 flex-wrap">
                {['auto', 'orders', 'inventory', 'customers', 'returns', 'fulfillment'].map(t => (
                  <button
                    key={t}
                    onClick={() => setForceDataType(t)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                      forceDataType === t
                        ? 'bg-[#10b981] text-white border-[#10b981]'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {t === 'auto' ? '✦ Auto-detect' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Fulfillment column guide */}
          {forceDataType === 'fulfillment' && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2.5 mb-3 text-xs text-indigo-700">
              <p className="font-semibold mb-1">Fulfillment column names recognised (any of these work):</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-[10px]">
                <span>Order Trigger: <em>order_date, Created at, timestamp</em></span>
                <span>Picklist Gen: <em>picklist_generated_at, Picklist Time</em></span>
                <span>Picklist Done: <em>picklist_complete_at, Pick Complete</em></span>
                <span>Packlist: <em>move_to_packlist_at, Pack Start</em></span>
                <span>AWB: <em>awb_generated_at, Label Generated</em></span>
                <span>Courier: <em>connected_to_courier_at, Dispatched At</em></span>
              </div>
              <p className="mt-1.5 text-[10px]">
                <strong>Tip:</strong> Upload your Shopify orders export as <em>Orders</em> — order date is auto-seeded as the trigger time.
                Upload your OMS/WMS sheet as <em>Fulfillment</em> to populate the remaining steps.
              </p>
            </div>
          )}

          <div className="flex gap-3 flex-wrap items-center">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.json,.xlsx,.xls"
              multiple
              onChange={e => setUploadFiles(Array.from(e.target.files || []))}
              className="flex-1 min-w-[220px] text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:border file:border-gray-200 file:rounded-lg file:text-sm file:text-gray-600 file:bg-white hover:file:bg-gray-50 file:cursor-pointer"
            />
            <button
              onClick={handleUpload}
              disabled={!brandId || uploadFiles.length === 0 || uploading}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#10b981] text-white rounded-lg text-sm font-medium hover:bg-[#0ea572] disabled:opacity-50"
            >
              {uploading
                ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Uploading...</>
                : <><Upload className="w-3.5 h-3.5" /> Upload {forceDataType !== 'auto' ? `as ${forceDataType}` : ''}</>
              }
            </button>
          </div>
          {uploadFiles.length > 0 && !uploading && (
            <p className="text-xs text-gray-400 mt-2">{uploadFiles.length} file(s) selected: {uploadFiles.map(f => f.name).join(', ')}</p>
          )}
          {uploadResults.length > 0 && (
            <div className="mt-3 space-y-1">
              {uploadResults.map((r: any, i: number) => (
                <div key={i} className={`text-xs flex items-start gap-2 ${r.status === 'error' ? 'text-red-600' : 'text-green-600'}`}>
                  {r.status === 'error'
                    ? <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    : <CheckCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
                  <span><strong>{r.fileName}</strong>: {r.status === 'error' ? r.error : `${r.recordCount} records imported`}</span>
                </div>
              ))}
            </div>
          )}
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
