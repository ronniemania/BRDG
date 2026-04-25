import { Component, useState, useEffect, useCallback, useRef, type ErrorInfo, type ReactNode } from 'react';
import { Outlet, NavLink, useNavigate, useSearchParams } from 'react-router';
import {
  LayoutDashboard, BarChart2, ShoppingCart, Package, Users, RotateCcw,
  TrendingUp, FileText, Lightbulb, Database, MessageSquare, Bell,
  Settings, Shield, Store, ChevronLeft, ChevronRight, LogOut, Menu, X,
  Crown, Briefcase, Truck, Share2, Layers, Search, RefreshCw, Layers3,
  ChevronDown, Mail, ChevronUp, Megaphone, Brain, Wand2, Bot,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getToken, useAuth } from './context/AuthContext';
import { useBrand } from './context/BrandContext';
import { useRBAC } from './context/RBACContext';
import { useSyncContext } from './context/SyncContext';
import { useAdsStore } from './store/adsStore';
import { useStrategyStore } from './store/strategyStore';

// ─── Design tokens ────────────────────────────────────────────────────────────
// Google Workspace palette
// bg-[#f8f9fa]   surface gray
// text-[#202124] primary text
// text-[#5f6368] secondary text
// border-[#e8eaed] dividers
// bg-[#f1f3f4]   hover state
// #10b981        brand accent (kept)

// ─── Nav definitions per department ──────────────────────────────────────────

interface NavItem { to: string; label: string; icon: LucideIcon; end?: boolean; feature?: string }
interface NavGroup { label: string; items: NavItem[] }

const NAV_BY_ROLE: Record<string, NavGroup[]> = {
  boss: [
    {
      label: 'Overview',
      items: [
        { to: '/',            label: 'Dashboard',   icon: LayoutDashboard, end: true },
        { to: '/analytics',   label: 'Analytics',   icon: BarChart2,  feature: 'analytics'   },
        { to: '/metrics',     label: 'Metrics',     icon: TrendingUp, feature: 'metrics'     },
      ],
    },
    {
      label: 'Operations',
      items: [
        { to: '/orders',      label: 'Orders',      icon: ShoppingCart, feature: 'orders'      },
        { to: '/inventory',   label: 'Inventory',   icon: Package,      feature: 'inventory'   },
        { to: '/fulfillment', label: 'Fulfillment', icon: Truck,        feature: 'fulfillment' },
        { to: '/customers',   label: 'Customers',   icon: Users,        feature: 'customers'   },
        { to: '/returns',     label: 'Returns',     icon: RotateCcw,    feature: 'returns'     },
      ],
    },
    {
      label: 'Intelligence',
      items: [
        { to: '/reports',           label: 'Reports',    icon: FileText,  feature: 'reports'  },
        { to: '/insights',          label: 'Insights',   icon: Lightbulb, feature: 'insights' },
        { to: '/delivery-profiles', label: 'Deliveries', icon: Mail                           },
      ],
    },
    {
      label: 'Connect',
      items: [
        { to: '/data-sources', label: 'Data Sources', icon: Database,      feature: 'data-sources' },
        { to: '/team-data',    label: 'Team Data',    icon: Share2,        feature: 'team-data'    },
        { to: '/touchpoints',  label: 'Touchpoints',  icon: MessageSquare, feature: 'touchpoints'  },
        { to: '/alerts',       label: 'Alerts',       icon: Bell,          feature: 'alerts'       },
      ],
    },
    {
      label: 'Ads & AI',
      items: [
        { to: '/ads',        label: 'Ads Manager', icon: Megaphone },
        { to: '/strategy',   label: 'Strategy',    icon: Brain     },
        { to: '/ads/create', label: 'Ad Creator',  icon: Wand2     },
        { to: '/clawbot',    label: 'Clawbot',     icon: Bot       },
        { to: '/agents',     label: 'Agents',      icon: Layers    },
      ],
    },
    {
      label: 'Management',
      items: [
        { to: '/brands',   label: 'Brands',   icon: Store    },
        { to: '/modules',  label: 'Modules',  icon: Layers   },
        { to: '/rbac',     label: 'RBAC',     icon: Layers3  },
        { to: '/settings', label: 'Settings', icon: Settings },
        { to: '/admin',    label: 'Admin',    icon: Shield   },
      ],
    },
  ],
  marketing: [
    {
      label: 'Overview',
      items: [
        { to: '/',          label: 'Dashboard', icon: LayoutDashboard, end: true },
        { to: '/analytics', label: 'Analytics', icon: BarChart2,  feature: 'analytics' },
        { to: '/metrics',   label: 'Metrics',   icon: TrendingUp, feature: 'metrics'   },
      ],
    },
    {
      label: 'Intelligence',
      items: [
        { to: '/reports',  label: 'Reports',  icon: FileText,  feature: 'reports'  },
        { to: '/insights', label: 'Insights', icon: Lightbulb, feature: 'insights' },
      ],
    },
  ],
  supply_chain: [
    {
      label: 'Overview',
      items: [
        { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      ],
    },
    {
      label: 'Operations',
      items: [
        { to: '/orders',      label: 'Orders',      icon: ShoppingCart, feature: 'orders'      },
        { to: '/inventory',   label: 'Inventory',   icon: Package,      feature: 'inventory'   },
        { to: '/fulfillment', label: 'Fulfillment', icon: Truck,        feature: 'fulfillment' },
      ],
    },
    {
      label: 'Connect',
      items: [
        { to: '/data-sources', label: 'Data Sources', icon: Database, feature: 'data-sources' },
        { to: '/team-data',    label: 'Team Data',    icon: Share2,   feature: 'team-data'    },
        { to: '/alerts',       label: 'Alerts',       icon: Bell,     feature: 'alerts'       },
      ],
    },
  ],
  ops: [
    {
      label: 'Overview',
      items: [
        { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      ],
    },
    {
      label: 'Operations',
      items: [
        { to: '/orders',    label: 'Orders',    icon: ShoppingCart, feature: 'orders'    },
        { to: '/customers', label: 'Customers', icon: Users,        feature: 'customers' },
        { to: '/returns',   label: 'Returns',   icon: RotateCcw,    feature: 'returns'   },
      ],
    },
    {
      label: 'Connect',
      items: [
        { to: '/touchpoints', label: 'Touchpoints', icon: MessageSquare, feature: 'touchpoints' },
        { to: '/alerts',      label: 'Alerts',      icon: Bell,          feature: 'alerts'      },
      ],
    },
  ],
  support: [
    {
      label: 'Overview',
      items: [
        { to: '/',            label: 'Dashboard',   icon: LayoutDashboard, end: true        },
        { to: '/touchpoints', label: 'Touchpoints', icon: MessageSquare,   feature: 'touchpoints' },
        { to: '/alerts',      label: 'Alerts',      icon: Bell,            feature: 'alerts'      },
      ],
    },
  ],
};

const MEMBER_NAV = NAV_BY_ROLE.boss;

const DEPT_OPTIONS = [
  { value: 'all',          label: 'All',          icon: Crown        },
  { value: 'marketing',    label: 'Marketing',    icon: BarChart2    },
  { value: 'supply_chain', label: 'Supply Chain', icon: Truck        },
  { value: 'ops',          label: 'Ops',          icon: Briefcase    },
  { value: 'support',      label: 'Support',      icon: MessageSquare },
];

// ─── Sidebar ─────────────────────────────────────────────────────────────────

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  unreadAlerts: number;
  pendingTeamData: number;
}

function Sidebar({ collapsed, onToggle, unreadAlerts, pendingTeamData }: SidebarProps) {
  const { user, logout } = useAuth();
  const { hasFeature } = useBrand();
  const { canAccess } = useRBAC();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const role = user?.role ?? 'member';
  const isBoss = role === 'boss';
  const deptView = searchParams.get('view') ?? 'all';

  const setDeptView = useCallback((view: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (view === 'all') next.delete('view'); else next.set('view', view);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  let rawGroups = NAV_BY_ROLE[role] ?? MEMBER_NAV;
  if (isBoss && deptView !== 'all') rawGroups = NAV_BY_ROLE[deptView] ?? MEMBER_NAV;

  const navGroups = rawGroups
    .map(g => ({
      ...g,
      items: g.items.filter(item => {
        if (item.feature && !hasFeature(item.feature)) return false;
        if (item.feature && !canAccess(item.feature)) return false;
        return true;
      }),
    }))
    .filter(g => g.items.length > 0);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  // Close user menu on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const initials = `${user?.firstName?.charAt(0) ?? ''}${user?.lastName?.charAt(0) ?? ''}` || 'U';

  return (
    <aside
      className="flex flex-col h-full bg-white border-r border-[#e8eaed] transition-all duration-300 ease-in-out"
      style={{ width: collapsed ? 72 : 260 }}
    >
      {/* Logo bar */}
      <div
        className="flex items-center h-16 border-b border-[#e8eaed] flex-shrink-0 px-4"
        style={{ justifyContent: collapsed ? 'center' : 'space-between' }}
      >
        {collapsed ? (
          <button
            onClick={onToggle}
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-[#f1f3f4] transition-colors"
            title="Expand sidebar"
          >
            <div className="w-7 h-7 rounded-lg bg-[#10b981] flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-black">B</span>
            </div>
          </button>
        ) : (
          <>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#10b981] flex items-center justify-center flex-shrink-0">
                <span className="text-white text-sm font-black">B</span>
              </div>
              <div>
                <p className="text-sm font-bold text-[#202124] leading-tight">BRDG Alpha</p>
                <p className="text-[10px] text-[#5f6368] leading-tight">Operations Hub</p>
              </div>
            </div>
            <button
              onClick={onToggle}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#f1f3f4] text-[#5f6368] transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Boss dept switcher */}
      {isBoss && !collapsed && (
        <div className="px-3 pt-3 pb-2 border-b border-[#e8eaed] flex-shrink-0">
          <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-widest px-1 mb-2 flex items-center gap-1">
            <Crown className="w-3 h-3" /> View as
          </p>
          <div className="flex flex-wrap gap-1">
            {DEPT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setDeptView(opt.value)}
                className={`text-[10px] px-2.5 py-1 rounded-full font-medium transition-colors ${
                  deptView === opt.value
                    ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-200'
                    : 'bg-[#f8f9fa] text-[#5f6368] hover:bg-[#f1f3f4]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2" style={{ paddingLeft: collapsed ? 8 : 12, paddingRight: collapsed ? 8 : 12 }}>
        {navGroups.map((group, gi) => (
          <div key={group.label} className={gi > 0 ? 'mt-4' : ''}>
            {!collapsed && (
              <p className="text-[10px] font-semibold text-[#5f6368] uppercase tracking-widest px-3 mb-1">
                {group.label}
              </p>
            )}
            {collapsed && gi > 0 && <div className="h-px bg-[#e8eaed] mx-2 mb-2" />}
            <div className="space-y-0.5">
              {group.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    `flex items-center gap-3 py-2.5 rounded-full text-sm transition-all duration-150 ${
                      collapsed ? 'justify-center px-2' : 'px-4'
                    } ${
                      isActive
                        ? 'bg-[#10b981]/10 text-[#10b981] font-semibold'
                        : 'text-[#202124] hover:bg-[#f1f3f4] font-normal'
                    }`
                  }
                >
                  <span className="relative flex-shrink-0">
                    <item.icon className="w-[18px] h-[18px]" />
                    {item.to === '/alerts' && unreadAlerts > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] bg-red-500 rounded-full text-[9px] text-white font-bold flex items-center justify-center px-0.5">
                        {unreadAlerts > 99 ? '99+' : unreadAlerts}
                      </span>
                    )}
                    {item.to === '/team-data' && pendingTeamData > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] bg-amber-500 rounded-full text-[9px] text-white font-bold flex items-center justify-center px-0.5">
                        {pendingTeamData > 99 ? '99+' : pendingTeamData}
                      </span>
                    )}
                  </span>
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="border-t border-[#e8eaed] p-2 flex-shrink-0" ref={userMenuRef}>
        {collapsed ? (
          <button
            onClick={onToggle}
            className="w-full flex justify-center items-center py-2 rounded-full hover:bg-[#f1f3f4] text-[#5f6368] transition-colors"
            title="Expand sidebar"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(o => !o)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-[#f1f3f4] transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#10b981] to-emerald-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[#202124] truncate leading-tight">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-[10px] text-[#5f6368] truncate capitalize leading-tight">{user?.role}</p>
              </div>
              {userMenuOpen ? <ChevronUp className="w-3.5 h-3.5 text-[#5f6368] flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-[#5f6368] flex-shrink-0" />}
            </button>

            {userMenuOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-[#e8eaed] rounded-xl shadow-lg overflow-hidden z-50 py-1">
                <NavLink
                  to="/settings"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#202124] hover:bg-[#f1f3f4] transition-colors"
                >
                  <Settings className="w-4 h-4 text-[#5f6368]" />
                  Settings
                </NavLink>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

// ─── Global Search ────────────────────────────────────────────────────────────

interface SearchResult { type: string; id: string; title: string; subtitle: string; href: string }

interface LayoutErrorBoundaryState { hasError: boolean }

class LayoutErrorBoundary extends Component<{ children: ReactNode }, LayoutErrorBoundaryState> {
  state: LayoutErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): LayoutErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {}

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6">
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            Something went wrong while rendering this page.
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function GlobalSearchBar({ brandId }: { brandId: string }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || query.length < 2 || !brandId) { setResults([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const token = getToken();
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&brandId=${brandId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) { const d = await res.json(); setResults(d.results || []); setOpen(true); }
      } catch { /* silent */ } finally { setLoading(false); }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, brandId]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') { setOpen(false); setQuery(''); } }
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleClick);
    return () => { document.removeEventListener('keydown', handleKey); document.removeEventListener('mousedown', handleClick); };
  }, []);

  const go = (href: string) => { setOpen(false); setQuery(''); navigate(href); };

  return (
    <div className="relative w-full max-w-xl">
      <div className={`relative flex items-center rounded-full transition-all duration-150 ${
        focused
          ? 'bg-white shadow-md border border-[#e8eaed]'
          : 'bg-[#f1f3f4] border border-transparent hover:border-[#e8eaed] hover:shadow-sm'
      }`}>
        <Search className="absolute left-4 w-4 h-4 text-[#5f6368] pointer-events-none" />
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => { setFocused(true); if (results.length > 0) setOpen(true); }}
          onBlur={() => setFocused(false)}
          placeholder="Search orders, customers, inventory…"
          className="w-full pl-11 pr-10 py-2.5 bg-transparent text-sm text-[#202124] placeholder-[#80868b] focus:outline-none rounded-full"
        />
        {loading && (
          <div className="absolute right-4 w-4 h-4 border-2 border-[#10b981] border-t-transparent rounded-full animate-spin" />
        )}
      </div>
      {open && results.length > 0 && (
        <div ref={panelRef} className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl border border-[#e8eaed] shadow-xl z-50 overflow-hidden">
          {results.map(r => (
            <button key={`${r.type}-${r.id}`} onClick={() => go(r.href)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#f8f9fa] text-left transition-colors">
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                r.type === 'order' ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600'
              }`}>
                {r.type === 'order' ? 'O' : 'C'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[#202124] truncate">{r.title}</p>
                <p className="text-xs text-[#5f6368] truncate">{r.subtitle}</p>
              </div>
            </button>
          ))}
        </div>
      )}
      {open && query.length >= 2 && results.length === 0 && !loading && (
        <div ref={panelRef} className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl border border-[#e8eaed] shadow-xl z-50 px-4 py-4 text-sm text-[#5f6368] text-center">
          No results for &ldquo;{query}&rdquo;
        </div>
      )}
    </div>
  );
}

// ─── Brand View Toggle ────────────────────────────────────────────────────────

function BrandViewControls() {
  const { allBrands, brandId, viewMode, setViewMode, setActiveBrand } = useBrand();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (allBrands.length === 0) return null;

  const activeBrand = allBrands.find(b => b.id === brandId);

  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      {/* Isolated / Holistic toggle */}
      <div className="hidden sm:flex items-center bg-[#f1f3f4] rounded-full p-0.5">
        <button
          onClick={() => setViewMode('isolated')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 ${
            viewMode === 'isolated'
              ? 'bg-white text-[#202124] shadow-sm'
              : 'text-[#5f6368] hover:text-[#202124]'
          }`}
        >
          <Store className="w-3 h-3" /> Isolated
        </button>
        <button
          onClick={() => setViewMode('holistic')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 ${
            viewMode === 'holistic'
              ? 'bg-white text-[#202124] shadow-sm'
              : 'text-[#5f6368] hover:text-[#202124]'
          }`}
        >
          <Layers3 className="w-3 h-3" /> Holistic
        </button>
      </div>

      {/* Brand picker */}
      {viewMode === 'isolated' && allBrands.length > 1 && (
        <div className="relative" ref={pickerRef}>
          <button
            onClick={() => setPickerOpen(o => !o)}
            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-[#e8eaed] rounded-full text-xs font-medium text-[#202124] hover:bg-[#f8f9fa] hover:border-[#10b981] transition-colors shadow-sm"
          >
            <div className="w-4 h-4 rounded-md bg-gradient-to-br from-[#10b981] to-emerald-700 flex items-center justify-center text-white text-[8px] font-bold flex-shrink-0">
              {activeBrand?.name.charAt(0) ?? '?'}
            </div>
            <span className="max-w-[100px] truncate">{activeBrand?.name ?? 'Select brand'}</span>
            <ChevronDown className="w-3 h-3 text-[#5f6368]" />
          </button>
          {pickerOpen && (
            <div className="absolute right-0 top-full mt-2 bg-white border border-[#e8eaed] rounded-2xl shadow-xl z-50 min-w-[180px] py-1.5 overflow-hidden">
              {allBrands.map(b => (
                <button
                  key={b.id}
                  onClick={() => { setActiveBrand(b.id); setPickerOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-colors ${
                    b.id === brandId
                      ? 'bg-[#10b981]/8 text-[#10b981] font-medium'
                      : 'text-[#202124] hover:bg-[#f8f9fa]'
                  }`}
                >
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#10b981] to-emerald-700 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                    {b.name.charAt(0)}
                  </div>
                  <span className="truncate">{b.name}</span>
                  {b.id === brandId && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#10b981] flex-shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Global Refresh Button ────────────────────────────────────────────────────

function GlobalRefreshButton() {
  const { isSyncing, lastSynced, triggerGlobalSync } = useSyncContext();

  return (
    <button
      onClick={() => triggerGlobalSync()}
      disabled={isSyncing}
      title={lastSynced ? `Last synced: ${lastSynced.toLocaleTimeString()}` : 'Sync all data sources'}
      className="flex items-center gap-1.5 w-9 h-9 justify-center rounded-full border border-[#e8eaed] text-[#5f6368] hover:bg-[#f1f3f4] hover:border-[#10b981] hover:text-[#10b981] transition-colors disabled:opacity-40 flex-shrink-0"
    >
      <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
    </button>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function ProtectedLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [pendingTeamData, setPendingTeamData] = useState(0);
  const [searchBrandId, setSearchBrandId] = useState('');
  const { user } = useAuth();
  const { brandId } = useBrand();

  useEffect(() => {
    const token = getToken();
    if (!token || !brandId) return;
    let active = true;

    (async () => {
      try {
        const res = await fetch(`/api/ads/accounts/${brandId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        let selectedAdsAccountId: string | null = null;
        if (res.ok) {
          const data = await res.json().catch(() => ({ accounts: [] }));
          const accounts = Array.isArray(data?.accounts) ? data.accounts : [];
          const preferred = accounts.find((a: any) => a?.isActive) ?? accounts[0];
          selectedAdsAccountId = preferred?.id ?? null;
        }

        if (!active) return;
        useAdsStore.getState().setSelectedBrand(brandId, selectedAdsAccountId);
        useStrategyStore.getState().setSelectedBrand(brandId, selectedAdsAccountId);
      } catch {
        if (!active) return;
        useAdsStore.getState().setSelectedBrand(brandId, null);
        useStrategyStore.getState().setSelectedBrand(brandId, null);
      }
    })();

    return () => { active = false; };
  }, [brandId]);

  useEffect(() => {
    async function fetchCounts() {
      const token = getToken();
      if (!token) return;

      const brandsRes = await fetch('/api/brands', {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      }).catch(() => null);
      if (!brandsRes?.ok) return;

      const brandsData = await brandsRes.json().catch(() => null);
      const brandId = brandsData?.brands?.[0]?.id;
      if (!brandId) return;
      setSearchBrandId(brandId);

      const [alertRes, teamRes] = await Promise.all([
        fetch(`/api/alerts/unread-count?brandId=${brandId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null),
        fetch(`/api/shared-data/pending-count?brandId=${brandId}`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: 'include',
        }).catch(() => null),
      ]);

      if (alertRes?.ok) {
        const alertData = await alertRes.json().catch(() => null);
        if (alertData?.count != null) setUnreadAlerts(alertData.count);
      }
      if (teamRes?.ok) {
        const teamData = await teamRes.json().catch(() => null);
        if (teamData?.count != null) setPendingTeamData(teamData.count);
      }
    }

    fetchCounts();
    const timer = setInterval(fetchCounts, 60_000);
    return () => clearInterval(timer);
  }, [user]);

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8f9fa]">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — desktop */}
      <div className="hidden md:flex flex-col flex-shrink-0">
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed(c => !c)}
          unreadAlerts={unreadAlerts}
          pendingTeamData={pendingTeamData}
        />
      </div>

      {/* Sidebar — mobile drawer */}
      <div className={`fixed inset-y-0 left-0 z-50 flex flex-col md:hidden transition-transform duration-300 ease-in-out ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar
          collapsed={false}
          onToggle={() => setMobileOpen(false)}
          unreadAlerts={unreadAlerts}
          pendingTeamData={pendingTeamData}
        />
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="flex items-center h-16 px-4 bg-white border-b border-[#e8eaed] gap-4 flex-shrink-0">
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(true)}
            className="md:hidden w-10 h-10 rounded-full flex items-center justify-center hover:bg-[#f1f3f4] text-[#5f6368] transition-colors flex-shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Mobile logo */}
          <div className="md:hidden flex items-center gap-2 flex-shrink-0">
            <div className="w-7 h-7 rounded-lg bg-[#10b981] flex items-center justify-center">
              <span className="text-white text-xs font-black">B</span>
            </div>
            <span className="text-sm font-bold text-[#202124]">BRDG</span>
          </div>

          {/* Search — centered, fills available space */}
          <div className="flex-1 flex justify-center">
            <GlobalSearchBar brandId={searchBrandId} />
          </div>

          {/* Right controls */}
          <div className="hidden md:flex items-center gap-2 flex-shrink-0">
            <BrandViewControls />
            <GlobalRefreshButton />

            {/* Notification bell — routes to the Alerts page */}
            <button
              className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#f1f3f4] text-[#5f6368] transition-colors flex-shrink-0"
              title="Alerts"
              onClick={() => navigate('/alerts')}
            >
              <Bell className="w-[18px] h-[18px]" />
              {unreadAlerts > 0 && (
                <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-red-500 rounded-full text-[9px] text-white font-bold flex items-center justify-center px-1 leading-none">
                  {unreadAlerts > 99 ? '99+' : unreadAlerts}
                </span>
              )}
            </button>
          </div>

          {/* Mobile close */}
          {mobileOpen && (
            <button
              onClick={() => setMobileOpen(false)}
              className="md:hidden ml-auto w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#f1f3f4] text-[#5f6368] transition-colors flex-shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <LayoutErrorBoundary>
            <Outlet />
          </LayoutErrorBoundary>
        </main>
      </div>
    </div>
  );
}
