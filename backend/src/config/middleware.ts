import cors from 'cors';
import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import { csrfMiddleware } from './csrf';
import { CORS_ORIGINS } from './constants';

export function setupMiddleware(app: Express) {
  // CORS configuration — credentials required for cookies
  app.use(cors({
    origin: CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  }));

  // Cookie parser
  app.use(cookieParser());

  // JSON parsing
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // CSRF protection — validates X-CSRF-Token header on write operations
  app.use(csrfMiddleware);

  // Request logging middleware
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });

}

// Error handler — must be registered AFTER all routes (called from server.ts)
export function setupErrorHandler(app: express.Express) {
  app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(`[${new Date().toISOString()}] Error on ${req.method} ${req.path}:`, err);
    res.status(err.status || 500).json({
      message: err.message || 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
  });
}

// Health check middleware
export function healthCheck(req: express.Request, res: express.Response) {
  res.json({
    status: 'OK',
    timestamp: new Date(),
    uptime: process.uptime(),
  });
}
