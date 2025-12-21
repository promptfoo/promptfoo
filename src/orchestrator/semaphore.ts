export class GlobalSemaphore {
  private active = 0;
  private limit: number;
  private waiting: (() => void)[] = [];

  constructor(limit: number) {
    this.limit = limit;
  }

  async acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.waiting.push(resolve);
    });
  }

  release(): void {
    if (this.waiting.length > 0) {
      const next = this.waiting.shift();
      next?.();
      // Active count stays the same because we passed the slot to the waiter
    } else {
      this.active = Math.max(0, this.active - 1);
    }
  }
}
