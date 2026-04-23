import { Router } from 'express';
import { z } from 'zod';
import logger from '../../logger';
import { getTraceStore } from '../../tracing/store';
import { TracesSchemas } from '../../types/api/traces';
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
  const paramsResult = TracesSchemas.GetByEval.Params.safeParse(req.params);
  if (!paramsResult.success) {
    res.status(400).json({ error: z.prettifyError(paramsResult.error) });
    return;
  }

  try {
    const { evaluationId } = paramsResult.data;
    logger.debug(`[TracesRoute] Fetching traces for evaluation ${evaluationId}`);

    const traceStore = getTraceStore();
    const sanitize = shouldSanitizeTraces(req);
    const traces = await traceStore.getTracesByEvaluation(evaluationId, {
      sanitizeAttributes: false,
    });

    logger.debug(`[TracesRoute] Found ${traces.length} traces for evaluation ${evaluationId}`);
    if (sanitize) {
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
  const paramsResult = TracesSchemas.Get.Params.safeParse(req.params);
  if (!paramsResult.success) {
    res.status(400).json({ error: z.prettifyError(paramsResult.error) });
    return;
  }

  try {
    const { traceId } = paramsResult.data;
    logger.debug(`[TracesRoute] Fetching trace ${traceId}`);

    const traceStore = getTraceStore();
    const sanitize = shouldSanitizeTraces(req);
    const trace = await traceStore.getTrace(traceId, {
      sanitizeAttributes: false,
    });

    if (!trace) {
      res.status(404).json({ error: 'Trace not found' });
      return;
    }

    logger.debug(`[TracesRoute] Found trace ${traceId} with ${trace.spans?.length || 0} spans`);
    if (sanitize) {
      res.json({ trace: sanitizeTracePayload(trace) });
      return;
    }
    res.json({ trace });
  } catch (error) {
    logger.error(`[TracesRoute] Error fetching trace: ${error}`);
    res.status(500).json({ error: 'Failed to fetch trace' });
  }
});
