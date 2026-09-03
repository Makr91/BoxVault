import { log } from '../../utils/Logger.js';

const MAX_ENTRIES_PER_REQUEST = 200;
const MAX_MESSAGE_LENGTH = 4096;
const MAX_METADATA_BYTES = 16 * 1024;
const RECENT_CONTEXT_ENTRIES = 20;

const truncate = (value, limit) =>
  value.length > limit ? `${value.slice(0, limit)}…[truncated]` : value;

const sanitizeMetadata = metadata => {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }
  const serialized = JSON.stringify(metadata);
  return serialized.length > MAX_METADATA_BYTES
    ? { _truncated: true, preview: serialized.slice(0, MAX_METADATA_BYTES) }
    : metadata;
};

const sanitizeEntry = raw => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  return {
    ts: typeof raw.ts === 'string' ? raw.ts : new Date().toISOString(),
    level: typeof raw.level === 'string' ? raw.level : 'error',
    category: typeof raw.category === 'string' ? raw.category : 'app',
    message: typeof raw.message === 'string' ? truncate(raw.message, MAX_MESSAGE_LENGTH) : '',
    metadata: sanitizeMetadata(raw.metadata),
  };
};

const sanitizeArray = input =>
  Array.isArray(input)
    ? input.slice(0, MAX_ENTRIES_PER_REQUEST).map(sanitizeEntry).filter(Boolean)
    : [];

/**
 * @swagger
 * /api/client-errors:
 *   post:
 *     summary: Receive a batch of frontend error reports
 *     description: Error-level entries the browser logger ships in batches, each batch carrying a snapshot of the most recent entries for context (public endpoint, bounded by the global rate limiter and the entry and payload caps)
 *     tags: [Health]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               errors:
 *                 type: array
 *                 description: Error-level entries that triggered the flush
 *                 items:
 *                   type: object
 *                   properties:
 *                     ts:
 *                       type: string
 *                       format: date-time
 *                     level:
 *                       type: string
 *                     category:
 *                       type: string
 *                     message:
 *                       type: string
 *                     metadata:
 *                       type: object
 *                       nullable: true
 *               recent:
 *                 type: array
 *                 description: The logger's ring buffer at flush time, any level
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Errors recorded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 */
export const reportClientErrors = (req, res) => {
  const errors = sanitizeArray(req.body?.errors);
  const recent = sanitizeArray(req.body?.recent).slice(-RECENT_CONTEXT_ENTRIES);

  for (const entry of errors) {
    log.api.warn('Client error reported', {
      ip: req.ip,
      ts: entry.ts,
      category: entry.category,
      message: entry.message,
      metadata: entry.metadata,
      recent,
    });
  }

  return res.json({ ok: true });
};
