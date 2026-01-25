import { Hono } from 'hono';

import logger from '../../../logger';
import { getTraceStore } from '../../../tracing/store';

export const tracesRouter = new Hono();

// Get traces for a specific evaluation
tracesRouter.get('/evaluation/:evaluationId', async (c) => {
  try {
    const evaluationId = c.req.param('evaluationId');
    logger.debug(`[TracesRoute] Fetching traces for evaluation ${evaluationId}`);

    const traceStore = getTraceStore();
    const traces = await traceStore.getTracesByEvaluation(evaluationId);

    logger.debug(`[TracesRoute] Found ${traces.length} traces for evaluation ${evaluationId}`);
    return c.json({ traces });
  } catch (error) {
    logger.error(`[TracesRoute] Error fetching traces: ${error}`);
    return c.json({ error: 'Failed to fetch traces' }, 500);
  }
});

// Get a specific trace by ID
tracesRouter.get('/:traceId', async (c) => {
  try {
    const traceId = c.req.param('traceId');
    logger.debug(`[TracesRoute] Fetching trace ${traceId}`);

    const traceStore = getTraceStore();
    const trace = await traceStore.getTrace(traceId);

    if (!trace) {
      return c.json({ error: 'Trace not found' }, 404);
    }

    logger.debug(`[TracesRoute] Found trace ${traceId} with ${trace.spans?.length || 0} spans`);
    return c.json({ trace });
  } catch (error) {
    logger.error(`[TracesRoute] Error fetching trace: ${error}`);
    return c.json({ error: 'Failed to fetch trace' }, 500);
  }
});

export default tracesRouter;
