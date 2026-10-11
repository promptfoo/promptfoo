import { providerRegistry } from '../providerRegistry';
import { waitForPromiseWithAbort } from '../shared';
import { MCPClient } from './client';

import type { MCPConfig } from './types';

/** A stable resource owner whose connection can be recreated after evaluation cleanup. */
export class McpClientSession {
  private currentClient: MCPClient | null = null;
  private initializationPromise: Promise<void> | null = null;
  private cleanupPromise?: Promise<void>;
  private readonly resource = { shutdown: () => this.cleanup() };

  constructor(private readonly config: MCPConfig) {
    this.start();
  }

  get client(): MCPClient | null {
    return this.currentClient;
  }

  private start(): void {
    const client = new MCPClient(this.config);
    this.currentClient = client;
    providerRegistry.register(this.resource);
    this.initializationPromise = client.initialize();
    // Eager failures are observed here and still returned to the first caller.
    void this.initializationPromise.catch(() => undefined);
  }

  async initialize(signal?: AbortSignal): Promise<MCPClient> {
    await providerRegistry.useResource(this.resource, signal);
    providerRegistry.throwIfResourceUseAborted(signal);
    if (this.cleanupPromise) {
      await waitForPromiseWithAbort(this.cleanupPromise, signal);
    }
    providerRegistry.throwIfResourceUseAborted(signal);
    if (!this.currentClient) {
      this.start();
    }
    const client = this.currentClient!;
    try {
      await waitForPromiseWithAbort(this.initializationPromise!, signal);
      providerRegistry.throwIfResourceUseAborted(signal);
      if (this.currentClient !== client) {
        throw new Error('MCP initialization interrupted by cleanup');
      }
      return client;
    } catch (error) {
      // A failed connection should be retryable, but one cancelled waiter must not
      // close startup still used by another call. Evaluation ownership handles that case.
      if (!signal?.aborted && this.currentClient === client) {
        await this.cleanup();
      }
      throw error;
    }
  }

  cleanup(): Promise<void> {
    if (this.cleanupPromise) {
      return this.cleanupPromise;
    }
    const client = this.currentClient;
    this.currentClient = null;
    this.initializationPromise = null;
    const cleanup = Promise.resolve(client?.cleanup()).finally(() => {
      providerRegistry.unregister(this.resource);
      if (this.cleanupPromise === cleanup) {
        this.cleanupPromise = undefined;
      }
    });
    this.cleanupPromise = cleanup;
    return cleanup;
  }
}
