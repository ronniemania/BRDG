import { Request, Response, NextFunction } from 'express';
import authService from '../services/authService';
import { ForbiddenError } from '../utils/errors';

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid authorization header' });
  }

  const token = authHeader.substring(7);
  const decoded = authService.verifyToken(token);

  if (!decoded) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  req.userId = decoded.userId;
  req.userRole = decoded.role;
  next();
}

export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const decoded = authService.verifyToken(token);
    if (decoded) {
      req.userId = decoded.userId;
      req.userRole = decoded.role;
    }
  }

  next();
}

/**
 * Middleware factory that requires a specific role.
 * Must be used after authMiddleware (which sets req.userRole).
 */
export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      throw new ForbiddenError(`Access restricted to: ${roles.join(', ')}`);
    }
    next();
  };
}
