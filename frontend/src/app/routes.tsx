import { createBrowserRouter, useRouteError, isRouteErrorResponse, Navigate } from 'react-router';
import AuthGuard from './components/AuthGuard';
import ProtectedLayout from './ProtectedLayout';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Signup from './pages/Signup';
import AdminPanel from './pages/AdminPanel';
import BrandsPage from './pages/BrandsPage';
import ModulesPage from './pages/ModulesPage';
import Settings from './pages/Settings';
import OAuthCallback from './pages/OAuthCallback';
import { DateRangeProvider } from './context/DateRangeContext';
import { BrandProvider } from './context/BrandContext';
import { SyncProvider } from './context/SyncContext';
import { RBACProvider } from './context/RBACContext';
import { ToastProvider } from './components/Toast';

// Marketing module
import Analytics from './modules/marketing/Analytics';
import MetricsPage from './modules/marketing/MetricsPage';

// Supply-chain module
import InventoryPage from './modules/supply-chain/InventoryPage';
import OrdersPage from './modules/supply-chain/OrdersPage';
import FulfillmentPage from './modules/supply-chain/FulfillmentPage';

// Ops module
import CustomersPage from './modules/ops/CustomersPage';
import ReturnsPage from './modules/ops/ReturnsPage';

// Shared module
import Insights from './modules/shared/Insights';
import DataSources from './modules/shared/DataSources';
import Alerts from './modules/shared/Alerts';
import Touchpoints from './modules/shared/Touchpoints';
import Reports from './modules/shared/Reports';
import BrandReports from './modules/shared/BrandReports';
import TeamData from './modules/shared/TeamData';
import DeliveryProfiles from './modules/shared/DeliveryProfiles';
import RBACSettings from './pages/RBACSettings';

// Ads & Strategy module
import AdsManagement from './pages/AdsManagement';
import AdsActionLog from './pages/AdsActionLog';
import Strategy from './pages/Strategy';
import AdCreator from './pages/AdCreator';
import ClawbotPage from './pages/ClawbotPage';
import AgentEcosystem from './pages/AgentEcosystem';

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
  { path: '*', Component: NotFound },
]);
