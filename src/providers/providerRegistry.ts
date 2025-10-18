import logger from '../logger';
import { PythonProvider } from './pythonCompletion';

/**
 * Global registry of Python providers for cleanup on process exit.
 * Ensures no zombie Python processes are left running.
 */
class ProviderRegistry {
  private providers: Set<PythonProvider> = new Set();
  private shutdownRegistered: boolean = false;

  register(provider: PythonProvider): void {
    this.providers.add(provider);

    if (!this.shutdownRegistered) {
      this.registerShutdownHandlers();
      this.shutdownRegistered = true;
    }
  }

  unregister(provider: PythonProvider): void {
    this.providers.delete(provider);
  }

  private registerShutdownHandlers(): void {
    const shutdown = async (signal: string) => {
      logger.debug(`Received ${signal}, shutting down ${this.providers.size} Python providers...`);

      await Promise.all(
        Array.from(this.providers).map((p) =>
          p.shutdown().catch((err) => {
            logger.error(`Error shutting down provider: ${err}`);
          }),
        ),
      );

      logger.debug('Python provider shutdown complete');

      // Exit after cleanup (only for signals, not normal exit)
      if (signal !== 'exit') {
        process.exit(signal === 'SIGINT' ? 0 : 1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('exit', () => shutdown('exit'));
  }

  async shutdownAll(): Promise<void> {
    await Promise.all(Array.from(this.providers).map((p) => p.shutdown()));
    this.providers.clear();
  }
}

export const providerRegistry = new ProviderRegistry();
