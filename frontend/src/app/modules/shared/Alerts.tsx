import { useState, useEffect, useCallback } from 'react';
import { Bell, RefreshCw, AlertTriangle, CheckCircle, Info, Package, MessageSquare, RotateCcw, ShoppingCart, CheckCheck } from 'lucide-react';
import { getToken } from '../../context/AuthContext';

interface AlertItem {
  id: string;
  type: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  read: boolean;
  createdAt: string;
}

const TYPE_ICON: Record<string, React.ElementType> = {
  low_stock: Package,
  open_tickets: MessageSquare,
  high_returns: RotateCcw,
  pending_orders: ShoppingCart,
};

function AlertCard({ alert, onMarkRead }: { alert: AlertItem; onMarkRead: (id: string) => void }) {
  const colors = {
    high:   { bg: 'bg-red-50 border-red-200', icon: 'text-red-500', title: 'text-red-800', detail: 'text-red-600' },
    medium: { bg: 'bg-yellow-50 border-yellow-200', icon: 'text-yellow-500', title: 'text-yellow-800', detail: 'text-yellow-600' },
    low:    { bg: 'bg-blue-50 border-blue-200', icon: 'text-blue-500', title: 'text-blue-800', detail: 'text-blue-600' },
  }[alert.severity];

  const Icon = TYPE_ICON[alert.type] ?? AlertTriangle;

  return (
    <div className={`rounded-xl border p-4 ${colors.bg} ${alert.read ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${colors.icon}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className={`text-sm font-semibold ${colors.title}`}>{alert.title}</h3>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`text-[10px] ${colors.detail}`}>
                {new Date(alert.createdAt).toLocaleString('en-IN')}
              </span>
              {!alert.read && (
                <button
                  onClick={() => onMarkRead(alert.id)}
                  className={`p-1 rounded hover:bg-white/60 transition-colors ${colors.icon}`}
                  title="Mark as read"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          {alert.detail && <p className={`text-xs mt-1 ${colors.detail}`}>{alert.detail}</p>}
        </div>
      </div>
    </div>
  );
}

export default function Alerts() {
  const [brandId, setBrandId] = useState('');
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [unreadOnly, setUnreadOnly] = useState(false);

  // Load first brand
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch('/api/brands', { credentials: 'include', headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.brands?.[0]) setBrandId(d.brands[0].id); })
      .catch(() => {});
  }, []);

  const fetchAlerts = useCallback(async () => {
    if (!brandId) return;
    const token = getToken();
    if (!token) return;

    setLoading(true);
    try {
      const res = await fetch(
        `/api/alerts?brandId=${brandId}&unreadOnly=${unreadOnly}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }, [brandId, unreadOnly]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const handleMarkRead = useCallback(async (id: string) => {
    const token = getToken();
    if (!token) return;
    await fetch(`/api/alerts/${id}/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, read: true } : a));
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    if (!brandId) return;
    const token = getToken();
    if (!token) return;
    await fetch('/api/alerts/mark-all-read', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandId }),
    }).catch(() => {});
    setAlerts(prev => prev.map(a => ({ ...a, read: true })));
  }, [brandId]);

  const displayed = unreadOnly ? alerts.filter(a => !a.read) : alerts;
  const highCount = displayed.filter(a => a.severity === 'high').length;
  const medCount = displayed.filter(a => a.severity === 'medium').length;
  const unreadCount = alerts.filter(a => !a.read).length;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Bell className="w-6 h-6 text-[#10b981]" /> Alerts
              {unreadCount > 0 && (
                <span className="text-xs bg-red-500 text-white rounded-full px-2 py-0.5 font-semibold">
                  {unreadCount} new
                </span>
              )}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Operational alerts evaluated after each sync cycle</p>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <CheckCheck className="w-3.5 h-3.5" /> Mark all read
              </button>
            )}
            <button
              onClick={() => setUnreadOnly(v => !v)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                unreadOnly
                  ? 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/30'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              Unread only
            </button>
            <button onClick={fetchAlerts} disabled={loading} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 bg-white">
              <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Summary badges */}
        <div className="flex gap-3 mb-6">
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span className="text-sm font-semibold text-red-700">{highCount} Critical</span>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2.5 flex items-center gap-2">
            <Info className="w-4 h-4 text-yellow-500" />
            <span className="text-sm font-semibold text-yellow-700">{medCount} Warning</span>
          </div>
        </div>

        {initialLoading ? (
          <div className="space-y-3">
            {[1,2,3,4].map(i => <div key={i} className="h-16 bg-white rounded-xl border border-gray-200 animate-pulse" />)}
          </div>
        ) : displayed.length > 0 ? (
          <div className="space-y-3">
            {displayed.map(a => <AlertCard key={a.id} alert={a} onMarkRead={handleMarkRead} />)}
          </div>
        ) : (
          <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
            <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-3" />
            <p className="text-green-800 font-semibold text-sm">All clear</p>
            <p className="text-green-600 text-xs mt-1">No active alerts detected across your operations</p>
          </div>
        )}
      </div>
    </div>
  );
}
