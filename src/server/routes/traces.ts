import { Router } from 'express';
import logger from '../../logger';
import { getTraceStore } from '../../tracing/store';
import { TracesSchemas } from '../../types/api/traces';
import { replyValidationError } from '../utils/errors';
import type { Request, Response } from 'express';

export const tracesRouter = Router();

// Get traces for a specific evaluation
tracesRouter.get('/evaluation/:evaluationId', async (req: Request, res: Response) => {
  const paramsResult = TracesSchemas.GetByEval.Params.safeParse(req.params);
  if (!paramsResult.success) {
    replyValidationError(res, paramsResult.error);
    return;
  }

  try {
    const { evaluationId } = paramsResult.data;
    logger.debug(`[TracesRoute] Fetching traces for evaluation ${evaluationId}`);

    const traceStore = getTraceStore();
    const traces = await traceStore.getTracesByEvaluation(evaluationId);

    logger.debug(`[TracesRoute] Found ${traces.length} traces for evaluation ${evaluationId}`);
    res.json(TracesSchemas.GetByEval.Response.parse({ traces }));
  } catch (error) {
    logger.error(`[TracesRoute] Error fetching traces: ${error}`);
    res.status(500).json({ error: 'Failed to fetch traces' });
  }
});

// Get a specific trace by ID
tracesRouter.get('/:traceId', async (req: Request, res: Response) => {
  const paramsResult = TracesSchemas.Get.Params.safeParse(req.params);
  if (!paramsResult.success) {
    replyValidationError(res, paramsResult.error);
    return;
  }

  try {
    const { traceId } = paramsResult.data;
    logger.debug(`[TracesRoute] Fetching trace ${traceId}`);

    const traceStore = getTraceStore();
    const trace = await traceStore.getTrace(traceId);

    if (!trace) {
      res.status(404).json({ error: 'Trace not found' });
      return;
    }

    logger.debug(`[TracesRoute] Found trace ${traceId} with ${trace.spans?.length || 0} spans`);
    res.json(TracesSchemas.Get.Response.parse({ trace }));
  } catch (error) {
    logger.error(`[TracesRoute] Error fetching trace: ${error}`);
    res.status(500).json({ error: 'Failed to fetch trace' });
  }
});
