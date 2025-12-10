/**
 * EPX Certification helper routes
 * Provides admin-only utilities for generating and exporting certification samples
 */

import { Router, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { authenticateToken, type AuthRequest } from '../auth/supabaseAuth';
import { hasAtLeastRole } from '../auth/roles';
import { certificationLogger } from '../services/certification-logger';

const router = Router();

const hasAdminPrivileges = (req: AuthRequest): boolean => {
  return hasAtLeastRole(req.user?.role, 'admin');
};

const sanitizeFilename = (value?: string): string => {
  if (!value || typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed.length) {
    return '';
  }
  const sanitized = trimmed.replace(/[^a-z0-9._-]/gi, '_');
  return sanitized.endsWith('.json') ? sanitized : `${sanitized}.json`;
};

router.get('/api/epx/certification/logs', authenticateToken, (req: AuthRequest, res: Response) => {
  if (!hasAdminPrivileges(req)) {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }

  const limitParam = parseInt((req.query.limit as string) || '25', 10);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 25;

  const entries = certificationLogger.getRecentEntries(limit);

  res.json({
    success: true,
    entries,
    totalEntries: entries.length,
    limit
  });
});

router.get('/api/epx/certification/callbacks', authenticateToken, (req: AuthRequest, res: Response) => {
  if (!hasAdminPrivileges(req)) {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }

  const limitParam = parseInt((req.query.limit as string) || '50', 10);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 50;

  // Pull a larger recent set, then filter down to hosted callback events
  const recentEntries = certificationLogger.getRecentEntries(500);
  const callbackEntries = recentEntries.filter((entry) =>
    typeof entry?.purpose === 'string' && entry.purpose.startsWith('hosted-callback')
  ).slice(0, limit);

  res.json({
    success: true,
    entries: callbackEntries,
    totalEntries: callbackEntries.length,
    limit
  });
});

router.get('/api/epx/certification/report', authenticateToken, (req: AuthRequest, res: Response) => {
  if (!hasAdminPrivileges(req)) {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }

  const report = certificationLogger.generateCertificationReport();
  const summary = certificationLogger.getLogsSummary();

  res.json({
    success: true,
    report,
    summary
  });
});

router.post('/api/epx/certification/export', authenticateToken, (req: AuthRequest, res: Response) => {
  if (!hasAdminPrivileges(req)) {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }

  const providedName = sanitizeFilename(req.body?.filename);
  const defaultName = `epx-certification-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const exportFileName = providedName || defaultName;

  try {
    const filePath = certificationLogger.exportAllLogs(exportFileName);
    const rawContents = fs.readFileSync(filePath, 'utf8');
    let entries: unknown = [];

    try {
      entries = JSON.parse(rawContents);
    } catch (parseError) {
      console.warn('[EPX Certification] Failed to parse exported log file', { parseError });
    }

    res.json({
      success: true,
      fileName: path.basename(filePath),
      filePath,
      totalEntries: Array.isArray(entries) ? entries.length : 0,
      entries
    });
  } catch (error: any) {
    console.error('[EPX Certification] Export failed', { error: error?.message });
    res.status(500).json({
      success: false,
      error: 'Failed to export certification logs'
    });
  }
});

export default router;
