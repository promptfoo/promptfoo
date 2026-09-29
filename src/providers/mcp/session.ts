import { awaitWithAbort } from '../../util/abort';
import { providerRegistry } from '../providerRegistry';
import { MCPClient } from './client';

import type { MCPConfig } from './types';

/** Owns restartable MCP connections and resources created before initialization fails. */
export class McpClientSession {
  private currentClient: MCPClient | null = null;
  private initializationPromise: Promise<void> | null = null;
  private startupPending = false;
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
    const initialization = this.currentClient.initialize(this.startupController.signal);
    this.initializationPromise = initialization;
    this.startupPending = true;
    const markSettled = () => {
      if (this.initializationPromise === initialization) {
        this.startupPending = false;
      }
    };
    // Handle eager startup rejection here; initialize() still awaits the original promise.
    void initialization.then(markSettled, markSettled);
  }

  async initialize(signal?: AbortSignal): Promise<MCPClient> {
    signal?.throwIfAborted();
    if (this.cleanupPromise) {
      await awaitWithAbort(this.cleanupPromise, signal);
    }
    if (!this.currentClient) {
      this.start();
    }
    // Repeated use claims the connection for the calling evaluation, including shared instances.
    providerRegistry.register(this.owner);
    const client = this.currentClient!;
    const startupSignal = this.startupController.signal;
    await awaitWithAbort(
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
        await client.cleanup();
        if (this.startupPending) {
          void this.initializationPromise
            ?.then(
              () => client.cleanup(),
              () => undefined,
            )
            .catch(() => undefined);
        }
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
