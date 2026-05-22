import { query } from '../server/lib/neonDb';
import { parsePaymentMetadata } from '../server/utils/epx-metadata';

type CandidateRow = {
  id: number;
  status: string | null;
  failure_reason: string | null;
  metadata: unknown;
};

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = Number.isFinite(Number(limitArg?.split('=')[1]))
  ? Math.max(1, Math.min(5000, Number(limitArg?.split('=')[1])))
  : 2000;

const parseLegacyFailureBlob = (value: unknown): { failureReason: string | null; declineCode: string | null; rawStatusMessage: string | null } => {
  if (typeof value !== 'string') {
    return { failureReason: null, declineCode: null, rawStatusMessage: null };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { failureReason: null, declineCode: null, rawStatusMessage: null };
  }

  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return { failureReason: trimmed, declineCode: null, rawStatusMessage: null };
  }

  try {
    const parsed = JSON.parse(trimmed);
    const rawStatusMessage =
      (typeof parsed?.StatusMessage === 'string' && parsed.StatusMessage.trim())
      || (typeof parsed?.statusMessage === 'string' && parsed.statusMessage.trim())
      || null;

    const explicitCode =
      (typeof parsed?.StatusCode === 'string' && parsed.StatusCode.trim())
      || (typeof parsed?.statusCode === 'string' && parsed.statusCode.trim())
      || null;
    const codeFromMessage = rawStatusMessage?.match(/\b(\d{2,3})\b/)?.[1] || null;
    const declineCode = (explicitCode || codeFromMessage || null);

    let failureReason: string | null = rawStatusMessage;
    if (rawStatusMessage) {
      const upper = rawStatusMessage.toUpperCase();
      if (upper.includes('INSUFF') || upper.includes('INSUFFICIENT') || upper.includes('NSF') || declineCode === '51') {
        failureReason = 'Insufficient funds';
      } else if (upper.includes('DECLINED') || upper.includes('DO NOT HONOR') || declineCode === '05') {
        failureReason = 'Card declined by issuer';
      } else if (upper.includes('INVALID') || upper.includes('EXPIRED') || declineCode === '14' || declineCode === '54') {
        failureReason = 'Card information invalid or expired';
      }
    }

    return {
      failureReason: failureReason || trimmed,
      declineCode,
      rawStatusMessage,
    };
  } catch {
    return { failureReason: trimmed, declineCode: null, rawStatusMessage: null };
  }
};

const main = async () => {
  console.log(`[backfill-hosted-decline-diagnostics] mode=${apply ? 'apply' : 'dry-run'} limit=${limit}`);

  const result = await query(
    `
      SELECT id, status, failure_reason, metadata
      FROM payments
      WHERE status IN ('failed', 'declined', 'canceled', 'cancelled')
      ORDER BY updated_at DESC
      LIMIT $1
    `,
    [limit],
  );

  const rows = (result.rows || []) as CandidateRow[];

  let candidates = 0;
  let updates = 0;
  let unchanged = 0;

  for (const row of rows) {
    const metadata = parsePaymentMetadata(row.metadata);
    const hostedCallback = metadata.hostedCallback && typeof metadata.hostedCallback === 'object'
      ? { ...metadata.hostedCallback }
      : {};

    const parsed = parseLegacyFailureBlob(row.failure_reason);

    const resolvedFailureReason = hostedCallback.declineReason || parsed.failureReason || null;
    const resolvedDeclineCode = hostedCallback.declineCode || parsed.declineCode || null;
    const resolvedRawStatusMessage = hostedCallback.rawStatusMessage || parsed.rawStatusMessage || null;

    const normalizedFailureReasonColumn =
      parsed.failureReason && row.failure_reason && row.failure_reason.trim().startsWith('{')
        ? parsed.failureReason
        : row.failure_reason;

    const nextHostedCallback = {
      ...hostedCallback,
      declineReason: resolvedFailureReason,
      declineCode: resolvedDeclineCode,
      rawStatusMessage: resolvedRawStatusMessage,
    };

    const nextMetadata = {
      ...metadata,
      hostedCallback: nextHostedCallback,
    };

    const metadataChanged = JSON.stringify(nextMetadata) !== JSON.stringify(metadata);
    const failureColumnChanged = (normalizedFailureReasonColumn || null) !== (row.failure_reason || null);

    if (!metadataChanged && !failureColumnChanged) {
      unchanged += 1;
      continue;
    }

    candidates += 1;

    if (!apply) {
      continue;
    }

    await query(
      `
        UPDATE payments
        SET
          metadata = $2::jsonb,
          failure_reason = $3,
          updated_at = NOW()
        WHERE id = $1
      `,
      [row.id, JSON.stringify(nextMetadata), normalizedFailureReasonColumn],
    );

    updates += 1;
  }

  console.log('[backfill-hosted-decline-diagnostics] summary', {
    scanned: rows.length,
    candidates,
    updates,
    unchanged,
    mode: apply ? 'apply' : 'dry-run',
  });
};

main().catch((error) => {
  console.error('[backfill-hosted-decline-diagnostics] failed', error);
  process.exitCode = 1;
});
