import { useState, useEffect } from 'react';
import { FileText, Plus, Play, Trash2, RefreshCw, Calendar, Mail, X } from 'lucide-react';
import { apiClient } from '../lib/apiClient';

const BUILT_IN_REPORT_TYPES = ['revenue', 'orders', 'inventory', 'customers', 'returns', 'business'];

const TYPE_DESCRIPTIONS: Record<string, string> = {
  revenue:   'Revenue and order performance',
  orders:    'Order breakdown by status',
  inventory: 'Stock levels and value',
  customers: 'Customer spend and retention',
  returns:   'Return trends and value',
  business:  'Full business health snapshot',
};

interface Props {
  brandId: string;
  brandName: string;
  openCreate?: boolean;
  onOpenCreateHandled?: () => void;
}

interface Report {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  lastGenerated?: string;
  config?: Record<string, any>;
}

interface RunFilters {
  start_date: string;
  end_date: string;
}

// ─── Email Modal ───────────────────────────────────────────────────────────────

function EmailModal({
  report,
  brandName,
  onClose,
}: {
  report: Report;
  brandName: string;
  onClose: () => void;
}) {
  const [recipientInput, setRecipientInput] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState('');

  const addRecipient = () => {
    const email = recipientInput.trim();
    if (!email || !email.includes('@')) return;
    if (!recipients.includes(email)) setRecipients(r => [...r, email]);
    setRecipientInput('');
  };

  const handleSend = async () => {
    if (recipients.length === 0) { setToast('Add at least one recipient'); return; }
    setSending(true);
    try {
      const res = await apiClient.post(`/api/reports/${report.id}/email`, {
        recipients,
        start_date: startDate || undefined,
        end_date:   endDate   || undefined,
      });
      const d: any = await res.json();
      if (!res.ok) throw new Error(d.message || 'Failed');
      setToast(d.message || 'Sent!');
      setTimeout(onClose, 2000);
    } catch (err: any) {
      setToast(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Mail className="w-4 h-4 text-[#10b981]" /> Email Report
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">{report.name} · {brandName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          {/* Recipients */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Recipients *</label>
            <div className="flex gap-2">
              <input
                value={recipientInput}
                onChange={e => setRecipientInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addRecipient(); } }}
                placeholder="email@example.com"
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#10b981]"
              />
              <button onClick={addRecipient} className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200">Add</button>
            </div>
            {recipients.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {recipients.map(r => (
                  <span key={r} className="flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs">
                    {r}
                    <button onClick={() => setRecipients(prev => prev.filter(x => x !== r))}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          {/* Optional date range */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date Range (optional)</label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] text-gray-400 mb-0.5">From</p>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs focus:outline-none focus:border-[#10b981]" />
              </div>
              <div>
                <p className="text-[10px] text-gray-400 mb-0.5">To</p>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs focus:outline-none focus:border-[#10b981]" />
              </div>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">Leave blank for all-time data</p>
          </div>
          {toast && (
            <p className={`text-xs px-3 py-2 rounded-lg ${toast.includes('Sent') || toast.includes('emailed') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
              {toast}
            </p>
          )}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={handleSend} disabled={sending || recipients.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-[#10b981] text-white rounded-lg hover:bg-[#0ea572] disabled:opacity-50">
            {sending ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Sending...</> : <><Mail className="w-3.5 h-3.5" /> Send</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function ReportManager({ brandId, brandName, openCreate, onOpenCreateHandled }: Props) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [emailReport, setEmailReport] = useState<Report | null>(null);
  const [customTypeMode, setCustomTypeMode] = useState(false);

  useEffect(() => {
    if (openCreate) { setShowCreate(true); onOpenCreateHandled?.(); }
  }, [openCreate, onOpenCreateHandled]);

  const [newReport, setNewReport] = useState({ name: '', type: 'business', customType: '' });
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [runFilters, setRunFilters] = useState<RunFilters>({ start_date: '', end_date: '' });
  const [showRunFilters, setShowRunFilters] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setResult(null);
    apiClient
      .get(`/api/reports?brandId=${brandId}`)
      .then((res) => res.json())
      .then((d: any) => setReports(d.reports || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [brandId]);

  const handleCreate = async () => {
    if (!newReport.name.trim()) return;
    const finalType = customTypeMode && newReport.customType.trim()
      ? newReport.customType.trim().toLowerCase().replace(/\s+/g, '_')
      : newReport.type;
    setSaving(true);
    try {
      const res = await apiClient.post(`/api/reports?brandId=${brandId}`, { name: newReport.name, type: finalType });
      const d: any = await res.json();
      if (!res.ok) throw new Error(d.message || 'Failed to create report');
      setReports((r) => [d.report, ...r]);
      setShowCreate(false);
      setNewReport({ name: '', type: 'business', customType: '' });
      setCustomTypeMode(false);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRun = async (id: string) => {
    setRunning(id);
    setResult(null);
    setShowRunFilters(null);
    try {
      const res = await apiClient.post(`/api/reports/${id}/run`, runFilters);
      const d: any = await res.json();
      if (!res.ok) throw new Error(d.message || 'Failed to run report');
      setResult(d);
      setReports((r) => r.map((rep) => rep.id === id ? { ...rep, lastGenerated: new Date().toISOString() } : rep));
    } catch (err: any) {
      alert(err.message);
    } finally {
      setRunning(null);
      setRunFilters({ start_date: '', end_date: '' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this report?')) return;
    try {
      const res = await apiClient.delete(`/api/reports/${id}`);
      if (!res.ok) { const d: any = await res.json(); throw new Error(d.message || 'Failed'); }
      setReports((r) => r.filter((rep) => rep.id !== id));
      if (result?.report?.id === id) setResult(null);
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <>
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-white rounded-xl border border-gray-200 animate-pulse" />)}
        </div>
      ) : reports.length > 0 ? (
        <div className="space-y-3">
          {reports.map((r) => (
            <div key={r.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900">{r.name}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                      r.type === 'business' ? 'bg-emerald-100 text-emerald-700'
                      : BUILT_IN_REPORT_TYPES.includes(r.type) ? 'bg-gray-100 text-gray-600'
                      : 'bg-purple-100 text-purple-700'
                    }`}>
                      {r.type.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">
                    {brandName} · Created {new Date(r.createdAt).toLocaleDateString('en-IN')}
                    {r.lastGenerated && ` · Last run ${new Date(r.lastGenerated).toLocaleDateString('en-IN')}`}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => setShowRunFilters((prev) => prev === r.id ? null : r.id)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg" title="Set date range">
                    <Calendar className="w-4 h-4" />
                  </button>
                  <button onClick={() => setEmailReport(r)}
                    className="p-1.5 text-gray-400 hover:text-[#10b981] hover:bg-emerald-50 rounded-lg" title="Email this report">
                    <Mail className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleRun(r.id)} disabled={running === r.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#10b981] text-white rounded-lg text-xs font-medium hover:bg-[#0ea572] disabled:opacity-50">
                    {running === r.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    {running === r.id ? 'Running...' : 'Run'}
                  </button>
                  <button onClick={() => handleDelete(r.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {showRunFilters === r.id && (
                <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500 whitespace-nowrap">From</label>
                    <input type="date" value={runFilters.start_date}
                      onChange={(e) => setRunFilters((f) => ({ ...f, start_date: e.target.value }))}
                      className="px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:border-[#10b981]" />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500 whitespace-nowrap">To</label>
                    <input type="date" value={runFilters.end_date}
                      onChange={(e) => setRunFilters((f) => ({ ...f, end_date: e.target.value }))}
                      className="px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:border-[#10b981]" />
                  </div>
                  <p className="text-xs text-gray-400">Leave blank for all-time</p>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
          <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No reports for <span className="font-medium">{brandName}</span> yet.</p>
          <button onClick={() => setShowCreate(true)}
            className="mt-4 px-4 py-2 bg-[#10b981] text-white rounded-lg text-sm font-medium hover:bg-[#0ea572]">
            Create First Report
          </button>
        </div>
      )}

      {/* Report result panel */}
      {result && (
        <div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-gray-900">{result.report?.name}</h3>
              <p className="text-xs text-gray-400 mt-0.5">{brandName} · {new Date().toLocaleDateString('en-IN')}</p>
            </div>
            <button onClick={() => setResult(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(result.data || {})
              .filter(([, v]) => typeof v === 'number')
              .map(([k, v]) => (
                <div key={k} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-lg font-bold text-gray-900">
                    {/revenue|value|spent|amount/i.test(k) ? `₹${(v as number).toLocaleString('en-IN')}` : v as number}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5 capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}</p>
                </div>
              ))}
          </div>
          {result.data?.byStatus && (
            <div className="mt-4">
              <p className="text-xs font-medium text-gray-500 mb-2">By Status</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(result.data.byStatus).map(([status, count]) => (
                  <span key={status} className="px-2.5 py-1 bg-gray-100 rounded-full text-xs text-gray-700 capitalize">
                    {status}: {count as number}
                  </span>
                ))}
              </div>
            </div>
          )}
          {result.data?.byReason && (
            <div className="mt-4">
              <p className="text-xs font-medium text-gray-500 mb-2">By Reason</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(result.data.byReason).map(([reason, count]) => (
                  <span key={reason} className="px-2.5 py-1 bg-gray-100 rounded-full text-xs text-gray-700">
                    {reason}: {count as number}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">New Report</h3>
                <p className="text-xs text-gray-400 mt-0.5">{brandName}</p>
              </div>
              <button onClick={() => { setShowCreate(false); setCustomTypeMode(false); }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Report Name *</label>
                <input value={newReport.name}
                  onChange={(e) => setNewReport((p) => ({ ...p, name: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                  placeholder="e.g. Monthly Business Review"
                  autoFocus
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#10b981]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Report Type</label>
                {!customTypeMode ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      {BUILT_IN_REPORT_TYPES.map((t) => (
                        <button key={t} onClick={() => setNewReport(p => ({ ...p, type: t }))}
                          className={`px-3 py-2 rounded-lg text-sm text-left border transition-colors ${
                            newReport.type === t
                              ? 'bg-[#10b981] text-white border-[#10b981]'
                              : 'bg-white text-gray-700 border-gray-200 hover:border-[#10b981]'
                          }`}>
                          <p className="font-medium capitalize">{t}</p>
                          <p className={`text-[10px] mt-0.5 ${newReport.type === t ? 'text-white/70' : 'text-gray-400'}`}>
                            {TYPE_DESCRIPTIONS[t] ?? ''}
                          </p>
                        </button>
                      ))}
                    </div>
                    <button onClick={() => setCustomTypeMode(true)}
                      className="mt-2 w-full px-3 py-2 border border-dashed border-gray-300 rounded-lg text-xs text-gray-500 hover:border-gray-400 text-center">
                      + Add custom template type
                    </button>
                  </>
                ) : (
                  <div className="space-y-2">
                    <input value={newReport.customType}
                      onChange={e => setNewReport(p => ({ ...p, customType: e.target.value }))}
                      placeholder="e.g. Weekly Ops Review"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#10b981]" />
                    <button onClick={() => setCustomTypeMode(false)}
                      className="text-xs text-gray-400 hover:text-gray-600">← Back to built-in types</button>
                  </div>
                )}
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={() => { setShowCreate(false); setCustomTypeMode(false); }}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleCreate} disabled={saving || !newReport.name.trim()}
                className="px-4 py-2 text-sm bg-[#10b981] text-white rounded-lg hover:bg-[#0ea572] disabled:opacity-50">
                {saving ? 'Creating...' : 'Create Report'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email modal */}
      {emailReport && (
        <EmailModal report={emailReport} brandName={brandName} onClose={() => setEmailReport(null)} />
      )}

      {/* Floating "New Report" button */}
      {reports.length > 0 && (
        <button onClick={() => setShowCreate(true)}
          className="fixed bottom-6 right-6 flex items-center gap-1.5 px-4 py-2.5 bg-[#10b981] text-white rounded-full shadow-lg text-sm font-medium hover:bg-[#0ea572] transition-colors">
          <Plus className="w-4 h-4" /> New Report
        </button>
      )}
    </>
  );
}
