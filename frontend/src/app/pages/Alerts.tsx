import { useState, useEffect, useMemo } from 'react';
import { Bell, RefreshCw, AlertTriangle, CheckCircle, Info, Package, Truck } from 'lucide-react';
import { getToken } from '../context/AuthContext';
import { useDateRangeQueries } from '../hooks/useDateRangeQuery';

interface Alert {
  id: string;
  type: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail?: string;
  timestamp: string;
}

function AlertCard({ alert }: { alert: Alert }) {
  const colors = {
    high:   { bg: 'bg-red-50 border-red-200', icon: 'text-red-500', title: 'text-red-800', detail: 'text-red-600' },
    medium: { bg: 'bg-yellow-50 border-yellow-200', icon: 'text-yellow-500', title: 'text-yellow-800', detail: 'text-yellow-600' },
    low:    { bg: 'bg-blue-50 border-blue-200', icon: 'text-blue-500', title: 'text-blue-800', detail: 'text-blue-600' },
  }[alert.severity];

  const Icon = alert.type === 'inventory' ? Package : alert.type === 'sla' ? Truck : AlertTriangle;

  return (
    <div className={`rounded-xl border p-4 ${colors.bg}`}>
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${colors.icon}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className={`text-sm font-semibold ${colors.title}`}>{alert.title}</h3>
            <span className={`text-[10px] flex-shrink-0 ${colors.detail}`}>{new Date(alert.timestamp).toLocaleString('en-IN')}</span>
          </div>
          {alert.detail && <p className={`text-xs mt-1 ${colors.detail}`}>{alert.detail}</p>}
        </div>
      </div>
    </div>
  );
}

export default function Alerts() {
  const [brandId, setBrandId] = useState('');

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch('/api/brands', { credentials: 'include', headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.brands?.[0]) setBrandId(d.brands[0].id); })
      .catch(() => {});
  }, []);

  const urls = useMemo(() => ({
    anomalies: brandId ? `/api/insights/anomalies?brandId=${brandId}` : null,
    inventory: brandId ? `/api/inventory?brandId=${brandId}` : null,
  }), [brandId]);

  const { data, loading, initialLoading, refetch } = useDateRangeQueries(urls, {}, !!brandId);

  const anomalies: any[] = data.anomalies?.anomalies || [];
  const inventory: any[] = data.inventory?.items || [];

  // Build composite alerts list
  const alerts: Alert[] = useMemo(() => {
    const list: Alert[] = [];
    const now = new Date().toISOString();

    // From anomaly detector
    anomalies.forEach((a: any, i: number) => {
      list.push({ id: `anomaly-${i}`, type: a.type, severity: a.severity, title: a.title, detail: a.detail, timestamp: now });
    });

    // Low stock alerts from inventory
    const criticalStock = inventory.filter(i => i.stockLevel === 0);
    criticalStock.forEach(item => {
      list.push({
        id: `stock-${item.id}`,
        type: 'inventory',
        severity: 'high',
        title: `Out of stock: ${item.name}`,
        detail: `SKU: ${item.sku} · Reorder point: ${item.reorderPoint}`,
        timestamp: item.lastUpdated || now,
      });
    });

    const lowStock = inventory.filter(i => i.stockLevel > 0 && i.stockLevel <= i.reorderPoint);
    lowStock.forEach(item => {
      list.push({
        id: `low-${item.id}`,
        type: 'inventory',
        severity: 'medium',
        title: `Low stock: ${item.name}`,
        detail: `${item.stockLevel} units remaining (reorder at ${item.reorderPoint})`,
        timestamp: item.lastUpdated || now,
      });
    });

    return list.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return (order[a.severity] || 0) - (order[b.severity] || 0);
    });
  }, [anomalies, inventory]);

  const highCount = alerts.filter(a => a.severity === 'high').length;
  const medCount = alerts.filter(a => a.severity === 'medium').length;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Bell className="w-6 h-6 text-[#10b981]" /> Alerts
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Real-time alerts based on your operational data</p>
          </div>
          <button onClick={refetch} disabled={loading} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 bg-white">
            <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
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
          <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-16 bg-white rounded-xl border border-gray-200 animate-pulse" />)}</div>
        ) : alerts.length > 0 ? (
          <div className="space-y-3">
            {alerts.map(a => <AlertCard key={a.id} alert={a} />)}
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
