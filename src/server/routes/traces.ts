import { Router } from 'express';
import logger from '../../logger';
import { getTraceStore } from '../../tracing/store';
import { HttpStatus, sendError } from '../middleware';
import type { Request, Response } from 'express';

import type { GetTraceResponse, GetTracesByEvaluationResponse } from '../../dtos/traces.dto';

export const tracesRouter = Router();

// Get traces for a specific evaluation
tracesRouter.get('/evaluation/:evaluationId', async (req: Request, res: Response) => {
  try {
    const { evaluationId } = req.params;
    logger.debug(`[TracesRoute] Fetching traces for evaluation ${evaluationId}`);

    const traceStore = getTraceStore();
    const traces = await traceStore.getTracesByEvaluation(evaluationId);

    logger.debug(`[TracesRoute] Found ${traces.length} traces for evaluation ${evaluationId}`);
    const response: GetTracesByEvaluationResponse = { traces };
    res.json(response);
  } catch (error) {
    logger.error(`[TracesRoute] Error fetching traces: ${error}`);
    sendError(res, HttpStatus.INTERNAL_SERVER_ERROR, 'Failed to fetch traces');
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
      sendError(res, HttpStatus.NOT_FOUND, 'Trace not found');
      return;
    }

    logger.debug(`[TracesRoute] Found trace ${traceId} with ${trace.spans?.length || 0} spans`);
    const response: GetTraceResponse = { trace };
    res.json(response);
  } catch (error) {
    logger.error(`[TracesRoute] Error fetching trace: ${error}`);
    sendError(res, HttpStatus.INTERNAL_SERVER_ERROR, 'Failed to fetch trace');
  }
});
