import { useState, useEffect, Fragment } from 'react';
import { Settings, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../../lib/apiClient';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FulfillmentOrder {
  id: string;
  orderId: string;
  brandId: string;
  orderTriggerAt: string | null;
  picklistGeneratedAt: string | null;
  picklistCompleteAt: string | null;
  moveToPacklistAt: string | null;
  awbGeneratedAt: string | null;
  connectedToCourierAt: string | null;
  currentStep: number;
  status: string;
  createdAt: string;
}

interface SLAConfig {
  step1Mins: number;
  step2Mins: number;
  step3Mins: number;
  step4Mins: number;
  step5Mins: number;
}

// ─── Step definitions ─────────────────────────────────────────────────────────

const STEPS = [
  { label: 'Order Trigger',        shortLabel: 'Triggered',    key: 'orderTriggerAt',       slaMinsKey: null,         prevKey: null },
  { label: 'Picklist Generated',   shortLabel: 'Picklist Gen', key: 'picklistGeneratedAt',  slaMinsKey: 'step1Mins',  prevKey: 'orderTriggerAt' },
  { label: 'Picklist Complete',    shortLabel: 'Picklist Done',key: 'picklistCompleteAt',   slaMinsKey: 'step2Mins',  prevKey: 'picklistGeneratedAt' },
  { label: 'Move to Packlist',     shortLabel: 'Packlist',     key: 'moveToPacklistAt',     slaMinsKey: 'step3Mins',  prevKey: 'picklistCompleteAt' },
  { label: 'AWB Generated',        shortLabel: 'AWB Gen',      key: 'awbGeneratedAt',       slaMinsKey: 'step4Mins',  prevKey: 'moveToPacklistAt' },
  { label: 'Connected to Courier', shortLabel: 'Courier',      key: 'connectedToCourierAt', slaMinsKey: 'step5Mins',  prevKey: 'awbGeneratedAt' },
] as const;

type StepKey = (typeof STEPS)[number]['key'];

// ─── SLA + colour helpers ─────────────────────────────────────────────────────

type StepState = 'complete' | 'breach' | 'active' | 'overdue' | 'pending';

function getStepState(order: FulfillmentOrder, stepIdx: number, sla: SLAConfig): StepState {
  const step = STEPS[stepIdx];
  const thisTs: string | null = order[step.key as keyof FulfillmentOrder];
  const prevTs: string | null = step.prevKey ? order[step.prevKey as keyof FulfillmentOrder] : null;
  const slaMins: number | null = step.slaMinsKey ? sla[step.slaMinsKey as keyof SLAConfig] : null;

  if (thisTs) {
    if (slaMins !== null && prevTs) {
      const diffMins = (new Date(thisTs).getTime() - new Date(prevTs).getTime()) / 60000;
      if (diffMins > slaMins) return 'breach';
    }
    return 'complete';
  }

  // Not yet completed — is it the active step?
  const isActive = stepIdx === 0 ? true : !!prevTs;
  if (!isActive) return 'pending';

  if (slaMins !== null && prevTs) {
    const elapsed = (Date.now() - new Date(prevTs).getTime()) / 60000;
    if (elapsed > slaMins) return 'overdue';
  }
  return 'active';
}

function dotClass(state: StepState): string {
  switch (state) {
    case 'complete': return 'bg-emerald-500 border-emerald-500';
    case 'breach':   return 'bg-amber-400 border-amber-400';
    case 'overdue':  return 'bg-red-500 border-red-500';
    case 'active':   return 'bg-white border-blue-400';
    case 'pending':  return 'bg-white border-gray-300';
  }
}

function lineClass(state: StepState): string {
  if (state === 'complete') return 'bg-emerald-400';
  if (state === 'breach')   return 'bg-amber-300';
  if (state === 'overdue')  return 'bg-red-300';
  return 'bg-gray-200';
}

// ─── Mini pipeline (table row) ────────────────────────────────────────────────

function MiniPipeline({ order, sla }: { order: FulfillmentOrder; sla: SLAConfig }) {
  return (
    <div className="flex items-center">
      {STEPS.map((step, i) => {
        const state = getStepState(order, i, sla);
        return (
          <div key={step.key} className="flex items-center">
            {i > 0 && <div className={`w-5 h-0.5 ${lineClass(getStepState(order, i - 1, sla))}`} />}
            <div
              className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${dotClass(state)}`}
              title={`${step.label}: ${state}`}
            />
          </div>
        );
      })}
    </div>
  );
}

// ─── Expanded step detail ─────────────────────────────────────────────────────

function StepDetail({ order, sla }: { order: FulfillmentOrder; sla: SLAConfig }) {
  return (
    <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
      <div className="flex items-start">
        {STEPS.map((step, i) => {
          const state = getStepState(order, i, sla);
          const ts: string | null = order[step.key as keyof FulfillmentOrder];
          const prevTs: string | null = step.prevKey ? order[step.prevKey as keyof FulfillmentOrder] : null;
          const slaMins: number | null = step.slaMinsKey ? sla[step.slaMinsKey as keyof SLAConfig] : null;

          let diffLabel: string | null = null;
          if (ts && prevTs && slaMins !== null) {
            const diff = Math.round((new Date(ts).getTime() - new Date(prevTs).getTime()) / 60000);
            diffLabel = `${diff}m / ${slaMins}m`;
          }

          const isLast = i === STEPS.length - 1;

          return (
            <div key={step.key} className="flex items-center flex-1 last:flex-none">
              {/* connector */}
              {i > 0 && (
                <div className={`flex-1 h-0.5 ${lineClass(getStepState(order, i - 1, sla))}`} />
              )}
              {/* node */}
              <div className="flex flex-col items-center" style={{ minWidth: 80 }}>
                <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold ${dotClass(state)} ${
                  state === 'complete' || state === 'breach' || state === 'overdue' ? 'text-white' :
                  state === 'active' ? 'text-blue-400' : 'text-gray-300'
                }`}>
                  {i + 1}
                </div>
                <p className="text-[10px] font-medium text-gray-700 mt-1 text-center leading-tight">{step.shortLabel}</p>
                <p className="text-[9px] text-gray-400 text-center mt-0.5">
                  {ts ? new Date(ts).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }) : '—'}
                </p>
                {diffLabel && (
                  <p className={`text-[9px] font-semibold mt-0.5 ${state === 'breach' ? 'text-amber-500' : 'text-emerald-600'}`}>
                    {diffLabel}
                  </p>
                )}
              </div>
              {isLast && <div className="w-4" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── SLA config panel ─────────────────────────────────────────────────────────

const SLA_TRANSITION_LABELS = [
  'Trigger → Picklist Gen',
  'Picklist Gen → Complete',
  'Complete → Packlist',
  'Packlist → AWB',
  'AWB → Courier',
];
const SLA_KEYS: (keyof SLAConfig)[] = ['step1Mins', 'step2Mins', 'step3Mins', 'step4Mins', 'step5Mins'];

function SLAPanel({ brandId, sla, onSaved }: { brandId: string; sla: SLAConfig; onSaved: (s: SLAConfig) => void }) {
  const [draft, setDraft] = useState<SLAConfig>({ ...sla });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = await api.post('/api/fulfillment/sla', { brandId, ...draft });
      onSaved(data.sla);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to save SLA');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
      <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">SLA Configuration (minutes per step transition)</h3>
      <div className="grid grid-cols-5 gap-3">
        {SLA_KEYS.map((key, i) => (
          <div key={key}>
            <label className="text-[10px] text-gray-500 block mb-1">{SLA_TRANSITION_LABELS[i]}</label>
            <input
              type="number"
              min={1}
              value={draft[key]}
              onChange={e => setDraft(d => ({ ...d, [key]: parseInt(e.target.value) || 1 }))}
              className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        ))}
      </div>
      <div className="flex justify-end mt-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-medium hover:bg-emerald-600 disabled:opacity-50 transition-colors"
        >
          {saved ? 'Saved!' : saving ? 'Saving...' : 'Save SLA'}
        </button>
      </div>
    </div>
  );
}

// ─── Status colours ───────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  completed:   'bg-emerald-100 text-emerald-700',
  in_progress: 'bg-blue-100 text-blue-700',
  pending:     'bg-gray-100 text-gray-500',
  stuck:       'bg-red-100 text-red-700',
};

// Compute elapsed minutes on the currently active step
function getActiveStepElapsedMins(order: FulfillmentOrder): number {
  if (order.connectedToCourierAt) return 0;
  // Find the last completed step's timestamp — elapsed = now - that timestamp
  const timestamps = [
    order.orderTriggerAt, order.picklistGeneratedAt, order.picklistCompleteAt,
    order.moveToPacklistAt, order.awbGeneratedAt,
  ];
  // Walk backwards to find the last set timestamp (= start of current active step)
  for (let i = timestamps.length - 1; i >= 0; i--) {
    const timestamp = timestamps[i];
    if (timestamp) {
      return (Date.now() - new Date(timestamp).getTime()) / 60000;
    }
  }
  return 0;
}

function isStuck(order: FulfillmentOrder): boolean {
  if (order.status === 'completed' || order.status === 'pending') return false;
  return getActiveStepElapsedMins(order) > 24 * 60; // >24h on current step = stuck
}

function dispatchClock(order: FulfillmentOrder): string {
  if (!order.orderTriggerAt) return '—';
  const endTime = order.connectedToCourierAt
    ? new Date(order.connectedToCourierAt).getTime()
    : Date.now();
  const mins = Math.floor((endTime - new Date(order.orderTriggerAt).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FulfillmentPage() {
  const [brandId, setBrandId]   = useState<string | null>(null);
  const [orders, setOrders]     = useState<FulfillmentOrder[]>([]);
  const [sla, setSla]           = useState<SLAConfig>({ step1Mins: 30, step2Mins: 60, step3Mins: 15, step4Mins: 30, step5Mins: 15 });
  const [loading, setLoading]   = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showSLA, setShowSLA]   = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    (async () => {
      try {
        const brandsData = await api.get('/api/brands');
        const id: string | undefined = brandsData?.brands?.[0]?.id;
        if (!id) return;
        setBrandId(id);

        const [ordersData, slaData] = await Promise.all([
          api.get(`/api/fulfillment?brandId=${id}`),
          api.get(`/api/fulfillment/sla?brandId=${id}`),
        ]);
        setOrders(ordersData?.orders ?? []);
        if (slaData?.sla) setSla(slaData.sla);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ─── Derived stats ──────────────────────────────────────────────────────────

  const isBreached = (order: FulfillmentOrder) => {
    return STEPS.some((step, i) => {
      const state = getStepState(order, i, sla);
      return state === 'breach' || state === 'overdue';
    });
  };

  const stats = {
    total:      orders.length,
    inProgress: orders.filter(o => o.status === 'in_progress').length,
    completed:  orders.filter(o => o.status === 'completed').length,
    breached:   orders.filter(isBreached).length,
    stuck:      orders.filter(isStuck).length,
  };

  const filtered = statusFilter === 'all'         ? orders
    : statusFilter === 'breached'                 ? orders.filter(isBreached)
    : statusFilter === 'stuck'                    ? orders.filter(isStuck)
    : orders.filter(o => o.status === statusFilter);

  const currentStepLabel = (order: FulfillmentOrder) => {
    const idx = order.currentStep;
    if (idx === 0) return 'Not started';
    if (idx >= STEPS.length) return STEPS[STEPS.length - 1].label;
    return STEPS[idx - 1].label;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Fulfillment Pipeline</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track order progress across all 6 fulfillment steps</p>
        </div>
        <button
          onClick={() => setShowSLA(s => !s)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
            showSLA
              ? 'bg-gray-100 border-gray-300 text-gray-700'
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          SLA Settings
        </button>
      </div>

      {/* SLA Panel */}
      {showSLA && brandId && (
        <SLAPanel brandId={brandId} sla={sla} onSaved={s => { setSla(s); setShowSLA(false); }} />
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {[
          { label: 'Total Orders',  value: stats.total,      color: 'text-gray-900' },
          { label: 'In Progress',   value: stats.inProgress, color: 'text-blue-600' },
          { label: 'Completed',     value: stats.completed,  color: 'text-emerald-600' },
          { label: 'SLA Breached',  value: stats.breached,   color: 'text-amber-600' },
          { label: 'Stuck >24h',    value: stats.stuck,      color: stats.stuck > 0 ? 'text-red-600' : 'text-gray-400' },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-500 mb-1">{kpi.label}</p>
            <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { key: 'all',         label: 'All' },
            { key: 'pending',     label: 'Pending' },
            { key: 'in_progress', label: 'In Progress' },
            { key: 'completed',   label: 'Completed' },
            { key: 'breached',    label: 'SLA Breached' },
            { key: 'stuck',       label: '🔴 Stuck >24h' },
          ].map(opt => (
            <button
              key={opt.key}
              onClick={() => setStatusFilter(opt.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                statusFilter === opt.key
                  ? 'bg-gray-900 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400">{filtered.length} order{filtered.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 whitespace-nowrap">Order ID</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 whitespace-nowrap">Pipeline</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 whitespace-nowrap">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 whitespace-nowrap">Dispatch Clock</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 whitespace-nowrap">Last Step</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 whitespace-nowrap">Triggered</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">
                    No fulfillment orders found. Upload a CSV or Excel file containing fulfillment pipeline data to get started.
                  </td>
                </tr>
              ) : (
                filtered.map(order => (
                  <Fragment key={order.id}>
                    <tr
                      className={`border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors ${isStuck(order) ? 'bg-red-50/40' : ''}`}
                      onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-gray-700 whitespace-nowrap">
                        {order.orderId}
                        {isStuck(order) && (
                          <span className="ml-1.5 px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-[9px] font-bold uppercase tracking-wide">STUCK</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <MiniPipeline order={order} sla={sla} />
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium capitalize whitespace-nowrap ${
                          isStuck(order) ? STATUS_COLORS.stuck : STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-500'
                        }`}>
                          {isStuck(order) ? 'Stuck >24h' : order.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {order.orderTriggerAt ? (
                          <span className={`font-mono font-semibold ${
                            !order.connectedToCourierAt && getActiveStepElapsedMins(order) > 24*60
                              ? 'text-red-600'
                              : !order.connectedToCourierAt && getActiveStepElapsedMins(order) > 12*60
                              ? 'text-amber-600'
                              : 'text-gray-600'
                          }`}>
                            {dispatchClock(order)}
                            {order.connectedToCourierAt && <span className="ml-1 text-emerald-500 text-[9px]">✓ done</span>}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{currentStepLabel(order)}</td>
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {order.orderTriggerAt
                          ? new Date(order.orderTriggerAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {expandedId === order.id
                          ? <ChevronUp className="w-4 h-4 text-gray-400 inline" />
                          : <ChevronDown className="w-4 h-4 text-gray-400 inline" />}
                      </td>
                    </tr>
                    {expandedId === order.id && (
                      <tr>
                        <td colSpan={7} className="p-0">
                          <StepDetail order={order} sla={sla} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 px-1 flex-wrap">
        <p className="text-xs text-gray-400">Legend:</p>
        {[
          { cls: 'bg-emerald-500',           label: 'Complete (on time)' },
          { cls: 'bg-amber-400',             label: 'Complete (SLA exceeded)' },
          { cls: 'bg-red-500',               label: 'Overdue (active step)' },
          { cls: 'bg-white border-2 border-blue-400',  label: 'Active (in progress)' },
          { cls: 'bg-white border-2 border-gray-300',  label: 'Not yet reached' },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-full flex-shrink-0 ${item.cls}`} />
            <span className="text-xs text-gray-500">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

