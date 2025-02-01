import type { RunEvalOptions } from 'src/types';

/**
 * Singleton class to manage global application context
 */
class GlobalContext {
  private runEvalOptions: RunEvalOptions[];

  constructor() {
    // Initialize with an empty array to avoid undefined issues
    this.runEvalOptions = [];
  }

  /**
   * Set the array of run evaluation options
   *
   * @param options - An array of run evaluation option objects
   */
  public setRunEvalOptions(options: RunEvalOptions[]): void {
    this.runEvalOptions = options;
  }

  /**
   * Get the current array of run evaluation options
   *
   * @returns The array of run evaluation options
   */
  public getRunEvalOptions(): RunEvalOptions[] {
    return this.runEvalOptions;
  }

  /**
   * Clear the current array of run evaluation options
   */
  public clearRunEvalOptions(): void {
    this.runEvalOptions = [];
  }
}

// Export a singleton instance
export const globalContext = new GlobalContext();
