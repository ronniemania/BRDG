import { Express, Request, Response } from 'express';
import repository from '../database/repository';
import { ValidationError, NotFoundError } from '../utils/errors';
import { syncDriveFolder } from '../services/driveFolderService';
import { DEFAULT_GDRIVE_FOLDER } from '../config/constants';

async function getBrandId(req: Request): Promise<string> {
  const brandId = req.query.brandId as string;
  if (!brandId) throw new ValidationError('brandId is required');
  const brand = await repository.findBrandById(brandId);
  if (!brand) throw new NotFoundError('Brand not found');
  const userId = (req as any).userId;
  if (!await repository.canAccessBrand(brandId, userId)) throw new ValidationError('Forbidden');
  return brand.id;
}

export function setupDataSourceRoutes(app: Express) {
  // List data sources
  app.get('/api/data-sources', async (req: Request, res: Response) => {
    try {
      const brandId = await getBrandId(req);
      const sources = await repository.findDataSourcesByBrand(brandId);
      const syncLogs = await repository.findSyncLogsByBrand(brandId);
      res.json({ sources, recentSyncs: syncLogs.slice(0, 20) });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // Create data source
  app.post('/api/data-sources', async (req: Request, res: Response) => {
    try {
      const brandId = await getBrandId(req);
      const { name, type, config } = req.body;
      if (!name || !type) throw new ValidationError('name and type are required');
      const source = await repository.createDataSource({ brandId, name, type, config: config || {} });
      res.status(201).json({ source });
    } catch (err: any) {
      res.status(err.status || 400).json({ message: err.message });
    }
  });

  // Get data source
  app.get('/api/data-sources/:id', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId as string;
      const source = await repository.findDataSourceById(req.params.id);
      if (!source) throw new NotFoundError('Data source not found');
      if (!await repository.canAccessBrand(source.brandId, userId)) throw new ValidationError('Forbidden');
      res.json({ source });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // Trigger manual sync
  app.post('/api/data-sources/:id/sync', async (req: Request, res: Response) => {
    try {
      const source = await repository.findDataSourceById(req.params.id);
      if (!source) throw new NotFoundError('Data source not found');

      const userId = (req as any).userId as string;
      if (!await repository.canAccessBrand(source.brandId, userId)) throw new ValidationError('Forbidden');

      await repository.updateDataSource(req.params.id, { syncStatus: 'syncing', lastError: null });

      const syncLog = await repository.createSyncLog({
        brandId: source.brandId,
        dataSourceId: source.id,
        status: 'started',
        recordCount: 0,
      });

      // Run Drive folder sync in background; respond immediately
      if (source.type === 'google_drive_folder') {
        const config = (source.config ?? {}) as Record<string, any>;
        const folderPath = config.folderPath || DEFAULT_GDRIVE_FOLDER;

        setImmediate(async () => {
          try {
            const result = await syncDriveFolder(source.id, source.brandId, folderPath);
            await repository.updateDataSource(req.params.id, {
              syncStatus: 'active',
              lastSync: new Date(),
              recordCount: (source.recordCount || 0) + result.totalRecords,
              lastError: result.filesErrored > 0
                ? `${result.filesErrored} file(s) had errors — check sync logs`
                : null,
            });
            await repository.createSyncLog({
              brandId: source.brandId,
              dataSourceId: source.id,
              status: result.filesErrored > 0 ? 'partial' : 'completed',
              recordCount: result.totalRecords,
              error: result.filesErrored > 0 ? `${result.filesErrored} file(s) failed` : undefined,
            });
            // Add to shared data feed so all brand members can see this sync
            if (result.filesProcessed > 0) {
              await repository.createSharedDataItem({
                brandId: source.brandId,
                uploadedById: userId,
                source: 'google_drive',
                name: `Google Drive — ${result.filesProcessed} file(s) synced from "${source.name}"`,
                dataType: 'mixed',
                recordCount: result.totalRecords,
                status: 'pending',
                dataSourceId: source.id,
                error: result.filesErrored > 0 ? `${result.filesErrored} file(s) had errors` : undefined,
              }).catch(() => {});
            }
          } catch (err: any) {
            await repository.updateDataSource(req.params.id, { syncStatus: 'error', lastError: err.message });
            await repository.createSyncLog({
              brandId: source.brandId,
              dataSourceId: source.id,
              status: 'error',
              error: err.message,
            });
          }
        });
      } else {
        // Placeholder for other source types
        setTimeout(async () => {
          try {
            await repository.updateDataSource(req.params.id, {
              syncStatus: 'active',
              lastSync: new Date(),
              recordCount: source.recordCount || 0,
            });
            await repository.createSyncLog({
              brandId: source.brandId,
              dataSourceId: source.id,
              status: 'completed',
              recordCount: 0,
            });
          } catch { /* best effort */ }
        }, 3000);
      }

      res.json({ message: 'Sync started', syncLogId: syncLog.id });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // Update data source config
  app.patch('/api/data-sources/:id', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId as string;
      const source = await repository.findDataSourceById(req.params.id);
      if (!source) throw new NotFoundError('Data source not found');
      if (!await repository.canAccessBrand(source.brandId, userId)) throw new ValidationError('Forbidden');
      const updated = await repository.prisma.dataSource.update({
        where: { id: req.params.id },
        data: req.body,
      });
      res.json({ source: updated });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // Delete data source
  app.delete('/api/data-sources/:id', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId as string;
      const source = await repository.findDataSourceById(req.params.id);
      if (!source) throw new NotFoundError('Data source not found');
      if (!await repository.canAccessBrand(source.brandId, userId)) throw new ValidationError('Forbidden');
      await repository.prisma.dataSource.delete({ where: { id: req.params.id } });
      res.json({ message: 'Data source deleted' });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });
}
