import { Router } from 'express';
import logger from '../../logger';
import { getTraceStore } from '../../tracing/store';
import type { Request, Response } from 'express';

export const tracesRouter = Router();

// Get traces for a specific evaluation
tracesRouter.get('/evaluation/:evaluationId', async (req: Request, res: Response) => {
  try {
    const { evaluationId } = req.params;
    logger.info(`[TracesRoute] Fetching traces for evaluation ${evaluationId}`);

    const traceStore = getTraceStore();
    const traces = await traceStore.getTracesByEvaluation(evaluationId);

    logger.debug(`[TracesRoute] Found ${traces.length} traces for evaluation ${evaluationId}`);
    res.json({ traces });
  } catch (error) {
    logger.error(`[TracesRoute] Error fetching traces: ${error}`);
    res.status(500).json({ error: 'Failed to fetch traces' });
  }
});

// Get a specific trace by ID
tracesRouter.get('/:traceId', async (req: Request, res: Response) => {
  try {
    const { traceId } = req.params;
    logger.debug(`[TracesRoute] Fetching trace ${traceId}`);

    const traceStore = getTraceStore();
    const trace = await traceStore.getTrace(traceId);

    if (!trace) {
      res.status(404).json({ error: 'Trace not found' });
      return;
    }

    logger.debug(`[TracesRoute] Found trace ${traceId} with ${trace.spans?.length || 0} spans`);
    res.json({ trace });
  } catch (error) {
    logger.error(`[TracesRoute] Error fetching trace: ${error}`);
    res.status(500).json({ error: 'Failed to fetch trace' });
  }
});
