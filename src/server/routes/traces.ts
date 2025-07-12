import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { fromZodError } from 'zod-validation-error';
import logger from '../../logger';
import { getTraceStore } from '../../tracing/store';
import { ApiSchemas } from '../apiSchemas';

export const tracesRouter = Router();

// Get traces for a specific evaluation
tracesRouter.get('/evaluation/:evaluationId', async (req: Request, res: Response) => {
  try {
    const { evaluationId } = ApiSchemas.Trace.GetByEvaluation.Params.parse(req.params);
    logger.info(`[TracesRoute] Fetching traces for evaluation ${evaluationId}`);

    const traceStore = getTraceStore();
    const traces = await traceStore.getTracesByEvaluation(evaluationId);

    logger.debug(`[TracesRoute] Found ${traces.length} traces for evaluation ${evaluationId}`);
    res.json(ApiSchemas.Trace.GetByEvaluation.Response.parse({ traces }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: fromZodError(error).toString() });
    } else {
      logger.error(`[TracesRoute] Error fetching traces: ${error}`);
      res.status(500).json({ error: 'Failed to fetch traces' });
    }
  }
});

// Get a specific trace by ID
tracesRouter.get('/:traceId', async (req: Request, res: Response) => {
  try {
    const { traceId } = ApiSchemas.Trace.Get.Params.parse(req.params);
    logger.debug(`[TracesRoute] Fetching trace ${traceId}`);

    const traceStore = getTraceStore();
    const trace = await traceStore.getTrace(traceId);

    if (!trace) {
      res.status(404).json({ error: 'Trace not found' });
      return;
    }

    logger.debug(`[TracesRoute] Found trace ${traceId} with ${trace.spans?.length || 0} spans`);
    res.json(ApiSchemas.Trace.Get.Response.parse({ trace }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: fromZodError(error).toString() });
    } else {
      logger.error(`[TracesRoute] Error fetching trace: ${error}`);
      res.status(500).json({ error: 'Failed to fetch trace' });
    }
  }
});
