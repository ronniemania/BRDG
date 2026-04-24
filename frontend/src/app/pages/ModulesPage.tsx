import { useState, useEffect } from 'react';
import {
  Package, ShoppingCart, Truck, Users, RotateCcw,
  BarChart2, TrendingUp, FileText, Lightbulb,
  Database, Share2, MessageSquare, Bell, BarChart,
  Layers, CheckCircle, XCircle, AlertTriangle, Save,
} from 'lucide-react';
import { useBrand, ALL_MODULE_IDS, type ModuleId } from '../context/BrandContext';

// ─── Module catalogue ─────────────────────────────────────────────────────────

interface ModuleDef {
  id: ModuleId;
  label: string;
  description: string;
  icon: any;
  category: string;
}

const MODULE_DEFS: ModuleDef[] = [
  // Supply Chain
  { id: 'orders',      label: 'Orders',      description: 'Track and manage customer orders end-to-end',           icon: ShoppingCart, category: 'Supply Chain' },
  { id: 'inventory',   label: 'Inventory',   description: 'SKU-level stock, bin types and reorder alerts',         icon: Package,      category: 'Supply Chain' },
  { id: 'fulfillment', label: 'Fulfillment', description: 'Pipeline tracking from picklist to courier handoff',    icon: Truck,        category: 'Supply Chain' },
  // Operations
  { id: 'customers',   label: 'Customers',   description: 'Customer profiles, lifetime spend and order history',   icon: Users,        category: 'Operations' },
  { id: 'returns',     label: 'Returns',     description: 'Returns processing, reasons and resolution tracking',   icon: RotateCcw,    category: 'Operations' },
  // Marketing
  { id: 'analytics',     label: 'Analytics',     description: 'Sales trends, channel performance and cohorts',       icon: BarChart2,  category: 'Marketing' },
  { id: 'metrics',       label: 'Metrics',       description: 'Customisable KPI cards across all business functions', icon: TrendingUp, category: 'Marketing' },
  { id: 'ecom-metrics',  label: 'Ecom Metrics',  description: 'Shopify and e-commerce platform deep-dive metrics',   icon: BarChart,   category: 'Marketing' },
  // Intelligence
  { id: 'reports',   label: 'Reports',   description: 'Automated and scheduled report generation',              icon: FileText,  category: 'Intelligence' },
  { id: 'insights',  label: 'Insights',  description: 'AI-driven business insights and action recommendations',  icon: Lightbulb, category: 'Intelligence' },
  // Connect
  { id: 'data-sources', label: 'Data Sources', description: 'Connect Shopify, Google Drive, CSV/Excel uploads', icon: Database,      category: 'Connect' },
  { id: 'team-data',    label: 'Team Data',    description: 'Shared data uploads submitted by team members',    icon: Share2,        category: 'Connect' },
  { id: 'touchpoints',  label: 'Touchpoints',  description: 'Freshdesk tickets and customer communication logs', icon: MessageSquare, category: 'Connect' },
  { id: 'alerts',       label: 'Alerts',       description: 'Automated alerts for stock, orders and SLA breach', icon: Bell,          category: 'Connect' },
];

const CATEGORY_ORDER = ['Supply Chain', 'Operations', 'Marketing', 'Intelligence', 'Connect'];

const CATEGORY_COLORS: Record<string, string> = {
  'Supply Chain':  'bg-blue-50   border-blue-200',
  'Operations':    'bg-orange-50  border-orange-200',
  'Marketing':     'bg-purple-50  border-purple-200',
  'Intelligence':  'bg-amber-50   border-amber-200',
  'Connect':       'bg-teal-50    border-teal-200',
};

const CATEGORY_BADGE: Record<string, string> = {
  'Supply Chain':  'bg-blue-100   text-blue-700',
  'Operations':    'bg-orange-100  text-orange-700',
  'Marketing':     'bg-purple-100  text-purple-700',
  'Intelligence':  'bg-amber-100   text-amber-700',
  'Connect':       'bg-teal-100    text-teal-700',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ModulesPage() {
  const { features, updateFeatures, loading } = useBrand();

  const [localEnabled, setLocalEnabled] = useState<Set<string>>(new Set(features));
  const [saving, setSaving]   = useState(false);
  const [saved,  setSaved]    = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Sync once context has loaded
  useEffect(() => {
    setLocalEnabled(new Set(features));
    setIsDirty(false);
  }, [features.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: ModuleId) => {
    setLocalEnabled(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setIsDirty(true);
    setSaved(false);
  };

  const enableAll = () => {
    setLocalEnabled(new Set(ALL_MODULE_IDS));
    setIsDirty(true);
    setSaved(false);
  };

  const discard = () => {
    setLocalEnabled(new Set(features));
    setIsDirty(false);
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateFeatures([...localEnabled]);
      setIsDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const disabledCount = ALL_MODULE_IDS.length - localEnabled.size;

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#10b981]" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Layers className="w-5 h-5 text-[#10b981]" />
            <h1 className="text-xl font-bold text-gray-900">Modules</h1>
          </div>
          <p className="text-sm text-gray-500 max-w-xl">
            Enable or disable individual modules for this brand. Disabled modules are hidden from the
            sidebar for all roles, and their routes are blocked.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={enableAll}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Enable all
          </button>

          {isDirty && (
            <button
              onClick={discard}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Discard
            </button>
          )}

          <button
            onClick={save}
            disabled={!isDirty || saving}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              saving
                ? 'bg-[#10b981]/80 text-white cursor-not-allowed'
                : isDirty
                ? 'bg-[#10b981] text-white hover:bg-[#10b981]/90'
                : saved
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {saving ? (
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
            ) : saved ? (
              <CheckCircle className="w-3.5 h-3.5" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save changes'}
          </button>
        </div>
      </div>

      {/* ── Disabled warning ── */}
      {disabledCount > 0 && (
        <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-700">
            <span className="font-semibold">
              {disabledCount} module{disabledCount > 1 ? 's' : ''} currently disabled.
            </span>{' '}
            All brand members — regardless of role — will not see or be able to access these modules.
          </p>
        </div>
      )}

      {/* ── Module grid by category ── */}
      {CATEGORY_ORDER.map(category => {
        const mods = MODULE_DEFS.filter(m => m.category === category);
        const enabledInCat = mods.filter(m => localEnabled.has(m.id)).length;

        return (
          <div key={category}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CATEGORY_BADGE[category]}`}>
                {category}
              </span>
              <span className="text-xs text-gray-400">
                {enabledInCat}/{mods.length} enabled
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {mods.map(mod => {
                const isEnabled = localEnabled.has(mod.id);
                return (
                  <button
                    key={mod.id}
                    onClick={() => toggle(mod.id)}
                    className={`text-left p-4 rounded-xl border-2 transition-all duration-150 ${
                      isEnabled
                        ? `${CATEGORY_COLORS[category]} shadow-sm`
                        : 'bg-gray-50 border-gray-200 opacity-55'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className={`p-1.5 rounded-lg ${isEnabled ? 'bg-white/70' : 'bg-gray-100'}`}>
                        <mod.icon className={`w-4 h-4 ${isEnabled ? 'text-gray-700' : 'text-gray-400'}`} />
                      </div>
                      <span className={`flex items-center gap-1 text-[11px] font-semibold ${isEnabled ? 'text-emerald-600' : 'text-gray-400'}`}>
                        {isEnabled
                          ? <><CheckCircle className="w-3.5 h-3.5" /> On</>
                          : <><XCircle   className="w-3.5 h-3.5" /> Off</>
                        }
                      </span>
                    </div>
                    <p className={`text-sm font-semibold mb-0.5 ${isEnabled ? 'text-gray-900' : 'text-gray-500'}`}>
                      {mod.label}
                    </p>
                    <p className={`text-xs leading-relaxed ${isEnabled ? 'text-gray-500' : 'text-gray-400'}`}>
                      {mod.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
