import { providerRegistry } from '../providerRegistry';
import { MCPClient } from './client';

import type { MCPConfig } from './types';

/** Owns an eager MCP connection, including resources created before initialization fails. */
export class McpClientSession {
  readonly client: MCPClient;
  readonly ready: Promise<void>;
  private cleanupPromise?: Promise<void>;

  constructor(
    config: MCPConfig,
    private readonly owner: { cleanup(): Promise<void> },
  ) {
    this.client = new MCPClient(config);
    providerRegistry.register(owner);
    this.ready = this.client.initialize();
    // Construction may be followed by validation only. Retain the rejection for callers,
    // but observe it immediately so eager initialization cannot cause an unhandled rejection.
    void this.ready.catch(() => undefined);
  }

  cleanup(): Promise<void> {
    this.cleanupPromise ??= (async () => {
      try {
        // A failed initialization can still have connected some of the configured servers.
        await this.ready.catch(() => undefined);
        await this.client.cleanup();
      } finally {
        providerRegistry.unregister(this.owner);
      }
    })();
    return this.cleanupPromise;
  }
}
