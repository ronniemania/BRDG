/**
 * File upload & export routes.
 */

import { Express, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import repository from '../database/repository';
import { ingestFileContent } from '../services/driveFolderService';
import { AuthRequest } from '../config/authMiddleware';

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/brdg-uploads';

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.csv', '.json', '.xlsx', '.xls'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type "${ext}". Accepted: .csv, .json, .xlsx`));
    }
  },
});

const ALLOWED_DATA_TYPES = new Set(['orders', 'inventory', 'customers', 'returns', 'fulfillment']);

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

export function setupFilesRoutes(app: Express) {
  app.post(
    '/api/files/upload',
    upload.array('files', 20),
    async (req: Request, res: Response) => {
      const uploadedFiles = (req as Request & { files?: Express.Multer.File[] }).files;

      try {
        const userId = (req as AuthRequest).userId;
        if (!userId) {
          return res.status(401).json({ message: 'Unauthorized' });
        }

        const { brandId, dataSourceId: bodyDsId, dataType: forceDataType } = req.body as {
          brandId?: string;
          dataSourceId?: string;
          dataType?: string;
        };

        if (!brandId) {
          return res.status(400).json({ message: 'brandId is required' });
        }

        const normalizedDataType = forceDataType?.toLowerCase();
        if (normalizedDataType && !ALLOWED_DATA_TYPES.has(normalizedDataType)) {
          return res.status(400).json({ message: 'dataType must be one of: orders, inventory, customers, returns, fulfillment' });
        }

        if (!await repository.canAccessBrand(brandId, userId)) {
          return res.status(403).json({ message: 'Brand not found or access denied' });
        }

        if (!uploadedFiles || uploadedFiles.length === 0) {
          return res.status(400).json({ message: 'No files uploaded. Use field name "files".' });
        }

        let dataSourceId = bodyDsId;
        if (!dataSourceId) {
          const ds = await repository.createDataSource({
            brandId,
            name: 'Manual Upload',
            type: 'file_upload',
            config: { uploadedBy: userId },
          });
          dataSourceId = ds.id;
        }

        const results = await Promise.all(uploadedFiles.map(async (file) => {
          const fileExt = path.extname(file.originalname).toLowerCase();
          let content = '';

          try {
            if (fileExt === '.xlsx' || fileExt === '.xls') {
              let XLSX: {
                read: (data: Buffer) => { Sheets: Record<string, unknown>; SheetNames: string[] };
                utils: { sheet_to_csv: (sheet: unknown) => string };
              };
              try {
                XLSX = require('xlsx'); // eslint-disable-line @typescript-eslint/no-var-requires
              } catch {
                return {
                  fileName: file.originalname,
                  recordCount: 0,
                  status: 'error' as const,
                  error: 'Excel support requires the xlsx package. Run: npm install xlsx on the server.',
                };
              }
              const workbook = XLSX.read(fs.readFileSync(file.path));
              const firstSheetName = workbook.SheetNames[0];
              const sheet = workbook.Sheets[firstSheetName];
              content = XLSX.utils.sheet_to_csv(sheet);
            } else {
              content = fs.readFileSync(file.path, 'utf8');
            }
          } catch (err: unknown) {
            return {
              fileName: file.originalname,
              recordCount: 0,
              status: 'error' as const,
              error: `Could not read file: ${getErrorMessage(err)}`,
            };
          } finally {
            fs.unlink(file.path, () => {});
          }

          const ingestName = normalizedDataType ? `${normalizedDataType}_${file.originalname}` : file.originalname;
          const result = await ingestFileContent(dataSourceId, brandId, ingestName, content);

          await repository.createSharedDataItem({
            brandId,
            uploadedById: userId,
            source: 'csv_upload',
            name: file.originalname,
            dataType: result.dataType,
            recordCount: result.recordCount,
            status: 'pending',
            dataSourceId,
            error: result.error,
          }).catch(() => {});

          return result;
        }));

        const totalRecords = results.reduce((s, r) => s + (r.recordCount ?? 0), 0);
        const hasErrors = results.some(r => r.status === 'error');

        await repository.updateDataSource(dataSourceId, {
          syncStatus: hasErrors ? 'error' : 'ok',
          lastSync: new Date(),
          recordCount: totalRecords,
        });

        return res.json({
          message: `Processed ${results.length} file(s)`,
          dataSourceId,
          results,
        });
      } catch (err: unknown) {
        if (uploadedFiles) {
          for (const f of uploadedFiles) {
            fs.unlink(f.path, () => {});
          }
        }
        return res.status(500).json({ message: getErrorMessage(err) });
      }
    },
  );

  app.get('/api/files/export/:type', async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const { type } = req.params;
      const { brandId } = req.query as { brandId?: string };
      const allowed = ['orders', 'inventory', 'customers', 'returns'];

      if (!allowed.includes(type)) {
        return res.status(400).json({ message: `type must be one of: ${allowed.join(', ')}` });
      }
      if (!brandId) {
        return res.status(400).json({ message: 'brandId is required' });
      }

      const brand = await repository.findBrandById(brandId);
      if (!brand || brand.ownerId !== userId) {
        return res.status(403).json({ message: 'Brand not found or access denied' });
      }

      const headers: Record<string, string> = {
        orders: 'order_id,customer_name,amount,status,order_date,dispatch_date',
        inventory: 'sku,name,stock_level,category,cost_price,sale_price,reorder_level',
        customers: 'email,name,total_orders,total_spent,last_order_date',
        returns: 'order_id,customer_name,amount,reason,status,channel,sku',
      };

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${type}-${Date.now()}.csv"`);
      return res.send(headers[type] + '\n');
    } catch (err: unknown) {
      return res.status(500).json({ message: getErrorMessage(err) });
    }
  });
}
