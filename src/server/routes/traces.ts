import { Router } from 'express';
import logger from '../../logger';
import { getTraceStore } from '../../tracing/store';
import { sanitizeObject } from '../../util/sanitizer';
import type { Request, Response } from 'express';

export const tracesRouter = Router();

function shouldSanitizeTraces(req: Request): boolean {
  const raw = req.query.sanitize;
  if (raw === 'false' || raw === '0') {
    return false;
  }
  return true;
}

function sanitizeTracePayload<T extends { spans?: unknown; metadata?: unknown }>(trace: T): T {
  const spans = Array.isArray(trace.spans)
    ? trace.spans.map((span: unknown) => {
        if (!span || typeof span !== 'object') {
          return span;
        }
        const spanRecord = span as Record<string, unknown>;
        return {
          ...spanRecord,
          attributes: sanitizeObject(spanRecord.attributes),
        };
      })
    : trace.spans;

  return {
    ...trace,
    spans,
    metadata: sanitizeObject(trace.metadata),
  } as T;
}

// Get traces for a specific evaluation
tracesRouter.get('/evaluation/:evaluationId', async (req: Request, res: Response) => {
  try {
    const evaluationId = req.params.evaluationId as string;
    logger.debug(`[TracesRoute] Fetching traces for evaluation ${evaluationId}`);

    const traceStore = getTraceStore();
    const traces = await traceStore.getTracesByEvaluation(evaluationId);

    logger.debug(`[TracesRoute] Found ${traces.length} traces for evaluation ${evaluationId}`);
    if (shouldSanitizeTraces(req)) {
      res.json({ traces: traces.map((t) => sanitizeTracePayload(t)) });
      return;
    }
    res.json({ traces });
  } catch (error) {
    logger.error(`[TracesRoute] Error fetching traces: ${error}`);
    res.status(500).json({ error: 'Failed to fetch traces' });
  }
});

// Get a specific trace by ID
tracesRouter.get('/:traceId', async (req: Request, res: Response) => {
  try {
    const traceId = req.params.traceId as string;
    logger.debug(`[TracesRoute] Fetching trace ${traceId}`);

    const traceStore = getTraceStore();
    const trace = await traceStore.getTrace(traceId);

    if (!trace) {
      res.status(404).json({ error: 'Trace not found' });
      return;
    }

    logger.debug(`[TracesRoute] Found trace ${traceId} with ${trace.spans?.length || 0} spans`);
    if (shouldSanitizeTraces(req)) {
      res.json({ trace: sanitizeTracePayload(trace) });
      return;
    }
    res.json({ trace });
  } catch (error) {
    logger.error(`[TracesRoute] Error fetching trace: ${error}`);
    res.status(500).json({ error: 'Failed to fetch trace' });
  }
});
