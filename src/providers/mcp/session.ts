import { providerRegistry } from '../providerRegistry';
import { awaitProviderOperation } from '../shared';
import { MCPClient } from './client';

import type { MCPConfig } from './types';

/** Owns restartable MCP connections and resources created before initialization fails. */
export class McpClientSession {
  private currentClient: MCPClient | null = null;
  private initializationPromise: Promise<void> | null = null;
  private cleanupPromise?: Promise<void>;
  private startupController = new AbortController();

  constructor(
    private readonly config: MCPConfig,
    private readonly owner: { cleanup(): void | Promise<void> },
  ) {
    this.start();
  }

  get client(): MCPClient | null {
    return this.currentClient;
  }

  private start(): void {
    this.startupController = new AbortController();
    this.currentClient = new MCPClient(this.config);
    providerRegistry.register(this.owner);
    this.initializationPromise = this.currentClient.initialize(this.startupController.signal);
    // Eager construction can be followed by validation only. Preserve the error for callers.
    void this.initializationPromise.catch(() => undefined);
  }

  async initialize(signal?: AbortSignal): Promise<MCPClient> {
    signal?.throwIfAborted();
    if (this.cleanupPromise) {
      await awaitProviderOperation(this.cleanupPromise, signal);
    }
    if (!this.currentClient) {
      this.start();
    }
    // Repeated use claims the connection for the calling evaluation, including shared instances.
    providerRegistry.register(this.owner);
    const client = this.currentClient!;
    const startupSignal = this.startupController.signal;
    await awaitProviderOperation(
      this.initializationPromise!,
      signal ? AbortSignal.any([signal, startupSignal]) : startupSignal,
    );
    return client;
  }

  cleanup(): Promise<void> {
    if (this.cleanupPromise) {
      return this.cleanupPromise;
    }
    const client = this.currentClient;
    if (!client) {
      return Promise.resolve();
    }
    this.startupController.abort();
    this.cleanupPromise = (async () => {
      try {
        await awaitProviderOperation(
          this.initializationPromise!,
          this.startupController.signal,
        ).catch(() => undefined);
        await client.cleanup();
      } finally {
        this.currentClient = null;
        this.initializationPromise = null;
        providerRegistry.unregister(this.owner);
        this.cleanupPromise = undefined;
      }
    })();
    return this.cleanupPromise;
  }
}
