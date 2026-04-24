/**
 * Google Drive Folder Ingestion Service
 *
 * Reads files from a locally-mounted Google Drive folder (e.g. via rclone mount),
 * parses CSV and JSON files, maps columns to the correct DB tables, and upserts the
 * data — skipping files that haven't changed since the last run.
 *
 * Data source type: 'google_drive_folder'
 * Config shape:    { folderPath: '/mnt/gdrive/brand-folder' }
 *
 * Supported file types: .csv, .json
 * Supported data types (detected from filename and/or headers):
 *   orders, inventory, customers, returns
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import repository from '../database/repository';

// ─── CSV Parser (no external dependency) ────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseCsv(content: string): Record<string, string>[] {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map(h => h.trim());
  const records: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCsvLine(line);
    const rec: Record<string, string> = {};
    headers.forEach((h, idx) => { rec[h] = (values[idx] ?? '').trim(); });
    records.push(rec);
  }
  return records;
}

// ─── Header Normalisation ────────────────────────────────────────────────────

function normalise(key: string): string {
  return key.toLowerCase().replace(/[\s_\-]+/g, '');
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

function buildNormalisedRow(row: Record<string, string>): Record<string, string> {
  const normRow: Record<string, string> = {};
  for (const k of Object.keys(row)) normRow[normalise(k)] = row[k];
  return normRow;
}

function pickFromNormalised(normRow: Record<string, string>, ...candidates: string[]): string {
  for (const c of candidates) {
    const v = normRow[normalise(c)];
    if (v !== undefined && v !== '') return v;
  }
  return '';
}

// ─── Data Type Detection ─────────────────────────────────────────────────────

type DataType = 'orders' | 'inventory' | 'customers' | 'returns' | 'fulfillment' | 'unknown';

function detectDataType(fileName: string, headers: string[]): DataType {
  const name = normalise(path.basename(fileName, path.extname(fileName)));
  const normHeaders = headers.map(normalise);

  // Explicit type prefix (set by upload endpoint when user forces a type)
  if (name.startsWith('fulfillment')) return 'fulfillment';
  if (name.startsWith('orders'))      return 'orders';
  if (name.startsWith('inventory'))   return 'inventory';
  if (name.startsWith('customers'))   return 'customers';
  if (name.startsWith('returns'))     return 'returns';

  // Filename-based detection (takes priority)
  if (/fulfil|picklist|dispatch.*pipeline|awb.*courier|courier.*awb/.test(name)) return 'fulfillment';
  if (/order/.test(name)) return 'orders';
  if (/inventory|stock|product/.test(name)) return 'inventory';
  if (/customer|client/.test(name)) return 'customers';
  if (/return|refund/.test(name)) return 'returns';

  // Header-based detection — fulfillment has distinctive columns
  const hasPicklist = normHeaders.some(h => h.includes('picklist'));
  const hasAwb = normHeaders.some(h => h.includes('awb'));
  const hasCourier = normHeaders.some(h => h.includes('courier') || h.includes('handover'));
  if (hasPicklist || (hasAwb && hasCourier)) return 'fulfillment';

  if (normHeaders.includes('orderid') || normHeaders.includes('ordernumber')) return 'orders';
  if (normHeaders.includes('sku') || normHeaders.includes('stocklevel') || normHeaders.includes('quantity')) return 'inventory';
  if (normHeaders.includes('totalspent') || normHeaders.includes('lifetimevalue') || normHeaders.includes('ltv')) return 'customers';
  if (normHeaders.includes('returnreason') || normHeaders.includes('refundamount')) return 'returns';

  // Fallback: if order_id is present alongside amount, likely orders
  if (normHeaders.some(h => h.includes('orderid')) && normHeaders.some(h => ['amount','total','price'].includes(h))) return 'orders';

  return 'unknown';
}

// ─── Row Importers ───────────────────────────────────────────────────────────

async function importOrders(brandId: string, rows: Record<string, string>[]): Promise<number> {
  const normalisedRows = rows.map(row => ({ row, norm: buildNormalisedRow(row) }));
  const orderIds = Array.from(new Set(
    normalisedRows
      .map(({ norm }) => pickFromNormalised(norm, 'order_id', 'orderId', 'Order ID', 'id', 'Order Number', 'order_number', 'Name', 'name', '#', 'order_name'))
      .filter(Boolean),
  ));
  const existingFulfillment = orderIds.length > 0
    ? await repository.prisma.fulfillmentOrder.findMany({
      where: { brandId, orderId: { in: orderIds } },
      select: { orderId: true, orderTriggerAt: true },
    })
    : [];
  const fulfillmentByOrderId = new Map(existingFulfillment.map((f) => [f.orderId, f]));

  let count = 0;
  for (const { norm } of normalisedRows) {
    const orderId = pickFromNormalised(norm, 'order_id', 'orderId', 'Order ID', 'id', 'Order Number', 'order_number',
      'Name', 'name', '#', 'order_name');
    if (!orderId) continue;
    const customerName = pickFromNormalised(norm, 'customer_name', 'customerName', 'Customer Name', 'customer', 'name',
      'Billing Name', 'billing_name', 'Ship Name', 'Shipping Name') || 'Unknown';
    const amountRaw = pickFromNormalised(norm, 'amount', 'total', 'total_price', 'Total Price', 'price', 'revenue',
      'sale_price', 'Total', 'Subtotal', 'subtotal', 'Grand Total', 'grand_total');
    const amount = parseFloat(amountRaw) || 0;
    const status = pickFromNormalised(norm, 'status', 'Status', 'order_status', 'fulfillment_status', 'payment_status',
      'Financial Status', 'financial_status', 'Fulfillment Status', 'fulfillment status') || 'pending';
    const orderDateRaw = pickFromNormalised(norm, 'order_date', 'orderDate', 'Order Date', 'date', 'created_at',
      'Created at', 'Created At', 'Paid at', 'paid_at', 'Date', 'timestamp');
    const orderDate = orderDateRaw ? new Date(orderDateRaw) : new Date();
    const dispatchDateRaw = pickFromNormalised(norm, 'dispatch_date', 'dispatchDate', 'Dispatch Date', 'shipped_date',
      'shippedDate', 'fulfillment_date', 'Shipped at', 'shipped_at', 'Delivery Date');
    const dispatchDate = dispatchDateRaw ? new Date(dispatchDateRaw) : undefined;
    const hoursToDispatch = (dispatchDate && orderDate)
      ? (dispatchDate.getTime() - orderDate.getTime()) / 3600000
      : undefined;

    const validOrderDate = !isNaN(orderDate.getTime()) ? orderDate : new Date();

    await repository.upsertOrder({
      brandId, orderId, customerName, amount, status,
      orderDate: validOrderDate,
      dispatchDate: dispatchDate && !isNaN(dispatchDate.getTime()) ? dispatchDate : undefined,
      hoursToDispatch: hoursToDispatch !== undefined && hoursToDispatch >= 0 ? hoursToDispatch : undefined,
    });

    // ── Auto-seed fulfillment pipeline with order trigger time ────────────────
    // The order creation time IS the "Order Trigger" step in the pipeline.
    // Only creates a record if one doesn't exist; never overwrites existing data.
    try {
      const existingFF = fulfillmentByOrderId.get(orderId);
      if (!existingFF) {
        // Fresh record — seed with order date as trigger time
        await repository.upsertFulfillmentOrder({
          brandId, orderId,
          orderTriggerAt: validOrderDate,
          currentStep: 1,
          status: 'in_progress',
        });
        fulfillmentByOrderId.set(orderId, { orderId, orderTriggerAt: validOrderDate });
      } else if (!existingFF.orderTriggerAt) {
        // Record exists but trigger time is missing — backfill it only
        await repository.prisma.fulfillmentOrder.update({
          where: { brandId_orderId: { brandId, orderId } },
          data: { orderTriggerAt: validOrderDate, updatedAt: new Date() },
        });
        fulfillmentByOrderId.set(orderId, { orderId, orderTriggerAt: validOrderDate });
      }
    } catch {
      // Non-critical — order was saved, fulfillment seed is best-effort
    }

    count++;
  }
  return count;
}

async function importInventory(brandId: string, rows: Record<string, string>[]): Promise<number> {
  let count = 0;
  for (const row of rows) {
    const norm = buildNormalisedRow(row);
    const sku = pickFromNormalised(norm, 'sku', 'SKU', 'product_sku', 'item_code', 'code');
    if (!sku) continue;
    const name = pickFromNormalised(norm, 'name', 'product_name', 'productName', 'Product Name', 'title', 'item', 'description') || sku;
    const stock = Math.max(0, parseInt(pickFromNormalised(norm, 'stock_level', 'stockLevel', 'quantity', 'qty', 'stock', 'Stock Level', 'Quantity') || '0', 10) || 0);
    const category = pickFromNormalised(norm, 'category', 'Category', 'type', 'product_type', 'productType') || 'General';
    const costPrice = parseFloat(pickFromNormalised(norm, 'cost_price', 'costPrice', 'Cost Price', 'cost') || '0');
    const salePrice = parseFloat(pickFromNormalised(norm, 'sale_price', 'salePrice', 'Sale Price', 'price', 'selling_price') || '0');
    const rp = Math.max(0, parseInt(pickFromNormalised(norm, 'reorder_level', 'reorderLevel', 'reorder_point', 'reorderPoint', 'min_stock', 'Reorder Level', 'Reorder Point') || '10', 10) || 10);
    const maxStock = Math.max(1, parseInt(pickFromNormalised(norm, 'max_stock', 'maxStock', 'Max Stock', 'max_quantity') || '100', 10) || 100);

    // Bin classification: maps common column names and value variants
    const rawBin = pickFromNormalised(norm, 'bin_type', 'binType', 'Bin Type', 'bin', 'condition', 'Condition', 'item_condition', 'quality', 'bin_status').toLowerCase();
    const binType = rawBin.includes('damage') || rawBin.includes('defect') || rawBin.includes('broken') ? 'damaged'
      : rawBin.includes('expir') || rawBin.includes('obsolete') || rawBin.includes('dead') ? 'expired'
      : 'sellable';

    const status = stock === 0 ? 'out_of_stock' : stock <= rp ? 'low_stock' : 'in_stock';

    await repository.upsertInventoryItem({
      brandId, sku, name,
      stockLevel: stock, category,
      costPrice: isNaN(costPrice) ? 0 : costPrice,
      salePrice: isNaN(salePrice) ? 0 : salePrice,
      reorderLevel: rp,
      reorderPoint: rp,
      maxStock,
      status,
      binType,
      trackedOnDashboard: status !== 'out_of_stock',
    });

    count++;
  }
  return count;
}

async function importCustomers(brandId: string, rows: Record<string, string>[]): Promise<number> {
  let count = 0;
  for (const row of rows) {
    const norm = buildNormalisedRow(row);
    const email = pickFromNormalised(norm,
      'email', 'Email', 'email_address', 'emailAddress',
      'Email Address', 'Customer Email', 'customer_email',
    );
    const firstName = pickFromNormalised(norm, 'first_name', 'firstName', 'First Name', 'First name');
    const lastName  = pickFromNormalised(norm, 'last_name', 'lastName', 'Last Name', 'Last name');
    const fullName  = pickFromNormalised(norm, 'name', 'Name', 'customer_name', 'customerName', 'full_name', 'fullName');
    const name = fullName || [firstName, lastName].filter(Boolean).join(' ') || 'Unknown';
    if (!email && name === 'Unknown') continue;

    const totalOrders = parseInt(pickFromNormalised(norm,
      'total_orders', 'totalOrders', 'Total Orders', 'orders', 'order_count',
      'Orders Count', 'orders_count', 'Total Order Count',
    ) || '0', 10);
    const totalSpent = parseFloat(pickFromNormalised(norm,
      'total_spent', 'totalSpent', 'Total Spent', 'revenue', 'lifetime_value', 'ltv',
      'Total Spend', 'Lifetime Spend', 'Amount Spent', 'amount_spent',
    ) || '0');
    const lastOrderDateRaw = pickFromNormalised(norm,
      'last_order_date', 'lastOrderDate', 'Last Order Date', 'last_purchase',
      'Last Order', 'last_order', 'Latest Order Date',
    );
    const lastOrderDate = lastOrderDateRaw ? new Date(lastOrderDateRaw) : undefined;

    await repository.upsertCustomer(brandId, email || `noemail_${name.toLowerCase().replace(/\s+/g, '_')}`, {
      name,
      totalOrders: isNaN(totalOrders) ? 0 : totalOrders,
      totalSpent: isNaN(totalSpent) ? 0 : totalSpent,
      lastOrderDate: lastOrderDate && !isNaN(lastOrderDate.getTime()) ? lastOrderDate : undefined,
    }).catch(() => {});

    count++;
  }
  return count;
}

async function importFulfillment(brandId: string, rows: Record<string, string>[]): Promise<number> {
  let count = 0;
  for (const row of rows) {
    const norm = buildNormalisedRow(row);
    const orderId = pickFromNormalised(norm, 'order_id', 'orderId', 'Order ID', 'id', 'Order Number', 'order_number');
    if (!orderId) continue;

    const parseTs = (val: string): Date | undefined => {
      if (!val) return undefined;
      const d = new Date(val);
      return isNaN(d.getTime()) ? undefined : d;
    };

    // orderTriggerAt — from fulfillment sheet OR the orders sheet (Shopify created_at / order date)
    const orderTriggerAt      = parseTs(pickFromNormalised(norm,
      'order_trigger_at', 'orderTriggerAt', 'Order Trigger Time', 'order_trigger', 'trigger_time',
      'order_triggered_at', 'trigger_at',
      // Shopify / order-sheet fallbacks
      'order_date', 'orderDate', 'Order Date', 'created_at', 'Created at', 'Created At',
      'Date', 'Paid at', 'paid_at', 'timestamp',
    ));
    // picklistGeneratedAt — when picklist was generated in the OMS / WMS
    const picklistGeneratedAt = parseTs(pickFromNormalised(norm,
      'picklist_generated_at', 'picklistGeneratedAt', 'Picklist Generation Time',
      'picklist_generated', 'picklist_generation_time', 'picklist_gen_at', 'picklist_gen',
      'Picklist Time', 'picklist_time', 'Pick List Generated', 'pick_list_generated',
    ));
    // picklistCompleteAt — when pick was finished
    const picklistCompleteAt  = parseTs(pickFromNormalised(norm,
      'picklist_complete_at', 'picklistCompleteAt', 'Picklist Complete Time',
      'picklist_complete', 'picklist_completed_at', 'picklist_completion_time',
      'Pick Complete', 'pick_complete', 'Picking Done', 'picking_done', 'Pick End Time',
    ));
    // moveToPacklistAt — when items moved to packing station
    const moveToPacklistAt    = parseTs(pickFromNormalised(norm,
      'move_to_packlist_at', 'moveToPacklistAt', 'Move to Packlist Time',
      'move_to_packlist', 'packlist_time', 'packlist_move_at', 'move_packlist',
      'Pack Start', 'pack_start', 'Packing Time', 'packing_time', 'Pack List Time',
    ));
    // awbGeneratedAt — when AWB/shipping label was generated
    const awbGeneratedAt      = parseTs(pickFromNormalised(norm,
      'awb_generated_at', 'awbGeneratedAt', 'AWB Generated', 'awb_generated', 'awb_time',
      'awb_gen_at', 'awb',
      'Label Generated', 'label_generated', 'Shipping Label', 'shipping_label',
      'AWB Time', 'Manifest Time', 'manifest_time',
    ));
    // connectedToCourierAt — handoff to courier/3PL
    const connectedToCourierAt = parseTs(pickFromNormalised(norm,
      'connected_to_courier_at', 'connectedToCourierAt', 'Connected to Courier',
      'courier_connected', 'handover_time', 'courier_handover', 'connected_courier',
      'Pickup Time', 'pickup_time', 'Dispatched At', 'dispatched_at', 'Courier Pickup',
      'courier_pickup', 'Handover', 'handover', 'Shipped At', 'shipped_at',
    ));

    const currentStep = [orderTriggerAt, picklistGeneratedAt, picklistCompleteAt, moveToPacklistAt, awbGeneratedAt, connectedToCourierAt].filter(Boolean).length;
    const status = connectedToCourierAt ? 'completed' : currentStep === 0 ? 'pending' : 'in_progress';

    await repository.upsertFulfillmentOrder({
      brandId, orderId,
      orderTriggerAt, picklistGeneratedAt, picklistCompleteAt,
      moveToPacklistAt, awbGeneratedAt, connectedToCourierAt,
      currentStep, status,
    });

    count++;
  }
  return count;
}

async function importReturns(brandId: string, rows: Record<string, string>[]): Promise<number> {
  let count = 0;
  for (const row of rows) {
    const norm = buildNormalisedRow(row);
    const orderId = pickFromNormalised(norm, 'order_id', 'orderId', 'Order ID', 'id', 'return_id', 'returnId');
    if (!orderId) continue;
    const customerName = pickFromNormalised(norm, 'customer_name', 'customerName', 'Customer Name', 'customer') || 'Unknown';
    const amount = parseFloat(pickFromNormalised(norm, 'amount', 'refund_amount', 'refundAmount', 'Refund Amount', 'value') || '0');
    const reason = pickFromNormalised(norm, 'reason', 'Reason', 'return_reason', 'returnReason', 'Return Reason') || '';
    const status = pickFromNormalised(norm, 'status', 'Status', 'return_status', 'returnStatus') || 'pending';
    const channel = pickFromNormalised(norm, 'channel', 'Channel', 'return_channel') || '';
    const sku = pickFromNormalised(norm, 'sku', 'SKU', 'product_sku') || '';

    await repository.createReturn({
      brandId, orderId, customerName,
      amount: isNaN(amount) ? 0 : amount,
      reason, status, channel, sku,
    }).catch(() => {});

    count++;
  }
  return count;
}

// ─── File Hash ───────────────────────────────────────────────────────────────

function md5(content: string | Buffer): string {
  return crypto.createHash('md5').update(content).digest('hex');
}

// ─── Main Sync ───────────────────────────────────────────────────────────────

// ─── Single-file Ingest (used by manual upload endpoint) ────────────────────

export interface IngestResult {
  fileName: string;
  dataType: DataType;
  recordCount: number;
  status: 'ok' | 'error';
  error?: string;
}

export async function ingestFileContent(
  dataSourceId: string,
  brandId: string,
  fileName: string,
  content: string,
): Promise<IngestResult> {
  let rows: Record<string, string>[];
  try {
    if (/\.json$/i.test(fileName)) {
      const parsed = JSON.parse(content);
      rows = Array.isArray(parsed) ? parsed : [parsed];
    } else {
      rows = parseCsv(content);
    }
  } catch (err: unknown) {
    return { fileName, dataType: 'unknown', recordCount: 0, status: 'error', error: `Parse error: ${getErrorMessage(err)}` };
  }

  if (rows.length === 0) {
    return { fileName, dataType: 'unknown', recordCount: 0, status: 'ok' };
  }

  const headers = Object.keys(rows[0]);
  const dataType = detectDataType(fileName, headers);

  let recordCount = 0;
  let importError: string | undefined;

  try {
    switch (dataType) {
      case 'orders':      recordCount = await importOrders(brandId, rows); break;
      case 'inventory':   recordCount = await importInventory(brandId, rows); break;
      case 'customers':   recordCount = await importCustomers(brandId, rows); break;
      case 'returns':     recordCount = await importReturns(brandId, rows); break;
      case 'fulfillment': recordCount = await importFulfillment(brandId, rows); break;
      default:
        importError = `Cannot determine data type for "${fileName}". Rename it to include "orders", "inventory", "customers", "returns", or "fulfillment", or use recognised column headers.`;
    }
  } catch (err: unknown) {
    importError = getErrorMessage(err);
  }

  const hash = md5(content);
  await repository.upsertDriveIngestedFile({
    dataSourceId, brandId, fileName, fileHash: hash,
    recordCount,
    status: importError ? 'error' : 'processed',
    error: importError,
  });

  return { fileName, dataType, recordCount, status: importError ? 'error' : 'ok', error: importError };
}

// ─── Drive Folder Sync ───────────────────────────────────────────────────────

export interface DriveSyncResult {
  filesScanned: number;
  filesSkipped: number;   // unchanged since last run
  filesProcessed: number;
  filesErrored: number;
  totalRecords: number;
  details: Array<{ file: string; type: DataType; records: number; status: 'ok' | 'skip' | 'error'; error?: string }>;
}

export async function syncDriveFolder(
  dataSourceId: string,
  brandId: string,
  folderPath: string,
): Promise<DriveSyncResult> {
  const result: DriveSyncResult = {
    filesScanned: 0, filesSkipped: 0, filesProcessed: 0,
    filesErrored: 0, totalRecords: 0, details: [],
  };

  if (!folderPath || !fs.existsSync(folderPath)) {
    throw new Error(`Drive folder not found: "${folderPath}". Check GDRIVE_FOLDER_PATH or data source config.`);
  }

  const entries = fs.readdirSync(folderPath);
  const supported = entries.filter(f => /\.(csv|json)$/i.test(f));
  result.filesScanned = supported.length;
  const existingFiles = supported.length > 0
    ? await repository.prisma.driveIngestedFile.findMany({
      where: { dataSourceId, fileName: { in: supported } },
      select: { fileName: true, fileHash: true, status: true, recordCount: true },
    })
    : [];
  const existingByFile = new Map(existingFiles.map((f) => [f.fileName, f]));

  for (const fileName of supported) {
    const filePath = path.join(folderPath, fileName);
    let fileContent: string;
    try {
      fileContent = fs.readFileSync(filePath, 'utf8');
    } catch (err: unknown) {
      result.filesErrored++;
      result.details.push({ file: fileName, type: 'unknown', records: 0, status: 'error', error: `Cannot read file: ${getErrorMessage(err)}` });
      continue;
    }

    const hash = md5(fileContent);

    // Skip if the file hasn't changed since last successful ingestion
    const existing = existingByFile.get(fileName);
    if (existing && existing.fileHash === hash && existing.status === 'processed') {
      result.filesSkipped++;
      result.details.push({ file: fileName, type: 'unknown', records: existing.recordCount, status: 'skip' });
      continue;
    }

    // Parse rows
    let rows: Record<string, string>[];
    try {
      if (/\.json$/i.test(fileName)) {
        const parsed = JSON.parse(fileContent);
        rows = Array.isArray(parsed) ? parsed : [parsed];
      } else {
        rows = parseCsv(fileContent);
      }
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      await repository.upsertDriveIngestedFile({ dataSourceId, brandId, fileName, fileHash: hash, recordCount: 0, status: 'error', error: `Parse error: ${message}` });
      result.filesErrored++;
      result.details.push({ file: fileName, type: 'unknown', records: 0, status: 'error', error: `Parse error: ${message}` });
      continue;
    }

    if (rows.length === 0) {
      await repository.upsertDriveIngestedFile({ dataSourceId, brandId, fileName, fileHash: hash, recordCount: 0, status: 'processed' });
      result.filesProcessed++;
      result.details.push({ file: fileName, type: 'unknown', records: 0, status: 'ok' });
      continue;
    }

    const headers = Object.keys(rows[0]);
    const dataType = detectDataType(fileName, headers);

    let recordCount = 0;
    let importError: string | undefined;

    try {
      switch (dataType) {
        case 'orders':      recordCount = await importOrders(brandId, rows); break;
        case 'inventory':   recordCount = await importInventory(brandId, rows); break;
        case 'customers':   recordCount = await importCustomers(brandId, rows); break;
        case 'returns':     recordCount = await importReturns(brandId, rows); break;
        case 'fulfillment': recordCount = await importFulfillment(brandId, rows); break;
        default:
          importError = `Could not determine data type for "${fileName}". Rename the file to include "orders", "inventory", "customers", "returns", or "fulfillment", or use matching column headers.`;
      }
    } catch (err: unknown) {
      importError = getErrorMessage(err);
    }

    await repository.upsertDriveIngestedFile({
      dataSourceId, brandId, fileName, fileHash: hash,
      recordCount,
      status: importError ? 'error' : 'processed',
      error: importError,
    });

    if (importError) {
      result.filesErrored++;
      result.details.push({ file: fileName, type: dataType, records: recordCount, status: 'error', error: importError });
    } else {
      result.filesProcessed++;
      result.totalRecords += recordCount;
      result.details.push({ file: fileName, type: dataType, records: recordCount, status: 'ok' });
    }
  }

  return result;
}

