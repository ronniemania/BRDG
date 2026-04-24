import { useState, useEffect, useCallback } from 'react';
import { Plus, Send, Trash2, Edit2, X, Check, ChevronDown, ChevronUp, Mail, Users } from 'lucide-react';
import { api } from '../../lib/apiClient';
import { useBrand } from '../../context/BrandContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Recipient { email: string; name: string }

interface DeliveryProfile {
  id: string;
  name: string;
  description: string;
  profileType: 'ops' | 'sales' | 'custom';
  metrics: string[];
  recipients: Recipient[];
  emailSubject: string;
  emailTemplate: string;
  schedule: 'manual' | 'daily' | 'weekly';
  lastSent: string | null;
  createdAt: string;
}

// ─── Available metrics (must match backend METRIC_DEFINITIONS) ─────────────

const AVAILABLE_METRICS: Array<{ key: string; label: string; description: string }> = [
  { key: 'total_revenue',     label: 'Total Revenue',       description: 'Sum of all order amounts' },
  { key: 'total_orders',      label: 'Total Orders',         description: 'Count of all orders' },
  { key: 'avg_order_value',   label: 'Avg Order Value',      description: 'Average amount per order' },
  { key: 'pending_orders',    label: 'Pending Orders',       description: 'Orders not yet fulfilled' },
  { key: 'total_customers',   label: 'Total Customers',      description: 'Count of unique customers' },
  { key: 'total_returns',     label: 'Total Returns',        description: 'Count of return requests' },
  { key: 'return_rate',       label: 'Return Rate (%)',       description: 'Returns as a % of orders' },
  { key: 'low_stock_count',   label: 'Low Stock SKUs',        description: 'Items at or below reorder point' },
  { key: 'total_stock_value', label: 'Total Stock Value',    description: 'Inventory value (stock × sale price)' },
  { key: 'sla_breaches',      label: 'SLA Breaches',         description: 'Total fulfillment SLA violations' },
  { key: 'fulfillment_rate',  label: 'Fulfillment Rate (%)', description: 'Completed orders as % of total' },
];

const TEMPLATE_VARS = [
  '{{total_revenue}}', '{{total_orders}}', '{{avg_order_value}}', '{{pending_orders}}',
  '{{total_customers}}', '{{total_returns}}', '{{return_rate}}', '{{low_stock_count}}',
  '{{total_stock_value}}', '{{sla_breaches}}', '{{fulfillment_rate}}',
  '{{brand_name}}', '{{report_date}}', '{{report_timestamp}}',
];

// ─── Profile type badge ───────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    ops:    'bg-blue-100 text-blue-700',
    sales:  'bg-emerald-100 text-emerald-700',
    custom: 'bg-purple-100 text-purple-700',
  };
  return (
    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${styles[type] ?? styles.custom}`}>
      {type}
    </span>
  );
}

// ─── Create / Edit Modal ──────────────────────────────────────────────────────

interface ModalProps {
  initial?: Partial<DeliveryProfile>;
  brandId: string;
  onSave: (profile: DeliveryProfile) => void;
  onClose: () => void;
}

function ProfileModal({ initial, brandId, onSave, onClose }: ModalProps) {
  const isEdit = !!initial?.id;

  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [profileType, setProfileType] = useState<'ops' | 'sales' | 'custom'>(initial?.profileType ?? 'custom');
  const [metrics, setMetrics] = useState<string[]>(initial?.metrics ?? []);
  const [recipients, setRecipients] = useState<Recipient[]>(initial?.recipients ?? []);
  const [emailSubject, setEmailSubject] = useState(initial?.emailSubject ?? '{{brand_name}} Report — {{report_date}}');
  const [emailTemplate, setEmailTemplate] = useState(initial?.emailTemplate ?? '');
  const [schedule, setSchedule] = useState<'manual' | 'daily' | 'weekly'>(initial?.schedule ?? 'manual');

  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [showVars, setShowVars] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleMetric = (key: string) => {
    setMetrics(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const addRecipient = () => {
    if (!newEmail.trim()) return;
    setRecipients(prev => [...prev, { email: newEmail.trim(), name: newName.trim() || newEmail.trim() }]);
    setNewEmail(''); setNewName('');
  };

  const removeRecipient = (i: number) => setRecipients(prev => prev.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true); setError('');
    try {
      const payload = { brandId, name, description, profileType, metrics, recipients, emailSubject, emailTemplate, schedule };
      let result: DeliveryProfile;
      if (isEdit && initial?.id) {
        result = (await api.patch(`/api/delivery-profiles/${initial.id}`, payload)).profile;
      } else {
        result = (await api.post('/api/delivery-profiles', payload)).profile;
      }
      onSave(result);
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            {isEdit ? 'Edit Delivery Profile' : 'New Delivery Profile'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>
          )}

          {/* Name + Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Profile Name *</label>
              <input value={name} onChange={e => setName(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#10b981]/30"
                placeholder="e.g. Ops Daily" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Profile Type</label>
              <select value={profileType} onChange={e => setProfileType(e.target.value as any)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#10b981]/30">
                <option value="ops">Ops</option>
                <option value="sales">Sales</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#10b981]/30"
              placeholder="What does this profile track?" />
          </div>

          {/* Metrics */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">Metrics to Include</label>
            <div className="grid grid-cols-2 gap-1.5">
              {AVAILABLE_METRICS.map(m => (
                <button key={m.key} onClick={() => toggleMetric(m.key)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-xs transition-colors ${
                    metrics.includes(m.key)
                      ? 'bg-[#10b981]/10 border-[#10b981] text-[#10b981]'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                  <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                    metrics.includes(m.key) ? 'bg-[#10b981] border-[#10b981]' : 'border-gray-300'
                  }`}>
                    {metrics.includes(m.key) && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                  <span className="truncate">{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Recipients */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">
              <Users className="w-3.5 h-3.5 inline mr-1" />Recipients
            </label>
            <div className="space-y-2 mb-2">
              {recipients.map((r, i) => (
                <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{r.name}</p>
                    <p className="text-xs text-gray-500">{r.email}</p>
                  </div>
                  <button onClick={() => removeRecipient(i)} className="p-1 text-gray-400 hover:text-red-500">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={newName} onChange={e => setNewName(e.target.value)}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#10b981]/30"
                placeholder="Name" />
              <input value={newEmail} onChange={e => setNewEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addRecipient()}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#10b981]/30"
                placeholder="Email" type="email" />
              <button onClick={addRecipient}
                className="px-3 py-2 bg-[#10b981] text-white rounded-lg text-sm hover:bg-[#10b981]/90">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Email Subject */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              <Mail className="w-3.5 h-3.5 inline mr-1" />Email Subject
            </label>
            <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#10b981]/30"
              placeholder="{{brand_name}} Report — {{report_date}}" />
          </div>

          {/* Email Template */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-700">
                Custom Email Template
                <span className="ml-1 text-gray-400 font-normal">(leave blank for auto-generated)</span>
              </label>
              <button onClick={() => setShowVars(v => !v)}
                className="text-xs text-[#10b981] flex items-center gap-1">
                Variables {showVars ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>
            {showVars && (
              <div className="flex flex-wrap gap-1 mb-2">
                {TEMPLATE_VARS.map(v => (
                  <button key={v} onClick={() => setEmailTemplate(t => t + v)}
                    className="text-[10px] font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded hover:bg-gray-200">
                    {v}
                  </button>
                ))}
              </div>
            )}
            <textarea value={emailTemplate} onChange={e => setEmailTemplate(e.target.value)} rows={6}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#10b981]/30"
              placeholder="Paste raw HTML here, or leave blank to use the auto-generated template." />
          </div>

          {/* Schedule */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Send Schedule</label>
            <div className="flex gap-2">
              {(['manual', 'daily', 'weekly'] as const).map(s => (
                <button key={s} onClick={() => setSchedule(s)}
                  className={`flex-1 py-2 rounded-lg border text-xs font-medium capitalize transition-colors ${
                    schedule === s
                      ? 'bg-[#10b981]/10 border-[#10b981] text-[#10b981]'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm bg-[#10b981] text-white rounded-lg hover:bg-[#10b981]/90 disabled:opacity-50 flex items-center gap-2">
            {saving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {isEdit ? 'Save Changes' : 'Create Profile'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Profile Card ─────────────────────────────────────────────────────────────

interface CardProps {
  profile: DeliveryProfile;
  onEdit: () => void;
  onDelete: () => void;
  onSend: () => void;
  sending: boolean;
}

function ProfileCard({ profile, onEdit, onDelete, onSend, sending }: CardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 hover:border-[#10b981]/30 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-gray-900 truncate">{profile.name}</h3>
            <TypeBadge type={profile.profileType} />
          </div>
          {profile.description && (
            <p className="text-xs text-gray-500 truncate">{profile.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={onEdit}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 mb-3">
        {profile.metrics.slice(0, 4).map(k => {
          const m = AVAILABLE_METRICS.find(a => a.key === k);
          return (
            <span key={k} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
              {m?.label ?? k}
            </span>
          );
        })}
        {profile.metrics.length > 4 && (
          <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
            +{profile.metrics.length - 4} more
          </span>
        )}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        <div className="text-xs text-gray-400">
          {profile.recipients.length} recipient{profile.recipients.length !== 1 ? 's' : ''}
          {' · '}
          <span className="capitalize">{profile.schedule}</span>
          {profile.lastSent && (
            <> · Last sent {new Date(profile.lastSent).toLocaleDateString('en-IN')}</>
          )}
        </div>
        <button onClick={onSend} disabled={sending || profile.recipients.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#10b981] text-white rounded-lg text-xs font-medium hover:bg-[#10b981]/90 disabled:opacity-50">
          {sending ? (
            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Send className="w-3 h-3" />
          )}
          Send Now
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DeliveryProfiles() {
  const { brandId } = useBrand();
  const [profiles, setProfiles] = useState<DeliveryProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DeliveryProfile | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchProfiles = useCallback(async () => {
    if (!brandId) return;
    setLoading(true);
    try {
      const data = await api.get(`/api/delivery-profiles?brandId=${brandId}`);
      setProfiles(data?.profiles ?? []);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [brandId]);

  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

  const handleSave = (profile: DeliveryProfile) => {
    setProfiles(prev => {
      const idx = prev.findIndex(p => p.id === profile.id);
      if (idx >= 0) {
        const next = [...prev]; next[idx] = profile; return next;
      }
      return [profile, ...prev];
    });
    setModalOpen(false); setEditTarget(null);
    showToast(editTarget ? 'Profile updated' : 'Profile created');
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this delivery profile?')) return;
    try {
      await api.delete(`/api/delivery-profiles/${id}`);
      setProfiles(prev => prev.filter(p => p.id !== id));
      showToast('Profile deleted');
    } catch (err: any) {
      showToast(err.message || 'Delete failed', false);
    }
  };

  const handleSend = async (id: string) => {
    setSendingId(id);
    try {
      const result = await api.post(`/api/delivery-profiles/${id}/send`, {});
      setProfiles(prev => prev.map(p => p.id === id ? { ...p, lastSent: new Date().toISOString() } : p));
      showToast(`Sent to ${result.sent} recipient(s)${result.failed > 0 ? `, ${result.failed} failed` : ''}`);
    } catch (err: any) {
      showToast(err.message || 'Send failed', false);
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Delivery Profiles</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Group metrics into email reports and send to custom recipient lists.
          </p>
        </div>
        <button onClick={() => { setEditTarget(null); setModalOpen(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-[#10b981] text-white rounded-xl text-sm font-medium hover:bg-[#10b981]/90">
          <Plus className="w-4 h-4" /> New Profile
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${
          toast.ok ? 'bg-[#10b981]' : 'bg-red-500'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Profile grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-44 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : profiles.length === 0 ? (
        <div className="text-center py-20">
          <Mail className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No delivery profiles yet.</p>
          <p className="text-gray-400 text-xs mt-1">Create your first profile to start sending metric reports.</p>
          <button onClick={() => setModalOpen(true)}
            className="mt-4 px-4 py-2 bg-[#10b981] text-white rounded-xl text-sm font-medium hover:bg-[#10b981]/90">
            Create Profile
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {profiles.map(profile => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              sending={sendingId === profile.id}
              onEdit={() => { setEditTarget(profile); setModalOpen(true); }}
              onDelete={() => handleDelete(profile.id)}
              onSend={() => handleSend(profile.id)}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <ProfileModal
          initial={editTarget ?? undefined}
          brandId={brandId}
          onSave={handleSave}
          onClose={() => { setModalOpen(false); setEditTarget(null); }}
        />
      )}
    </div>
  );
}
