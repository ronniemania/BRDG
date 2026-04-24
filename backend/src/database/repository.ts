import { PrismaClient, Prisma } from '@prisma/client';
import { ENCRYPTION_KEY } from '../config/constants';
import { encryptIfNeeded, decryptIfNeeded } from '../utils/encryption';

const prisma = new PrismaClient();

// ─── User ─────────────────────────────────────────────────────────────────────

async function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

async function findUserById(id: string) {
  return prisma.user.findUnique({ where: { id } });
}

async function createUser(data: {
  id?: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: string;
  status?: string;
}) {
  return prisma.user.create({ data });
}

async function updateUser(id: string, data: Partial<{
  password: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  lastLogin: Date;
  refreshTokenHash: string | null;
}>) {
  return prisma.user.update({ where: { id }, data });
}

async function listUsers() {
  return prisma.user.findMany({
    select: {
      id: true, email: true, firstName: true, lastName: true,
      role: true, status: true, createdAt: true, lastLogin: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

// ─── Brand ────────────────────────────────────────────────────────────────────

async function findBrandsByOwner(ownerId: string) {
  return prisma.brand.findMany({ where: { ownerId }, orderBy: { createdAt: 'desc' } });
}

async function findBrandById(id: string) {
  return prisma.brand.findUnique({ where: { id } });
}

async function createBrand(data: { name: string; ownerId: string; id?: string; status?: string }) {
  return prisma.brand.create({ data });
}

async function updateBrand(id: string, data: Partial<{ name: string; status: string; features: unknown }>) {
  return prisma.brand.update({ where: { id }, data });
}

async function deleteBrand(id: string) {
  return prisma.brand.delete({ where: { id } });
}

// ─── Date range helper ────────────────────────────────────────────────────────
// Translates { range?, start_date?, end_date? } → { gte?, lte? } for Prisma.
// Handles presets like "7d", "30d", "90d", "365d" (days suffix only).

function resolveRange(filters: {
  start_date?: string; end_date?: string; range?: string;
}): { gte?: Date; lte?: Date } {
  if (filters.start_date || filters.end_date) {
    return {
      gte: filters.start_date ? new Date(filters.start_date) : undefined,
      lte: filters.end_date ? new Date(filters.end_date) : undefined,
    };
  }
  if (filters.range && filters.range !== 'all') {
    const match = filters.range.match(/^(\d+)d$/);
    if (match) {
      const start = new Date();
      start.setDate(start.getDate() - parseInt(match[1], 10));
      return { gte: start, lte: new Date() };
    }
  }
  return {};
}

// ─── Order ────────────────────────────────────────────────────────────────────

async function findOrdersByBrand(brandId: string, filters: {
  start_date?: string;
  end_date?: string;
  status?: string;
  range?: string;
} = {}) {
  const where: Prisma.OrderWhereInput = { brandId };
  if (filters.status) where.status = filters.status;
  const dateRange = resolveRange(filters);
  if (dateRange.gte || dateRange.lte) {
    where.orderDate = {};
    if (dateRange.gte) where.orderDate.gte = dateRange.gte;
    if (dateRange.lte) where.orderDate.lte = dateRange.lte;
  }
  return prisma.order.findMany({ where, orderBy: { orderDate: 'desc' } });
}

async function createOrder(data: {
  brandId: string; orderId: string; customerName: string;
  amount: number; status?: string; orderDate?: Date;
  dispatchDate?: Date; hoursToDispatch?: number; id?: string;
}) {
  return prisma.order.create({ data });
}

async function upsertOrder(data: {
  brandId: string; orderId: string; customerName: string;
  amount: number; status?: string; orderDate?: Date;
  dispatchDate?: Date; hoursToDispatch?: number;
}) {
  const { brandId, orderId, ...rest } = data;
  return prisma.order.upsert({
    where: { brandId_orderId: { brandId, orderId } },
    update: {
      customerName: rest.customerName,
      amount: rest.amount,
      status: rest.status,
      dispatchDate: rest.dispatchDate,
      hoursToDispatch: rest.hoursToDispatch,
    },
    create: { brandId, orderId, ...rest },
  });
}

async function updateOrder(id: string, data: Partial<{
  status: string; dispatchDate: Date; hoursToDispatch: number;
}>) {
  return prisma.order.update({ where: { id }, data });
}

// ─── Customer ─────────────────────────────────────────────────────────────────

async function findCustomersByBrand(brandId: string, filters: {
  start_date?: string; end_date?: string;
} = {}) {
  const where: Prisma.CustomerWhereInput = { brandId };
  if (filters.start_date || filters.end_date) {
    where.lastOrderDate = {};
    if (filters.start_date) where.lastOrderDate.gte = new Date(filters.start_date);
    if (filters.end_date) where.lastOrderDate.lte = new Date(filters.end_date);
  }
  return prisma.customer.findMany({
    where,
    orderBy: { totalSpent: 'desc' },
  });
}

async function upsertCustomer(brandId: string, email: string, data: {
  name: string; totalOrders?: number; totalSpent?: number; lastOrderDate?: Date;
}) {
  return prisma.customer.upsert({
    where: { brandId_email: { brandId, email: email || '' } },
    update: data,
    create: { brandId, email, ...data },
  });
}

// ─── Inventory ────────────────────────────────────────────────────────────────

async function findInventoryByBrand(brandId: string, filters: {
  category?: string; status?: string; shopifyStatus?: string; trackedOnDashboard?: boolean;
} = {}) {
  const where: Prisma.InventoryItemWhereInput = { brandId };
  if (filters.category) where.category = filters.category;
  if (filters.status) where.status = filters.status;
  if (filters.shopifyStatus && filters.shopifyStatus !== 'all') where.shopifyStatus = filters.shopifyStatus;
  if (filters.trackedOnDashboard !== undefined) where.trackedOnDashboard = filters.trackedOnDashboard;
  return prisma.inventoryItem.findMany({ where, orderBy: { lastUpdated: 'desc' } });
}

async function createInventoryItem(data: {
  brandId: string; sku: string; name: string; stockLevel?: number;
  reorderLevel?: number; reorderPoint?: number; category?: string;
  costPrice?: number; salePrice?: number; maxStock?: number; status?: string; shopifyStatus?: string; binType?: string; trackedOnDashboard?: boolean; id?: string; warehouseId?: string; lastUpdated?: Date;
}) {
  return prisma.inventoryItem.create({ data });
}

async function upsertInventoryItem(data: {
  brandId: string; sku: string; name: string; stockLevel?: number;
  reorderLevel?: number; reorderPoint?: number; category?: string;
  costPrice?: number; salePrice?: number; maxStock?: number; status?: string; shopifyStatus?: string; binType?: string; trackedOnDashboard?: boolean; warehouseId?: string;
}) {
  const { brandId, sku, ...rest } = data;
  return prisma.inventoryItem.upsert({
    where: { brandId_sku: { brandId, sku } },
    update: {
      name: rest.name,
      stockLevel: rest.stockLevel ?? 0,
      category: rest.category || 'General',
      salePrice: rest.salePrice ?? 0,
      costPrice: rest.costPrice ?? 0,
      reorderLevel: rest.reorderLevel ?? 10,
      reorderPoint: rest.reorderPoint ?? 10,
      maxStock: rest.maxStock ?? 100,
      status: rest.status || 'in_stock',
      shopifyStatus: rest.shopifyStatus || 'active',
      binType: rest.binType || 'sellable',
      trackedOnDashboard: rest.trackedOnDashboard ?? true,
      lastUpdated: new Date(),
    },
    create: { brandId, sku, ...rest },
  });
}

async function updateInventoryItem(id: string, data: Partial<{
  stockLevel: number; status: string; salePrice: number;
  costPrice: number; reorderPoint: number; trackedOnDashboard: boolean;
}>) {
  return prisma.inventoryItem.update({ where: { id }, data: { ...data, lastUpdated: new Date() } });
}

async function deleteInventoryItem(id: string) {
  return prisma.inventoryItem.delete({ where: { id } });
}

// ─── Returns ──────────────────────────────────────────────────────────────────

async function findReturnsByBrand(brandId: string, filters: {
  start_date?: string; end_date?: string; range?: string; status?: string;
} = {}) {
  const where: Prisma.ReturnWhereInput = { brandId };
  if (filters.status) where.status = filters.status;
  const dateRange = resolveRange(filters);
  if (dateRange.gte || dateRange.lte) {
    where.returnDate = {};
    if (dateRange.gte) where.returnDate.gte = dateRange.gte;
    if (dateRange.lte) where.returnDate.lte = dateRange.lte;
  }
  return prisma.return.findMany({ where, orderBy: { returnDate: 'desc' } });
}

async function createReturn(data: {
  brandId: string; orderId: string; customerName: string;
  amount?: number; reason?: string; status?: string; channel?: string; sku?: string;
}) {
  return prisma.return.create({ data });
}

async function updateReturn(id: string, data: Partial<{
  status: string; returnAction: string; resolvedAt: Date;
}>) {
  return prisma.return.update({ where: { id }, data });
}

// ─── Data Sources ─────────────────────────────────────────────────────────────

async function findDataSourcesByBrand(brandId: string) {
  return prisma.dataSource.findMany({ where: { brandId }, orderBy: { createdAt: 'desc' } });
}

async function findDataSourceById(id: string) {
  return prisma.dataSource.findUnique({ where: { id } });
}

async function createDataSource(data: {
  brandId: string; name: string; type: string; config?: unknown;
  id?: string; syncStatus?: string; recordCount?: number; lastSync?: Date; createdAt?: Date;
}) {
  return prisma.dataSource.create({ data });
}

async function updateDataSource(id: string, data: Partial<{
  syncStatus: string; lastSync: Date; lastError: string | null; recordCount: number;
}>) {
  return prisma.dataSource.update({ where: { id }, data });
}

// ─── Reports ──────────────────────────────────────────────────────────────────

async function findReportsByBrand(brandId: string) {
  return prisma.report.findMany({ where: { brandId }, orderBy: { createdAt: 'desc' } });
}

async function createReport(data: {
  brandId: string; name: string; type: string; config?: unknown; id?: string;
}) {
  return prisma.report.create({ data });
}

async function updateReport(id: string, data: Partial<{ lastGenerated: Date }>) {
  return prisma.report.update({ where: { id }, data });
}

async function deleteReport(id: string) {
  return prisma.report.delete({ where: { id } });
}

// ─── Shopify ──────────────────────────────────────────────────────────────────

function decryptShopifyStore<T extends { apiKey: string; apiPassword: string }>(store: T): T {
  return {
    ...store,
    apiKey: decryptIfNeeded(store.apiKey, ENCRYPTION_KEY),
    apiPassword: decryptIfNeeded(store.apiPassword, ENCRYPTION_KEY),
  };
}

async function findShopifyStoresByBrand(brandId: string) {
  const stores = await prisma.shopifyStore.findMany({ where: { brandId } });
  return stores.map(decryptShopifyStore);
}

async function findShopifyStoreById(id: string) {
  const store = await prisma.shopifyStore.findUnique({ where: { id } });
  if (!store) return null;
  return decryptShopifyStore(store);
}

async function createShopifyStore(data: {
  brandId: string; shopName: string; apiKey: string; apiPassword: string; id?: string; syncStatus?: string;
}) {
  return prisma.shopifyStore.create({
    data: {
      ...data,
      apiKey: encryptIfNeeded(data.apiKey, ENCRYPTION_KEY),
      apiPassword: encryptIfNeeded(data.apiPassword, ENCRYPTION_KEY),
    },
  });
}

// ─── OAuth Tokens ─────────────────────────────────────────────────────────────

async function saveOAuthToken(data: {
  userId: string; provider: string;
  accessToken: string; refreshToken: string;
  expiresAt: Date; scopes: string;
}) {
  return prisma.oAuthToken.upsert({
    where: { userId_provider: { userId: data.userId, provider: data.provider } },
    update: {
      accessToken: encryptIfNeeded(data.accessToken, ENCRYPTION_KEY),
      refreshToken: encryptIfNeeded(data.refreshToken, ENCRYPTION_KEY),
      expiresAt: data.expiresAt,
      scopes: data.scopes,
    },
    create: {
      userId: data.userId,
      provider: data.provider,
      accessToken: encryptIfNeeded(data.accessToken, ENCRYPTION_KEY),
      refreshToken: encryptIfNeeded(data.refreshToken, ENCRYPTION_KEY),
      expiresAt: data.expiresAt,
      scopes: data.scopes,
    },
  });
}

async function findOAuthToken(userId: string, provider: string) {
  const token = await prisma.oAuthToken.findUnique({
    where: { userId_provider: { userId, provider } },
  });
  if (!token) return null;
  return {
    ...token,
    accessToken: decryptIfNeeded(token.accessToken, ENCRYPTION_KEY),
    refreshToken: decryptIfNeeded(token.refreshToken, ENCRYPTION_KEY),
  };
}

async function deleteOAuthToken(userId: string, provider: string) {
  return prisma.oAuthToken.deleteMany({
    where: { userId, provider },
  });
}

// ─── User Preferences ─────────────────────────────────────────────────────────

async function getUserPreferences(userId: string): Promise<Record<string, unknown>> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } });
  return (user?.preferences as Record<string, unknown>) ?? {};
}

async function updateUserPreferences(userId: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  const current = await getUserPreferences(userId);
  const merged = { ...current, ...patch };
  await prisma.user.update({ where: { id: userId }, data: { preferences: merged } });
  return merged;
}

// ─── Drive Ingested Files ─────────────────────────────────────────────────────

async function findDriveIngestedFile(dataSourceId: string, fileName: string) {
  return prisma.driveIngestedFile.findUnique({
    where: { dataSourceId_fileName: { dataSourceId, fileName } },
  });
}

async function upsertDriveIngestedFile(data: {
  dataSourceId: string; brandId: string; fileName: string;
  fileHash: string; recordCount: number; status: string; error?: string;
}) {
  return prisma.driveIngestedFile.upsert({
    where: { dataSourceId_fileName: { dataSourceId: data.dataSourceId, fileName: data.fileName } },
    update: {
      fileHash: data.fileHash,
      recordCount: data.recordCount,
      status: data.status,
      error: data.error ?? null,
      processedAt: new Date(),
    },
    create: data,
  });
}

// ─── Freshdesk Tickets ────────────────────────────────────────────────────────

async function findTicketsByBrand(brandId: string, filters: {
  start_date?: string; end_date?: string; range?: string; status?: string;
} = {}) {
  const where: Prisma.FreshdeskTicketWhereInput = { brandId };
  if (filters.status) where.status = filters.status;
  const dateRange = resolveRange(filters);
  if (dateRange.gte || dateRange.lte) {
    where.createdAt = {};
    if (dateRange.gte) where.createdAt.gte = dateRange.gte;
    if (dateRange.lte) where.createdAt.lte = dateRange.lte;
  }
  return prisma.freshdeskTicket.findMany({ where, orderBy: { createdAt: 'desc' } });
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

async function createAuditLog(data: {
  userId: string; action: string; resource: string; details: string;
}) {
  return prisma.auditLog.create({ data });
}

async function findAuditLogs(filters: { userId?: string } = {}) {
  return prisma.auditLog.findMany({
    where: filters.userId ? { userId: filters.userId } : {},
    include: { user: { select: { email: true, firstName: true, lastName: true } } },
    orderBy: { timestamp: 'desc' },
    take: 500,
  });
}

// ─── Sync Log ─────────────────────────────────────────────────────────────────

async function createSyncLog(data: {
  brandId: string; dataSourceId: string; status: string;
  recordCount?: number; error?: string;
}) {
  return prisma.syncLog.create({ data });
}

async function findSyncLogsByBrand(brandId: string) {
  return prisma.syncLog.findMany({
    where: { brandId },
    orderBy: { syncedAt: 'desc' },
    take: 100,
  });
}

// ─── Warehouse ────────────────────────────────────────────────────────────────

async function findWarehousesByBrand(brandId: string) {
  return prisma.warehouse.findMany({ where: { brandId } });
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

async function createAlert(data: {
  brandId: string; type: string; severity?: string; title: string; detail?: string;
}) {
  return prisma.alert.create({ data });
}

async function findAlertsByBrand(brandId: string, filters: { unreadOnly?: boolean } = {}) {
  return prisma.alert.findMany({
    where: { brandId, ...(filters.unreadOnly ? { read: false } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
}

async function countUnreadAlerts(brandId: string) {
  return prisma.alert.count({ where: { brandId, read: false } });
}

async function markAlertRead(id: string) {
  return prisma.alert.update({ where: { id }, data: { read: true } });
}

async function markAllAlertsRead(brandId: string) {
  return prisma.alert.updateMany({ where: { brandId, read: false }, data: { read: true } });
}

async function deleteOldAlerts(brandId: string, olderThanDays = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);
  return prisma.alert.deleteMany({ where: { brandId, createdAt: { lt: cutoff } } });
}

// ─── Brand Members ────────────────────────────────────────────────────────────

async function findBrandMembers(brandId: string) {
  return prisma.brandMember.findMany({
    where: { brandId },
    include: {
      user: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
    },
    orderBy: { joinedAt: 'asc' },
  });
}

async function findBrandMember(brandId: string, userId: string) {
  return prisma.brandMember.findUnique({
    where: { brandId_userId: { brandId, userId } },
  });
}

async function addBrandMember(data: { brandId: string; userId: string; role?: string }) {
  return prisma.brandMember.create({ data });
}

async function removeBrandMember(brandId: string, userId: string) {
  return prisma.brandMember.delete({
    where: { brandId_userId: { brandId, userId } },
  });
}

// Returns all brands the user owns OR is a member of
async function findAccessibleBrands(userId: string) {
  const [owned, memberships] = await Promise.all([
    prisma.brand.findMany({ where: { ownerId: userId }, orderBy: { createdAt: 'desc' } }),
    prisma.brandMember.findMany({
      where: { userId },
      include: { brand: true },
    }),
  ]);
  const memberBrands = memberships.map(m => m.brand);
  // Merge + deduplicate (owner can't also be listed as member)
  const map = new Map<string, (typeof owned)[number]>();
  for (const b of [...owned, ...memberBrands]) map.set(b.id, b);
  return [...map.values()].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

// Returns true if userId is the brand owner OR a brand member
async function canAccessBrand(brandId: string, userId: string): Promise<boolean> {
  const [brand, member] = await Promise.all([
    findBrandById(brandId),
    findBrandMember(brandId, userId),
  ]);
  if (!brand) return false;
  if (brand.ownerId === userId) return true;
  return !!member;
}

// ─── Shared Data Items ────────────────────────────────────────────────────────

async function createSharedDataItem(data: {
  brandId: string;
  uploadedById: string;
  source: string;
  name: string;
  dataType?: string;
  recordCount?: number;
  status?: string;
  dataSourceId?: string;
  error?: string;
}) {
  return prisma.sharedDataItem.create({ data });
}

async function findSharedDataItems(brandId: string, filters: { status?: string } = {}) {
  return prisma.sharedDataItem.findMany({
    where: { brandId, ...(filters.status ? { status: filters.status } : {}) },
    include: {
      uploadedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
}

async function updateSharedDataItem(id: string, data: { status: string }) {
  return prisma.sharedDataItem.update({ where: { id }, data });
}

async function deleteSharedDataItem(id: string) {
  return prisma.sharedDataItem.delete({ where: { id } });
}

async function countPendingSharedData(brandId: string) {
  return prisma.sharedDataItem.count({ where: { brandId, status: 'pending' } });
}

// ─── Fulfillment Pipeline ─────────────────────────────────────────────────────

async function findFulfillmentByBrand(brandId: string, filters: {
  status?: string; start_date?: string; end_date?: string; range?: string;
} = {}) {
  const where: Prisma.FulfillmentOrderWhereInput = { brandId };
  if (filters.status) where.status = filters.status;
  const dateRange = resolveRange(filters);
  if (dateRange.gte || dateRange.lte) {
    where.createdAt = {};
    if (dateRange.gte) where.createdAt.gte = dateRange.gte;
    if (dateRange.lte) where.createdAt.lte = dateRange.lte;
  }
  return prisma.fulfillmentOrder.findMany({ where, orderBy: { createdAt: 'desc' } });
}

async function upsertFulfillmentOrder(data: {
  brandId: string; orderId: string;
  orderTriggerAt?: Date; picklistGeneratedAt?: Date; picklistCompleteAt?: Date;
  moveToPacklistAt?: Date; awbGeneratedAt?: Date; connectedToCourierAt?: Date;
  currentStep?: number; status?: string;
}) {
  const { brandId, orderId, ...rest } = data;
  return prisma.fulfillmentOrder.upsert({
    where: { brandId_orderId: { brandId, orderId } },
    update: { ...rest, updatedAt: new Date() },
    create: { brandId, orderId, ...rest },
  });
}

async function getFulfillmentSLA(brandId: string) {
  const config = await prisma.fulfillmentSLAConfig.findUnique({ where: { brandId } });
  return config ?? { brandId, step1Mins: 30, step2Mins: 60, step3Mins: 15, step4Mins: 30, step5Mins: 15 };
}

async function upsertFulfillmentSLA(brandId: string, data: {
  step1Mins?: number; step2Mins?: number; step3Mins?: number; step4Mins?: number; step5Mins?: number;
}) {
  return prisma.fulfillmentSLAConfig.upsert({
    where: { brandId },
    update: data,
    create: { brandId, ...data },
  });
}

async function deleteFulfillmentOrder(id: string) {
  return prisma.fulfillmentOrder.delete({ where: { id } });
}

// ─── Backward-compatibility aliases (legacy VPS routes / services) ────────────

const getAllBrands = () => prisma.brand.findMany({ orderBy: { createdAt: 'desc' } });
const getBrandById = findBrandById;
const getDataSourcesByBrand = findDataSourcesByBrand;
const getDataSourceById = findDataSourceById;
const getFreshdeskTicketsByBrand = findTicketsByBrand;
const getInventoryByBrand = findInventoryByBrand;
const getOrdersByBrand = findOrdersByBrand;
const getShopifyStoresByBrand = findShopifyStoresByBrand;
const getShopifyStoreById = findShopifyStoreById;
const addShopifyStore = createShopifyStore;
const getCustomersByBrand = findCustomersByBrand;
const getWarehousesByBrand = findWarehousesByBrand;
const getReturnsByBrand = findReturnsByBrand;
const getReportsByBrand = findReportsByBrand;

async function getReportById(id: string) {
  return prisma.report.findUnique({ where: { id } });
}

async function createShopifyMetrics(data: { storeId: string; brandId: string; ordersCount?: number; totalRevenue?: number }) {
  return prisma.shopifyMetrics.create({ data });
}

async function getShopifyMetricsByStores(storeIds: string[]) {
  return prisma.shopifyMetrics.findMany({
    where: { storeId: { in: storeIds } },
    orderBy: { timestamp: 'desc' },
  });
}

async function deleteDataSource(id: string) {
  return prisma.dataSource.delete({ where: { id } });
}

async function getOrderById(id: string) {
  return prisma.order.findUnique({ where: { id } });
}

async function getSyncLogsBySource(dataSourceId: string) {
  return prisma.syncLog.findMany({
    where: { dataSourceId },
    orderBy: { syncedAt: 'desc' },
    take: 50,
  });
}

async function upsertFreshdeskTickets(brandId: string, tickets: Array<Record<string, unknown>>) {
  await Promise.all(tickets.map(async (t) => {
    const id = String(t.id ?? '');
    if (!id) return;
    await prisma.freshdeskTicket.upsert({
      where: { id },
      update: { status: String(t.status ?? 'open'), subject: String(t.subject ?? '') },
      create: { id, brandId, subject: String(t.subject ?? ''), status: String(t.status ?? 'open'), priority: String(t.priority ?? 'medium') },
    }).catch(() => {});
  }));
}

async function storeSyncData(data: { brandId: string; dataSourceId: string; data: Prisma.InputJsonValue }) {
  return prisma.syncData.create({ data });
}

// ─── RBAC Policies ───────────────────────────────────────────────────────────

async function findRBACPolicies(brandId: string) {
  return prisma.rBACPolicy.findMany({ where: { brandId }, orderBy: { createdAt: 'asc' } });
}

async function createRBACPolicy(data: {
  brandId: string; name: string;
  team?: string | null; department?: string | null;
  allowedModules: string[];
}) {
  return prisma.rBACPolicy.create({ data: { ...data, allowedModules: data.allowedModules } });
}

async function updateRBACPolicy(id: string, data: Partial<{
  name: string; team: string | null; department: string | null; allowedModules: string[];
}>) {
  return prisma.rBACPolicy.update({ where: { id }, data });
}

async function deleteRBACPolicy(id: string) {
  return prisma.rBACPolicy.delete({ where: { id } });
}

async function updateBrandMemberAttributes(id: string, data: { team?: string | null; department?: string | null }) {
  return prisma.brandMember.update({ where: { id }, data });
}

// ─── Delivery Profiles ────────────────────────────────────────────────────────

async function findDeliveryProfiles(brandId: string) {
  return prisma.deliveryProfile.findMany({ where: { brandId }, orderBy: { createdAt: 'desc' } });
}

async function findDeliveryProfile(id: string) {
  return prisma.deliveryProfile.findUnique({ where: { id } });
}

async function createDeliveryProfile(data: {
  brandId: string; name: string; description?: string; profileType?: string;
  metrics?: Prisma.InputJsonValue; recipients?: Prisma.InputJsonValue;
  emailSubject?: string; emailTemplate?: string; schedule?: string;
  scheduleCron?: string | null; scheduleHour?: number; scheduleDow?: number;
  dateRange?: string; isShared?: boolean; createdBy?: string | null;
  createdByEmail?: string | null; mailProvider?: string;
  nextRunAt?: Date | null; slackWebhookUrl?: string | null;
}) {
  return prisma.deliveryProfile.create({ data });
}

// Accepts any valid DeliveryProfile field; narrowed by Prisma at runtime.
async function updateDeliveryProfile(id: string, data: Partial<{
  name: string; description: string; profileType: string;
  metrics: Prisma.InputJsonValue; recipients: Prisma.InputJsonValue;
  emailSubject: string; emailTemplate: string; schedule: string;
  scheduleCron: string | null; scheduleHour: number; scheduleDow: number;
  dateRange: string; isShared: boolean; mailProvider: string;
  lastSent: Date; lastRunAt: Date; nextRunAt: Date | null;
  lastRunStatus: string; lastRunError: string | null;
  consecutiveFailures: number; paused: boolean; slackWebhookUrl: string | null;
}>) {
  return prisma.deliveryProfile.update({ where: { id }, data });
}

async function deleteDeliveryProfile(id: string) {
  return prisma.deliveryProfile.delete({ where: { id } });
}

async function findSharedDeliveryProfiles() {
  return prisma.deliveryProfile.findMany({ where: { isShared: true }, orderBy: { createdAt: 'desc' } });
}

async function findScheduledDueProfiles(now: Date) {
  return prisma.deliveryProfile.findMany({
    where: {
      schedule: { in: ['daily', 'weekly', 'custom'] },
      nextRunAt: { lte: now },
      paused: false,
    },
  });
}

// ─── Mailbox Configs ─────────────────────────────────────────────────────────

async function listMailboxConfigs() {
  return prisma.mailboxConfig.findMany({ orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] });
}

async function getDefaultMailbox(provider?: string) {
  const where: any = { status: 'connected' };
  if (provider) where.provider = provider;
  // Prefer explicit default, then most-recent-connected
  const def = await prisma.mailboxConfig.findFirst({ where: { ...where, isDefault: true } });
  if (def) return def;
  return prisma.mailboxConfig.findFirst({ where, orderBy: { updatedAt: 'desc' } });
}

async function findMailboxById(id: string) {
  return prisma.mailboxConfig.findUnique({ where: { id } });
}

async function upsertMailboxConfig(data: {
  provider: string; emailAddress: string;
  displayName?: string; isDefault?: boolean; isShared?: boolean;
  accessToken?: string | null; refreshToken?: string | null;
  expiresAt?: Date | null; tenantId?: string | null; scopes?: string | null;
  smtpHost?: string | null; smtpPort?: number | null; smtpUser?: string | null;
  smtpPassword?: string | null; smtpSecure?: boolean;
  createdById?: string | null; status?: string;
}) {
  const enc = { ...data };
  // Encrypt sensitive fields at rest. decryptMailboxSecrets() reverses this on read.
  if (typeof enc.accessToken === 'string' && enc.accessToken) enc.accessToken = encryptIfNeeded(enc.accessToken, ENCRYPTION_KEY);
  if (typeof enc.refreshToken === 'string' && enc.refreshToken) enc.refreshToken = encryptIfNeeded(enc.refreshToken, ENCRYPTION_KEY);
  if (typeof enc.smtpPassword === 'string' && enc.smtpPassword) enc.smtpPassword = encryptIfNeeded(enc.smtpPassword, ENCRYPTION_KEY);
  return prisma.mailboxConfig.upsert({
    where: { provider_emailAddress: { provider: enc.provider, emailAddress: enc.emailAddress } },
    update: { ...enc },
    create: { ...enc } as any,
  });
}

/** Decrypt sensitive fields for in-process use. Never expose this output to clients. */
export function decryptMailboxSecrets<T extends { accessToken?: string | null; refreshToken?: string | null; smtpPassword?: string | null } | null>(mb: T): T {
  if (!mb) return mb;
  const out: any = { ...mb };
  if (out.accessToken) out.accessToken = decryptIfNeeded(out.accessToken, ENCRYPTION_KEY);
  if (out.refreshToken) out.refreshToken = decryptIfNeeded(out.refreshToken, ENCRYPTION_KEY);
  if (out.smtpPassword) out.smtpPassword = decryptIfNeeded(out.smtpPassword, ENCRYPTION_KEY);
  return out;
}

async function updateMailboxConfig(id: string, data: Partial<{
  displayName: string; isDefault: boolean; isShared: boolean;
  accessToken: string | null; refreshToken: string | null;
  expiresAt: Date | null; tenantId: string | null; scopes: string | null;
  smtpHost: string | null; smtpPort: number | null; smtpUser: string | null;
  smtpPassword: string | null; smtpSecure: boolean;
  status: string; lastError: string | null;
}>) {
  const enc: any = { ...data };
  if (typeof enc.accessToken === 'string' && enc.accessToken) enc.accessToken = encryptIfNeeded(enc.accessToken, ENCRYPTION_KEY);
  if (typeof enc.refreshToken === 'string' && enc.refreshToken) enc.refreshToken = encryptIfNeeded(enc.refreshToken, ENCRYPTION_KEY);
  if (typeof enc.smtpPassword === 'string' && enc.smtpPassword) enc.smtpPassword = encryptIfNeeded(enc.smtpPassword, ENCRYPTION_KEY);
  return prisma.mailboxConfig.update({ where: { id }, data: enc });
}

async function deleteMailboxConfig(id: string) {
  return prisma.mailboxConfig.delete({ where: { id } });
}

// ─── Marketing Metrics (raw table — snake_case columns, not Prisma-managed) ──

async function upsertMarketingMetric(data: {
  brandId: string; dataSourceId?: string | null; source: string; date: Date;
  campaignName?: string | null; channel?: string | null;
  spend?: number; impressions?: number; clicks?: number; reach?: number;
  sessions?: number; users?: number; pageviews?: number;
}) {
  await prisma.$executeRaw`
    INSERT INTO marketing_metrics
      (brand_id, data_source_id, source, date, campaign_name, channel,
       spend, impressions, clicks, reach, sessions, users, pageviews, updated_at)
    VALUES
      (${data.brandId}, ${data.dataSourceId ?? null}, ${data.source}, ${data.date},
       ${data.campaignName ?? null}, ${data.channel ?? null},
       ${data.spend ?? 0}, ${data.impressions ?? 0}, ${data.clicks ?? 0},
       ${data.reach ?? 0}, ${data.sessions ?? 0}, ${data.users ?? 0},
       ${data.pageviews ?? 0}, now())
    ON CONFLICT (brand_id, source, date, campaign_name, channel) DO UPDATE SET
      spend        = EXCLUDED.spend,
      impressions  = EXCLUDED.impressions,
      clicks       = EXCLUDED.clicks,
      reach        = EXCLUDED.reach,
      sessions     = EXCLUDED.sessions,
      users        = EXCLUDED.users,
      pageviews    = EXCLUDED.pageviews,
      data_source_id = EXCLUDED.data_source_id,
      updated_at   = now()
  `;
}

// ─── Export ───────────────────────────────────────────────────────────────────

const repository = {
  // Users
  findUserByEmail, findUserById, createUser, updateUser, listUsers,
  // User Preferences
  getUserPreferences, updateUserPreferences,
  // Brands
  findBrandsByOwner, findBrandById, createBrand, updateBrand, deleteBrand,
  // Orders
  findOrdersByBrand, createOrder, upsertOrder, updateOrder,
  // Customers
  findCustomersByBrand, upsertCustomer,
  // Inventory
  findInventoryByBrand, createInventoryItem, upsertInventoryItem, updateInventoryItem, deleteInventoryItem,
  // Returns
  findReturnsByBrand, createReturn, updateReturn,
  // Data Sources
  findDataSourcesByBrand, findDataSourceById, createDataSource, updateDataSource,
  // Reports
  findReportsByBrand, createReport, updateReport, deleteReport,
  // Shopify
  findShopifyStoresByBrand, findShopifyStoreById, createShopifyStore,
  // OAuth Tokens
  saveOAuthToken, findOAuthToken, deleteOAuthToken,
  // Drive Ingested Files
  findDriveIngestedFile, upsertDriveIngestedFile,
  // Tickets
  findTicketsByBrand,
  // Audit
  createAuditLog, findAuditLogs,
  // Sync Logs
  createSyncLog, findSyncLogsByBrand,
  // Warehouses
  findWarehousesByBrand,
  // Alerts
  createAlert, findAlertsByBrand, countUnreadAlerts,
  markAlertRead, markAllAlertsRead, deleteOldAlerts,
  // Brand Members
  findAccessibleBrands,
  findBrandMembers, findBrandMember, addBrandMember, removeBrandMember, canAccessBrand,
  // Shared Data Items
  createSharedDataItem, findSharedDataItems, updateSharedDataItem, deleteSharedDataItem, countPendingSharedData,
  // Backward-compat aliases
  getAllBrands, getBrandById,
  getDataSourcesByBrand, getDataSourceById, deleteDataSource,
  getFreshdeskTicketsByBrand, upsertFreshdeskTickets,
  getInventoryByBrand, getOrdersByBrand, getOrderById,
  getShopifyStoresByBrand, getShopifyStoreById, addShopifyStore,
  getCustomersByBrand, getWarehousesByBrand, getReturnsByBrand,
  getReportsByBrand, getReportById,
  createShopifyMetrics, getShopifyMetricsByStores,
  getSyncLogsBySource, storeSyncData, upsertMarketingMetric,
  // Fulfillment
  findFulfillmentByBrand, upsertFulfillmentOrder, getFulfillmentSLA, upsertFulfillmentSLA, deleteFulfillmentOrder,
  // RBAC
  findRBACPolicies, createRBACPolicy, updateRBACPolicy, deleteRBACPolicy,
  updateBrandMemberAttributes,
  // Delivery Profiles
  findDeliveryProfiles, findDeliveryProfile, createDeliveryProfile, updateDeliveryProfile, deleteDeliveryProfile,
  findSharedDeliveryProfiles, findScheduledDueProfiles,
  // Mailbox Configs
  listMailboxConfigs, getDefaultMailbox, findMailboxById, upsertMailboxConfig, updateMailboxConfig, deleteMailboxConfig,
  // Prisma instance (for advanced queries)
  prisma,
};

export default repository;


