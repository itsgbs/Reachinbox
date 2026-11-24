import { Request, Response, NextFunction } from 'express';
import { User } from '../types';

// Extend Express session type
declare module 'express-session' {
  interface SessionData {
    userId?: string;
    user?: User;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session?.userId) {
    next();
  } else {
    res.status(401).json({ success: false, error: 'Authentication required' });
  }
}

export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  next();
}
