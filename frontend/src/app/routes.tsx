/**
 * Application route table.
 *
 * Pages are loaded with React.lazy + Suspense so each route ships in
 * its own chunk. The initial bundle now contains only Login, Signup,
 * AuthGuard, ProtectedLayout, and the providers — every dashboard page
 * downloads on demand. This shaves a sizeable chunk off the time-to-
 * interactive on first paint, and means a heavy page (Strategy at 800
 * lines, ClawbotPage at 700) doesn't tax users who never visit it.
 *
 * One <Suspense> wraps the protected outlet rather than each page so
 * cross-route navigation gets a single fallback instead of stacking
 * spinners. The fallback uses the existing DashboardSkeleton — a
 * neutral, recognizable placeholder that doesn't shift layout.
 */

import { lazy, Suspense } from 'react';
import { createBrowserRouter, useRouteError, isRouteErrorResponse, Navigate, Outlet } from 'react-router';
import AuthGuard from './components/AuthGuard';
import ProtectedLayout from './ProtectedLayout';
import { DashboardSkeleton } from './components/Skeletons';
import { DateRangeProvider } from './context/DateRangeContext';
import { BrandProvider } from './context/BrandContext';
import { SyncProvider } from './context/SyncContext';
import { RBACProvider } from './context/RBACContext';
import { ToastProvider } from './components/Toast';

// ── Eagerly-loaded auth pages (small, pre-login) ─────────────────────────────
import Login from './pages/Login';
import Signup from './pages/Signup';
import OAuthCallback from './pages/OAuthCallback';

// ── Lazy-loaded protected pages ──────────────────────────────────────────────
const Dashboard       = lazy(() => import('./pages/Dashboard'));
const AdminPanel      = lazy(() => import('./pages/AdminPanel'));
const BrandsPage      = lazy(() => import('./pages/BrandsPage'));
const ModulesPage     = lazy(() => import('./pages/ModulesPage'));
const Settings        = lazy(() => import('./pages/Settings'));
const RBACSettings    = lazy(() => import('./pages/RBACSettings'));

// Marketing
const Analytics       = lazy(() => import('./modules/marketing/Analytics'));
const MetricsPage     = lazy(() => import('./modules/marketing/MetricsPage'));

// Supply-chain
const InventoryPage   = lazy(() => import('./modules/supply-chain/InventoryPage'));
const OrdersPage      = lazy(() => import('./modules/supply-chain/OrdersPage'));
const FulfillmentPage = lazy(() => import('./modules/supply-chain/FulfillmentPage'));

// Ops
const CustomersPage   = lazy(() => import('./modules/ops/CustomersPage'));
const ReturnsPage     = lazy(() => import('./modules/ops/ReturnsPage'));

// Shared / Intelligence
const Insights         = lazy(() => import('./modules/shared/Insights'));
const DataSources      = lazy(() => import('./modules/shared/DataSources'));
const Alerts           = lazy(() => import('./modules/shared/Alerts'));
const Touchpoints      = lazy(() => import('./modules/shared/Touchpoints'));
const Reports          = lazy(() => import('./modules/shared/Reports'));
const BrandReports     = lazy(() => import('./modules/shared/BrandReports'));
const TeamData         = lazy(() => import('./modules/shared/TeamData'));
const DeliveryProfiles = lazy(() => import('./modules/shared/DeliveryProfiles'));

// Ads & Strategy
const AdsManagement   = lazy(() => import('./pages/AdsManagement'));
const AdsActionLog    = lazy(() => import('./pages/AdsActionLog'));
const Strategy        = lazy(() => import('./pages/Strategy'));
const AdCreator       = lazy(() => import('./pages/AdCreator'));
const ClawbotPage     = lazy(() => import('./pages/ClawbotPage'));
const AgentEcosystem  = lazy(() => import('./pages/AgentEcosystem'));

function NotFound() {
  return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <h1>404 - Page Not Found</h1>
      <a href="/" style={{ color: '#10b981' }}>Go to Dashboard</a>
    </div>
  );
}

function RouteErrorBoundary() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
    ? error.message
    : 'An unexpected error occurred';

  return (
    <div className="flex-1 flex items-center justify-center bg-gray-50 min-h-screen">
      <div className="text-center max-w-md p-8">
        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-red-500 text-xl font-bold">!</span>
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Something went wrong</h1>
        <p className="text-sm text-gray-500 mb-6">{message}</p>
        <a
          href="/"
          className="inline-block px-4 py-2 bg-[#10b981] text-white rounded-lg text-sm font-medium hover:bg-[#10b981]/90"
        >
          Return to Dashboard
        </a>
      </div>
    </div>
  );
}

/** Suspense boundary that wraps every lazily-loaded protected page. */
function LazyOutlet() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Outlet />
    </Suspense>
  );
}

function ProtectedLayoutWithProviders() {
  return (
    <ToastProvider>
      <SyncProvider>
        <BrandProvider>
          <RBACProvider>
            <DateRangeProvider defaultPreset="30d">
              <ProtectedLayout />
            </DateRangeProvider>
          </RBACProvider>
        </BrandProvider>
      </SyncProvider>
    </ToastProvider>
  );
}

export const router = createBrowserRouter([
  { path: '/login', Component: Login, errorElement: <RouteErrorBoundary /> },
  { path: '/signup', Component: Signup, errorElement: <RouteErrorBoundary /> },
  { path: '/auth/callback', Component: OAuthCallback, errorElement: <RouteErrorBoundary /> },
  {
    Component: AuthGuard,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        Component: ProtectedLayoutWithProviders,
        children: [
          {
            // Single Suspense boundary so navigating between lazy pages
            // shows one fallback, not nested ones.
            Component: LazyOutlet,
            children: [
              { index: true, Component: Dashboard },
              // Marketing
              { path: 'analytics', Component: Analytics },
              { path: 'metrics', Component: MetricsPage },
              { path: 'ecom-metrics', element: <Navigate to="/fulfillment" replace /> },
              // Supply Chain
              { path: 'orders', Component: OrdersPage },
              { path: 'inventory', Component: InventoryPage },
              { path: 'fulfillment', Component: FulfillmentPage },
              // Ops
              { path: 'customers', Component: CustomersPage },
              { path: 'returns', Component: ReturnsPage },
              // Shared / Intelligence
              { path: 'reports', Component: Reports },
              { path: 'insights', Component: Insights },
              { path: 'data-sources', Component: DataSources },
              { path: 'team-data', Component: TeamData },
              { path: 'touchpoints', Component: Touchpoints },
              { path: 'alerts', Component: Alerts },
              { path: 'brands/:brandId/reports', Component: BrandReports },
              { path: 'delivery-profiles', Component: DeliveryProfiles },
              // Ads & Strategy
              { path: 'ads', Component: AdsManagement },
              { path: 'ads/create', Component: AdCreator },
              { path: 'ads/log', Component: AdsActionLog },
              { path: 'strategy', Component: Strategy },
              { path: 'clawbot', Component: ClawbotPage },
              { path: 'agents', Component: AgentEcosystem },
              // Management
              { path: 'settings', Component: Settings },
              { path: 'admin', Component: AdminPanel },
              { path: 'brands', Component: BrandsPage },
              { path: 'modules', Component: ModulesPage },
              { path: 'rbac', Component: RBACSettings },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', Component: NotFound },
]);
