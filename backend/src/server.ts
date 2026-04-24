import express, { Express } from 'express';
import { setupMiddleware, setupErrorHandler } from './config/middleware';
import { authMiddleware } from './config/authMiddleware';
import { PORT } from './config/constants';

// Route imports
import { setupHealthRoutes } from './routes/health';
import { setupAuthRoutes } from './routes/auth';
import { setupAdminRoutes } from './routes/admin';
import { setupBrandsRoutes } from './routes/brands';
import { setupEcommerceRoutes } from './routes/ecommerce';
import { setupInventoryRoutes } from './routes/inventory';
import { setupReportsRoutes } from './routes/reports';
import { setupInsightsRoutes } from './routes/insights';
import { setupDataSourceRoutes } from './routes/dataSources';
import { setupFilesRoutes } from './routes/files';
import { setupEmailRoutes } from './routes/email';
import { setupBusinessHealthRoutes } from './routes/businessHealth';
import { setupAlertsRoutes } from './routes/alerts';
import { setupPreferencesRoutes } from './routes/preferences';
import { setupSharedDataRoutes } from './routes/sharedData';
import { setupFulfillmentRoutes } from './routes/fulfillment';
import { setupSearchRoutes } from './routes/search';
import { setupSyncRoutes } from './routes/sync';
import { setupRBACRoutes } from './routes/rbac';
import { setupDeliveryProfileRoutes } from './routes/deliveryProfiles';
import { setupMailboxRoutes } from './routes/mailbox';
import { setupDashboardRoutes } from './routes/dashboard';
import { setupFreshdeskRoutes } from './routes/freshdesk';
import { setupAdsRoutes } from './routes/ads';
import { setupStrategyRoutes } from './routes/strategy';
import { setupClawbotRoutes } from './routes/clawbot';
import { setupAgentRoutes } from './routes/agents';
import { startScheduler } from './scheduler';

// Initialize Express app
const app: Express = express();

// Setup middleware
setupMiddleware(app);

// Register all routes
console.log('Registering routes...');
setupHealthRoutes(app);
setupAuthRoutes(app);

// Auth middleware — protects all routes below this line
app.use(authMiddleware);

setupAdminRoutes(app);
setupBrandsRoutes(app);
setupEcommerceRoutes(app);
setupInventoryRoutes(app);
setupReportsRoutes(app);
setupInsightsRoutes(app);
setupDataSourceRoutes(app);
setupFilesRoutes(app);
setupEmailRoutes(app);
setupBusinessHealthRoutes(app);
setupAlertsRoutes(app);
setupPreferencesRoutes(app);
setupSharedDataRoutes(app);
setupFulfillmentRoutes(app);
setupSearchRoutes(app);
setupSyncRoutes(app);
setupRBACRoutes(app);
setupDeliveryProfileRoutes(app);
setupMailboxRoutes(app);
setupDashboardRoutes(app);
setupFreshdeskRoutes(app);
setupAdsRoutes(app);
setupStrategyRoutes(app);
setupClawbotRoutes(app);
setupAgentRoutes(app);

// Error handler — must be registered after all routes
setupErrorHandler(app);

// Start server
app.listen(PORT, () => {
  console.log(`BRDG Alpha API Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`API: http://localhost:${PORT}/api`);

  // Start background scheduler
  startScheduler();
});

export default app;
