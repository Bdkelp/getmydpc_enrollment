import { type RequestHandler } from 'express';

const isProductionRuntime = (): boolean => {
  return String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
};

export const requireDevelopmentMode: RequestHandler = (_req, res, next) => {
  if (isProductionRuntime()) {
    return res.status(404).json({ message: 'Not found' });
  }

  return next();
};
