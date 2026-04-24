import { useState, useEffect, useCallback } from 'react';
import { Plus, Send, Trash2, Edit2, X, Check, ChevronDown, ChevronUp, Mail, Users, Eye, Copy, Globe } from 'lucide-react';
import { api } from '../../lib/apiClient';
import { useBrand } from '../../context/BrandContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Recipient { email: string; name: string }

interface DeliveryProfile {
  id: string;
  brandId: string;
  name: string;
  description: string;
  profileType: 'ops' | 'sales' | 'custom';
  metrics: string[];
  recipients: Recipient[];
  emailSubject: string;
  emailTemplate: string;
  schedule: 'manual' | 'daily' | 'weekly' | 'custom';
  scheduleCron?: string | null;
  scheduleHour?: number;
  scheduleDow?: number;
  dateRange?: 'today' | 'yesterday' | 'last7' | 'last30' | 'mtd';
  isShared?: boolean;
  mailProvider?: 'auto' | 'outlook' | 'gmail';
  createdByEmail?: string | null;
  lastSent: string | null;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
  lastRunStatus?: string | null;
  createdAt: string;
}

// ─── Available metrics (must match backend METRIC_DEFINITIONS) ─────────────

interface MetricDef { key: string; label: string; description: string; group: string }

// Local fallback — used until /api/delivery-profiles/metrics responds.
const FALLBACK_METRICS: MetricDef[] = [
  { key: 'total_revenue',      group: 'Sales',      label: 'Total Revenue',       description: 'Sum of all order amounts' },
  { key: 'net_revenue',        group: 'Sales',      label: 'Net Revenue',          description: 'Revenue minus returns' },
  { key: 'total_orders',       group: 'Sales',      label: 'Total Orders',         description: 'Count of orders in period' },
  { key: 'avg_order_value',    group: 'Sales',      label: 'Avg Order Value',      description: 'Average amount per order' },
  { key: 'delivered_orders',   group: 'Sales',      label: 'Delivered Orders',     description: 'Orders marked delivered' },
  { key: 'pending_orders',     group: 'Sales',      label: 'Pending Orders',       description: 'Orders not yet fulfilled' },
  { key: 'cancelled_orders',   group: 'Sales',      label: 'Cancelled Orders',     description: 'Orders cancelled' },
  { key: 'total_customers',    group: 'Customers',  label: 'Total Customers',      description: 'Unique customer count' },
  { key: 'new_customers',      group: 'Customers',  label: 'New Customers',        description: 'First-time buyers in period' },
  { key: 'repeat_customers',   group: 'Customers',  label: 'Repeat Customers',     description: 'Customers with >1 order' },
  { key: 'total_skus',         group: 'Inventory',  label: 'Total SKUs',           description: 'Inventory item count' },
  { key: 'low_stock_count',    group: 'Inventory',  label: 'Low Stock SKUs',       description: 'Items at/below reorder point' },
  { key: 'out_of_stock_count', group: 'Inventory',  label: 'Out of Stock SKUs',    description: 'Items with zero stock' },
  { key: 'total_stock_value',  group: 'Inventory',  label: 'Total Stock Value',    description: 'Inventory value' },
  { key: 'total_returns',      group: 'Returns',    label: 'Total Returns',        description: 'Return request count' },
  { key: 'return_value',       group: 'Returns',    label: 'Return Value',         description: 'Total refunded' },
  { key: 'return_rate',        group: 'Returns',    label: 'Return Rate (%)',      description: 'Returns / orders' },
  { key: 'sla_breaches',       group: 'Operations', label: 'SLA Breaches',         description: 'Fulfillment SLA violations' },
  { key: 'fulfillment_rate',   group: 'Operations', label: 'Fulfillment Rate (%)', description: 'Completed / total orders' },
];

const TEMPLATE_VARS = [
  '{{total_revenue}}', '{{net_revenue}}', '{{total_orders}}', '{{avg_order_value}}',
  '{{delivered_orders}}', '{{pending_orders}}', '{{cancelled_orders}}',
  '{{total_customers}}', '{{new_customers}}', '{{repeat_customers}}',
  '{{low_stock_count}}', '{{out_of_stock_count}}', '{{total_stock_value}}',
  '{{total_returns}}', '{{return_value}}', '{{return_rate}}',
  '{{sla_breaches}}', '{{fulfillment_rate}}',
  '{{brand_name}}', '{{date_range_label}}', '{{report_date}}', '{{report_timestamp}}',
];

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

function ProfileModal({ initial, brandId, onSave, onClose, catalog, canShare }: ModalProps & { catalog: MetricDef[]; canShare: boolean }) {
  const isEdit = !!initial?.id;

  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [profileType, setProfileType] = useState<'ops' | 'sales' | 'custom'>(initial?.profileType ?? 'custom');
  const [metrics, setMetrics] = useState<string[]>(initial?.metrics ?? []);
  const [recipients, setRecipients] = useState<Recipient[]>(initial?.recipients ?? []);
  const [emailSubject, setEmailSubject] = useState(initial?.emailSubject ?? '{{brand_name}} Report — {{report_date}}');
  const [emailTemplate, setEmailTemplate] = useState(initial?.emailTemplate ?? '');
  const [schedule, setSchedule] = useState<'manual' | 'daily' | 'weekly' | 'custom'>(initial?.schedule ?? 'manual');
  const [scheduleCron, setScheduleCron] = useState(initial?.scheduleCron ?? '0 7 * * *');
  const [scheduleHour, setScheduleHour] = useState<number>(initial?.scheduleHour ?? 7);
  const [scheduleDow, setScheduleDow] = useState<number>(initial?.scheduleDow ?? 1);
  const [dateRange, setDateRange] = useState<'today' | 'yesterday' | 'last7' | 'last30' | 'mtd'>(initial?.dateRange ?? 'today');
  const [isShared, setIsShared] = useState<boolean>(!!initial?.isShared);
  const [mailProvider, setMailProvider] = useState<'auto' | 'outlook' | 'gmail'>(initial?.mailProvider ?? 'auto');

  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [showVars, setShowVars] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Group metrics for the picker
  const grouped = catalog.reduce<Record<string, MetricDef[]>>((acc, m) => {
    (acc[m.group] = acc[m.group] || []).push(m); return acc;
  }, {});

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
      const payload = {
        brandId, name, description, profileType, metrics, recipients,
        emailSubject, emailTemplate,
        schedule, scheduleCron, scheduleHour, scheduleDow,
        dateRange, isShared, mailProvider,
      };
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

          {/* Metrics — grouped by module */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">Metrics to Include ({metrics.length} selected)</label>
            <div className="space-y-3">
              {Object.entries(grouped).map(([group, list]) => (
                <div key={group}>
                  <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-400 mb-1">{group}</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {list.map(m => (
                      <button key={m.key} onClick={() => toggleMetric(m.key)} title={m.description}
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
              ))}
            </div>
          </div>

          {/* Date range */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Reporting Period</label>
            <div className="grid grid-cols-5 gap-2">
              {[
                { k: 'today',     l: 'Today'       },
                { k: 'yesterday', l: 'Yesterday'   },
                { k: 'last7',     l: 'Last 7 days' },
                { k: 'last30',    l: 'Last 30'     },
                { k: 'mtd',       l: 'Month-to-date'},
              ].map(o => (
                <button key={o.k} onClick={() => setDateRange(o.k as any)}
                  className={`py-2 rounded-lg border text-xs font-medium transition-colors ${
                    dateRange === o.k
                      ? 'bg-[#10b981]/10 border-[#10b981] text-[#10b981]'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                  {o.l}
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
              {(['manual', 'daily', 'weekly', 'custom'] as const).map(s => (
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

            {(schedule === 'daily' || schedule === 'weekly') && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                {schedule === 'weekly' && (
                  <div>
                    <label className="text-[10px] text-gray-500">Day of week</label>
                    <select value={scheduleDow} onChange={e => setScheduleDow(Number(e.target.value))}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs">
                      {DAYS_OF_WEEK.map((d, i) => <option key={d} value={i}>{d}</option>)}
                    </select>
                  </div>
                )}
                <div className={schedule === 'weekly' ? '' : 'col-span-2'}>
                  <label className="text-[10px] text-gray-500">Hour (24h, server local)</label>
                  <input type="number" min={0} max={23} value={scheduleHour}
                    onChange={e => setScheduleHour(Math.max(0, Math.min(23, Number(e.target.value) || 0)))}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
                </div>
              </div>
            )}

            {schedule === 'custom' && (
              <div className="mt-2">
                <label className="text-[10px] text-gray-500">Cron expression (min hour dom mon dow)</label>
                <input value={scheduleCron} onChange={e => setScheduleCron(e.target.value)}
                  placeholder="0 7 * * 1"
                  className="w-full font-mono border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
                <p className="text-[10px] text-gray-400 mt-1">Examples: <code>0 9 * * *</code> daily 9am · <code>*/30 * * * *</code> every 30min · <code>0 8 * * 1</code> Mon 8am</p>
              </div>
            )}
          </div>

          {/* Mail provider */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Mail Provider</label>
            <div className="flex gap-2">
              {(['auto', 'outlook', 'gmail'] as const).map(p => (
                <button key={p} onClick={() => setMailProvider(p)}
                  className={`flex-1 py-2 rounded-lg border text-xs font-medium capitalize transition-colors ${
                    mailProvider === p
                      ? 'bg-[#10b981]/10 border-[#10b981] text-[#10b981]'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                  {p === 'auto' ? 'Auto (prefer Outlook)' : p}
                </button>
              ))}
            </div>
          </div>

          {/* Shared template toggle (admins only) */}
          {canShare && (
            <div className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg bg-gray-50">
              <button
                onClick={() => setIsShared(v => !v)}
                className={`relative flex-shrink-0 w-10 h-5 rounded-full transition-colors mt-0.5 ${isShared ? 'bg-[#10b981]' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isShared ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
              <div>
                <p className="text-xs font-semibold text-gray-900 flex items-center gap-1.5"><Globe className="w-3 h-3" /> Share with all admins</p>
                <p className="text-[10px] text-gray-500 leading-relaxed">When enabled, other admins can view and clone this template into their own brands.</p>
              </div>
            </div>
          )}
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
  catalog: MetricDef[];
  readOnly?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSend: () => void;
  onPreview: () => void;
  onClone?: () => void;
  sending: boolean;
}

function ProfileCard({ profile, catalog, readOnly, onEdit, onDelete, onSend, onPreview, onClone, sending }: CardProps) {
  const scheduleLabel = (() => {
    if (profile.schedule === 'manual') return 'Manual';
    if (profile.schedule === 'daily') return `Daily · ${String(profile.scheduleHour ?? 7).padStart(2, '0')}:00`;
    if (profile.schedule === 'weekly') return `Weekly · ${DAYS_OF_WEEK[profile.scheduleDow ?? 1]} ${String(profile.scheduleHour ?? 7).padStart(2, '0')}:00`;
    if (profile.schedule === 'custom') return `Custom · ${profile.scheduleCron || '—'}`;
    return profile.schedule;
  })();

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 hover:border-[#10b981]/30 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-900 truncate">{profile.name}</h3>
            <TypeBadge type={profile.profileType} />
            {profile.isShared && (
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
                <Globe className="w-2.5 h-2.5" /> Shared
              </span>
            )}
            {profile.lastRunStatus === 'failed' && (
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-700">Last run failed</span>
            )}
          </div>
          {profile.description && (
            <p className="text-xs text-gray-500 truncate">{profile.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={onPreview} title="Preview"
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <Eye className="w-3.5 h-3.5" />
          </button>
          {onClone && (
            <button onClick={onClone} title="Clone to current brand"
              className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <Copy className="w-3.5 h-3.5" />
            </button>
          )}
          {!readOnly && (
            <>
              <button onClick={onEdit} title="Edit"
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={onDelete} title="Delete"
                className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 mb-3">
        {profile.metrics.slice(0, 4).map(k => {
          const m = catalog.find(a => a.key === k);
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

      <div className="flex items-center justify-between pt-3 border-t border-gray-100 gap-2">
        <div className="text-xs text-gray-400 min-w-0">
          <div className="truncate">
            {profile.recipients.length} recipient{profile.recipients.length !== 1 ? 's' : ''} · {scheduleLabel}
          </div>
          <div className="truncate">
            {profile.nextRunAt ? `Next: ${new Date(profile.nextRunAt).toLocaleString('en-IN')}` : profile.lastSent ? `Last sent ${new Date(profile.lastSent).toLocaleString('en-IN')}` : 'Never sent'}
          </div>
        </div>
        {!readOnly && (
          <button onClick={onSend} disabled={sending || profile.recipients.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#10b981] text-white rounded-lg text-xs font-medium hover:bg-[#10b981]/90 disabled:opacity-50 flex-shrink-0">
            {sending ? (
              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send className="w-3 h-3" />
            )}
            Send Now
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DeliveryProfiles() {
  const { brandId } = useBrand();
  const [profiles, setProfiles] = useState<DeliveryProfile[]>([]);
  const [sharedProfiles, setSharedProfiles] = useState<DeliveryProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DeliveryProfile | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [catalog, setCatalog] = useState<MetricDef[]>(FALLBACK_METRICS);
  const [canShare, setCanShare] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [tab, setTab] = useState<'brand' | 'shared'>('brand');

  // Pull metric catalog once
  useEffect(() => {
    api.get('/api/delivery-profiles/metrics')
      .then((d: any) => { if (Array.isArray(d?.metrics) && d.metrics.length) setCatalog(d.metrics); })
      .catch(() => {});
    // Admin capability probe — succeeds only for admin emails
    api.get('/api/delivery-profiles/shared')
      .then(() => setCanShare(true))
      .catch(() => setCanShare(false));
  }, []);

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
      setSharedProfiles(data?.sharedProfiles ?? []);
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
      const via = result.provider ? ` via ${result.provider}` : '';
      showToast(`Sent to ${result.sent} recipient(s)${result.failed > 0 ? `, ${result.failed} failed` : ''}${via}`);
    } catch (err: any) {
      showToast(err.message || 'Send failed', false);
    } finally {
      setSendingId(null);
    }
  };

  const handlePreview = async (id: string) => {
    try {
      const data = await api.get(`/api/delivery-profiles/${id}/preview`);
      setPreviewHtml(data?.html ?? '<p>No preview available</p>');
    } catch (err: any) {
      showToast(err.message || 'Preview failed', false);
    }
  };

  const handleClone = async (id: string) => {
    try {
      const result = await api.post(`/api/delivery-profiles/${id}/clone`, { brandId });
      setProfiles(prev => [result.profile, ...prev]);
      setTab('brand');
      showToast('Template cloned to this brand');
    } catch (err: any) {
      showToast(err.message || 'Clone failed', false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Delivery Profiles</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Group metrics into email reports. Schedule daily / weekly / custom and email via Outlook or Gmail.
          </p>
        </div>
        <button onClick={() => { setEditTarget(null); setModalOpen(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-[#10b981] text-white rounded-xl text-sm font-medium hover:bg-[#10b981]/90">
          <Plus className="w-4 h-4" /> New Profile
        </button>
      </div>

      {/* Tab switch — Brand vs Shared admin templates */}
      {canShare && (
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-5 w-fit">
          {([
            { k: 'brand',  l: `This brand (${profiles.length})` },
            { k: 'shared', l: `Shared admin templates (${sharedProfiles.length})` },
          ] as const).map(t => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={`px-4 py-1.5 rounded-md text-xs font-medium ${tab === t.k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {t.l}
            </button>
          ))}
        </div>
      )}

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
      ) : tab === 'shared' ? (
        sharedProfiles.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            No shared admin templates yet. Create one and toggle “Share with all admins”.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sharedProfiles.map(profile => (
              <ProfileCard
                key={profile.id}
                profile={profile}
                catalog={catalog}
                readOnly
                sending={false}
                onEdit={() => { setEditTarget(profile); setModalOpen(true); }}
                onDelete={() => {}}
                onSend={() => {}}
                onPreview={() => handlePreview(profile.id)}
                onClone={() => handleClone(profile.id)}
              />
            ))}
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {profiles.map(profile => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              catalog={catalog}
              sending={sendingId === profile.id}
              onEdit={() => { setEditTarget(profile); setModalOpen(true); }}
              onDelete={() => handleDelete(profile.id)}
              onSend={() => handleSend(profile.id)}
              onPreview={() => handlePreview(profile.id)}
            />
          ))}
        </div>
      )}

      {/* Preview Modal */}
      {previewHtml !== null && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setPreviewHtml(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Report preview</h2>
              <button onClick={() => setPreviewHtml(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <iframe title="report-preview" srcDoc={previewHtml} className="flex-1 w-full rounded-b-2xl bg-white" />
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {modalOpen && (
        <ProfileModal
          initial={editTarget ?? undefined}
          brandId={brandId}
          catalog={catalog}
          canShare={canShare}
          onSave={handleSave}
          onClose={() => { setModalOpen(false); setEditTarget(null); }}
        />
      )}
    </div>
  );
}
