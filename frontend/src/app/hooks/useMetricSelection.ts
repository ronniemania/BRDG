import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { getToken } from '../context/AuthContext';

// ─── Metric catalogue ─────────────────────────────────────────────────────────

export interface MetricDef {
  id: string;
  label: string;
  category: 'Sales' | 'Operations' | 'Customers' | 'Inventory' | 'Returns' | 'Fulfillment';
  format: 'currency' | 'number' | 'percent' | 'hours' | 'minutes';
  description: string;
}

export const ALL_METRICS: MetricDef[] = [
  // ── Sales ─────────────────────────────────────────────────────────────────
  { id: 'totalRevenue',          label: 'Total Revenue',           category: 'Sales',       format: 'currency', description: 'Gross revenue across all orders in period' },
  { id: 'netRevenue',            label: 'Net Revenue',             category: 'Sales',       format: 'currency', description: 'Total revenue minus value of returned orders' },
  { id: 'deliveredRevenue',      label: 'Delivered Revenue',       category: 'Sales',       format: 'currency', description: 'Revenue from orders with delivered status only' },
  { id: 'totalOrders',           label: 'Total Orders',            category: 'Sales',       format: 'number',   description: 'Count of all orders placed in period' },
  { id: 'avgOrderValue',         label: 'Avg Order Value (AOV)',   category: 'Sales',       format: 'currency', description: 'Mean revenue per order' },
  { id: 'highValueOrders',       label: 'High-Value Orders',       category: 'Sales',       format: 'number',   description: 'Orders with amount ≥ ₹5,000' },
  { id: 'deliveredOrders',       label: 'Delivered Orders',        category: 'Sales',       format: 'number',   description: 'Orders successfully delivered to customer' },
  { id: 'pendingOrders',         label: 'Pending Orders',          category: 'Sales',       format: 'number',   description: 'Orders placed but not yet dispatched' },
  { id: 'cancelledOrders',       label: 'Cancelled Orders',        category: 'Sales',       format: 'number',   description: 'Orders cancelled in period' },
  { id: 'cancellationRate',      label: 'Cancellation Rate',       category: 'Sales',       format: 'percent',  description: 'Cancelled orders ÷ total orders × 100' },

  // ── Operations ────────────────────────────────────────────────────────────
  { id: 'fulfilmentRate',        label: 'Fulfilment Rate',         category: 'Operations',  format: 'percent',  description: 'Delivered orders ÷ total orders × 100' },
  { id: 'avgDispatchHours',      label: 'Avg Dispatch Time',       category: 'Operations',  format: 'hours',    description: 'Average hours from order placed to dispatch' },
  { id: 'onTimeDispatchRate',    label: 'On-Time Dispatch Rate',   category: 'Operations',  format: 'percent',  description: 'Orders dispatched within 24h SLA ÷ dispatched × 100' },
  { id: 'slaBreachCount',        label: 'Dispatch SLA Breaches',   category: 'Operations',  format: 'number',   description: 'Orders that exceeded the 24h dispatch SLA' },
  { id: 'ordersDispatched',      label: 'Orders Dispatched',       category: 'Operations',  format: 'number',   description: 'Total orders that have a recorded dispatch date' },

  // ── Customers ─────────────────────────────────────────────────────────────
  { id: 'totalCustomers',        label: 'Total Customers',         category: 'Customers',   format: 'number',   description: 'Unique customers in the system' },
  { id: 'newCustomers',          label: 'New Customers',           category: 'Customers',   format: 'number',   description: 'Customers whose account was created within the selected period' },
  { id: 'repeatCustomers',       label: 'Repeat Customers',        category: 'Customers',   format: 'number',   description: 'Customers with more than 1 lifetime order' },
  { id: 'repeatRate',            label: 'Repeat Customer Rate',    category: 'Customers',   format: 'percent',  description: 'Repeat customers ÷ total customers × 100' },
  { id: 'highValueCustomers',    label: 'High-Value Customers',    category: 'Customers',   format: 'number',   description: 'Customers with 5 or more lifetime orders' },
  { id: 'avgOrdersPerCustomer',  label: 'Avg Orders / Customer',   category: 'Customers',   format: 'number',   description: 'Total orders ÷ total customers' },
  { id: 'avgRevenuePerCustomer', label: 'Avg Revenue / Customer',  category: 'Customers',   format: 'currency', description: 'Total revenue ÷ total customers (ARPU)' },
  { id: 'avgLifetimeValue',      label: 'Avg Lifetime Value (LTV)',category: 'Customers',   format: 'currency', description: 'Average total spend per customer across all time' },

  // ── Inventory ─────────────────────────────────────────────────────────────
  { id: 'totalSkus',             label: 'Total SKUs',              category: 'Inventory',   format: 'number',   description: 'Total distinct SKUs tracked on the dashboard' },
  { id: 'inStockSkus',           label: 'In-Stock SKUs',           category: 'Inventory',   format: 'number',   description: 'SKUs with stock level above reorder point' },
  { id: 'totalInventoryValue',   label: 'Inventory Value (Cost)',  category: 'Inventory',   format: 'currency', description: 'Sum of stock level × cost price across all tracked SKUs' },
  { id: 'inventoryRetailValue',  label: 'Inventory Value (Retail)',category: 'Inventory',   format: 'currency', description: 'Sum of stock level × sale price — potential retail revenue on hand' },
  { id: 'lowStockCount',         label: 'Low Stock SKUs',          category: 'Inventory',   format: 'number',   description: 'SKUs at or below their reorder point (but not zero)' },
  { id: 'outOfStockCount',       label: 'Out of Stock SKUs',       category: 'Inventory',   format: 'number',   description: 'SKUs with zero stock on hand' },
  { id: 'stockoutRate',          label: 'Stockout Rate',           category: 'Inventory',   format: 'percent',  description: 'Out-of-stock SKUs ÷ total SKUs × 100' },
  { id: 'sellableSkus',          label: 'Sellable SKUs',           category: 'Inventory',   format: 'number',   description: 'SKUs classified as sellable bin (not damaged/expired)' },
  { id: 'damagedSkus',           label: 'Damaged SKUs',            category: 'Inventory',   format: 'number',   description: 'SKUs in the damaged bin' },
  { id: 'expiredSkus',           label: 'Expired / Dead SKUs',     category: 'Inventory',   format: 'number',   description: 'SKUs in the expired or dead-stock bin' },

  // ── Returns ───────────────────────────────────────────────────────────────
  { id: 'totalReturns',          label: 'Total Returns',           category: 'Returns',     format: 'number',   description: 'Count of return/refund requests in period' },
  { id: 'returnRate',            label: 'Return Rate',             category: 'Returns',     format: 'percent',  description: 'Returns ÷ orders × 100' },
  { id: 'returnValue',           label: 'Total Return Value',      category: 'Returns',     format: 'currency', description: 'Total refund amount issued in period' },
  { id: 'avgReturnValue',        label: 'Avg Return Value',        category: 'Returns',     format: 'currency', description: 'Average refund amount per return request' },
  { id: 'pendingReturns',        label: 'Pending Returns',         category: 'Returns',     format: 'number',   description: 'Return requests not yet processed' },
  { id: 'resolvedReturns',       label: 'Resolved Returns',        category: 'Returns',     format: 'number',   description: 'Returns marked as resolved, completed or closed' },
  { id: 'returnResolutionRate',  label: 'Return Resolution Rate',  category: 'Returns',     format: 'percent',  description: 'Resolved returns ÷ total returns × 100' },

  // ── Fulfillment Pipeline ──────────────────────────────────────────────────
  { id: 'fulfillmentTotal',          label: 'Pipeline Orders',           category: 'Fulfillment', format: 'number',   description: 'Total orders tracked in the fulfillment pipeline' },
  { id: 'fulfillmentCompleted',      label: 'Pipeline Completed',        category: 'Fulfillment', format: 'number',   description: 'Orders that have reached Connected to Courier' },
  { id: 'fulfillmentInProgress',     label: 'Pipeline In Progress',      category: 'Fulfillment', format: 'number',   description: 'Orders currently moving through the pipeline' },
  { id: 'fulfillmentPending',        label: 'Pipeline Pending',          category: 'Fulfillment', format: 'number',   description: 'Orders in the pipeline awaiting their first step' },
  { id: 'fulfillmentCompletionRate', label: 'Pipeline Completion Rate',  category: 'Fulfillment', format: 'percent',  description: 'Completed pipeline orders ÷ total pipeline orders × 100' },
  { id: 'fulfillmentBreachCount',    label: 'Pipeline SLA Breaches',     category: 'Fulfillment', format: 'number',   description: 'Orders that exceeded step SLA thresholds' },
  { id: 'fulfillmentSlaBreachRate',  label: 'Pipeline SLA Breach Rate',  category: 'Fulfillment', format: 'percent',  description: 'SLA-breached pipeline orders ÷ total × 100' },
  { id: 'avgFulfillmentMins',        label: 'Avg Pipeline Time',         category: 'Fulfillment', format: 'minutes',  description: 'Average end-to-end time from order trigger to courier handoff' },
];

const DEFAULT_SELECTED = [
  'totalRevenue', 'netRevenue', 'totalOrders', 'avgOrderValue',
  'fulfilmentRate', 'onTimeDispatchRate',
  'totalCustomers', 'repeatRate',
  'lowStockCount', 'outOfStockCount',
  'returnRate', 'avgReturnValue',
  'fulfillmentCompleted', 'avgFulfillmentMins',
];

const PREF_KEY = 'trackedMetrics';

// ─── API helpers ──────────────────────────────────────────────────────────────

async function fetchPreferences(): Promise<string[]> {
  const token = getToken();
  const res = await fetch('/api/user/preferences', {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return DEFAULT_SELECTED;
  const { preferences } = await res.json();
  const stored = preferences?.[PREF_KEY];
  if (Array.isArray(stored) && stored.length > 0) return stored as string[];
  return DEFAULT_SELECTED;
}

async function savePreferences(metrics: string[]): Promise<void> {
  const token = getToken();
  await fetch('/api/user/preferences', {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ [PREF_KEY]: metrics }),
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMetricSelection() {
  const [selected, setSelected] = useState<string[]>(DEFAULT_SELECTED);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchPreferences()
      .then(metrics => {
        setSelected(metrics);
        setPrefsLoaded(true);
      })
      .catch(() => setPrefsLoaded(true));
  }, []);

  const persistToVps = useCallback((metrics: string[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      savePreferences(metrics).catch(() => {});
    }, 400);
  }, []);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  const toggle = useCallback((id: string) => {
    setSelected(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      persistToVps(next);
      return next;
    });
  }, [persistToVps]);

  const reset = useCallback(() => {
    setSelected(DEFAULT_SELECTED);
    persistToVps(DEFAULT_SELECTED);
  }, [persistToVps]);

  const isSelected = useCallback((id: string) => selected.includes(id), [selected]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedMetrics = useMemo(
    () => ALL_METRICS.filter(m => selectedSet.has(m.id)),
    [selectedSet],
  );

  return { selected, selectedMetrics, toggle, reset, isSelected, allMetrics: ALL_METRICS, prefsLoaded };
}

// ─── Formatter ────────────────────────────────────────────────────────────────

export function formatMetricValue(value: number, format: MetricDef['format']): string {
  switch (format) {
    case 'currency': {
      if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
      if (value >= 100000)   return `₹${(value / 100000).toFixed(1)}L`;
      if (value >= 1000)     return `₹${(value / 1000).toFixed(1)}k`;
      return `₹${value.toLocaleString('en-IN')}`;
    }
    case 'percent':  return `${value % 1 === 0 ? value : value.toFixed(1)}%`;
    case 'hours':    return `${value % 1 === 0 ? value : value.toFixed(1)}h`;
    case 'minutes': {
      if (value < 60) return `${Math.round(value)}m`;
      const h = Math.floor(value / 60);
      const m = Math.round(value % 60);
      return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    default:         return value.toLocaleString('en-IN');
  }
}
