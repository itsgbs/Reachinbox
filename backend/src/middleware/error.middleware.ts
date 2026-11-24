import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack, url: req.url });
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' ? { details: err.message } : {}),
  });
}

export function notFound(req: Request, res: Response): void {
  res.status(404).json({ success: false, error: `Route ${req.method} ${req.url} not found` });
}
