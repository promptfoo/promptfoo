import { getDefaultConcurrency } from './defaults';
import { EndpointController } from './endpointController';
import type { EndpointId, EndpointMetrics, OrchestratorMetrics } from './types';

/**
 * Singleton orchestrator for all API calls (test execution + assertion grading).
 * Provides per-endpoint concurrency control and metrics tracking.
 */
export class EvalOrchestrator {
  private static instance: EvalOrchestrator;
  private controllers: Map<EndpointId, EndpointController> = new Map();
  private initialized = false;

  private constructor() {}

  static getInstance(): EvalOrchestrator {
    if (!EvalOrchestrator.instance) {
      EvalOrchestrator.instance = new EvalOrchestrator();
    }
    return EvalOrchestrator.instance;
  }

  /**
   * Initialize the orchestrator (call once per evaluation)
   */
  initialize(): void {
    this.initialized = true;
  }

  /**
   * Execute a function with concurrency control
   * @param endpointId The endpoint identifier for concurrency grouping
   * @param fn The function to execute
   * @param abortSignal Optional abort signal to cancel waiting for a slot
   */
  async execute<T>(endpointId: EndpointId, fn: () => Promise<T>, abortSignal?: AbortSignal): Promise<T> {
    if (!this.initialized) {
      this.initialize();
    }
    return this.getOrCreateController(endpointId).execute(fn, abortSignal);
  }

  /**
   * Get metrics for a specific endpoint
   */
  getEndpointMetrics(endpointId: EndpointId): EndpointMetrics | undefined {
    return this.controllers.get(endpointId)?.getMetrics();
  }

  /**
   * Get global orchestrator metrics
   */
  getMetrics(): OrchestratorMetrics {
    const endpoints = new Map<EndpointId, EndpointMetrics>();
    let globalQueueDepth = 0;
    let globalActiveRequests = 0;
    let totalRequests = 0;
    let totalErrors = 0;

    for (const [id, controller] of this.controllers) {
      const metrics = controller.getMetrics();
      endpoints.set(id, metrics);
      globalQueueDepth += metrics.queueDepth;
      globalActiveRequests += metrics.activeConcurrency;
      totalRequests += metrics.requestCount;
      totalErrors += metrics.errorCount;
    }

    return {
      endpoints,
      globalQueueDepth,
      globalActiveRequests,
      globalErrorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
    };
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getEndpointCount(): number {
    return this.controllers.size;
  }

  /**
   * Cancel all waiting requests across all endpoints.
   * In-flight requests will complete, but queued requests will be rejected.
   * Call this on SIGINT/abort for graceful shutdown.
   */
  cancelAll(): void {
    for (const controller of this.controllers.values()) {
      controller.cancelWaiting();
    }
  }

  /**
   * Cleanup all controllers (call at end of evaluation)
   */
  cleanup(): void {
    // Cancel any pending requests before clearing
    this.cancelAll();
    this.controllers.clear();
    this.initialized = false;
  }

  private getOrCreateController(endpointId: EndpointId): EndpointController {
    let controller = this.controllers.get(endpointId);

    if (!controller) {
      const maxConcurrency = getDefaultConcurrency(endpointId);
      controller = new EndpointController(endpointId, maxConcurrency);
      this.controllers.set(endpointId, controller);
    }

    return controller;
  }
}
