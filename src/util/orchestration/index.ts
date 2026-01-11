/**
 * Evaluation Orchestrator
 *
 * Provides per-endpoint concurrency control for API calls during evaluation.
 * Uses default concurrency limits per endpoint (4 concurrent requests by default).
 *
 * @example
 * ```typescript
 * import { EvalOrchestrator } from './util/orchestration';
 *
 * const orchestrator = EvalOrchestrator.getInstance();
 * orchestrator.initialize();
 *
 * const result = await orchestrator.execute('openai:gpt-4o', async () => {
 *   return provider.callApi(prompt, context);
 * });
 *
 * orchestrator.cleanup();
 * ```
 */

export { EvalOrchestrator } from './orchestrator';
export { getDefaultConcurrency } from './defaults';
export { SemaphoreAbortError } from './endpointController';

export type { EndpointId, EndpointMetrics, OrchestratorMetrics } from './types';
