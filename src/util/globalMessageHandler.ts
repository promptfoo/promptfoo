export type MessageLevel = 'error' | 'warn' | 'info' | 'debug';

export interface QueuedMessage {
  level: MessageLevel;
  message: string;
  timestamp: Date;
}

export interface MessageHandlerState {
  isQueueing: boolean;
  queuedCount: number;
  errorCount: number;
  lastMessage: QueuedMessage | null;
}

type Listener = (state: MessageHandlerState) => void;

class GlobalMessageHandler {
  private isQueueing = false;
  private queueLevels: Set<MessageLevel> = new Set();
  private queue: QueuedMessage[] = [];
  private listeners: Set<Listener> = new Set();
  private isDraining = false;

  startQueueing(levels: MessageLevel[] = ['error']): void {
    this.isQueueing = true;
    this.queueLevels = new Set(levels);
    this.queue = [];
    this.notify();
  }

  stopQueueing(): void {
    this.isQueueing = false;
    this.queueLevels.clear();
    this.notify();
  }

  handle(level: MessageLevel, message: string): boolean {
    if (!this.isQueueing || this.isDraining || !this.queueLevels.has(level)) {
      return false;
    }

    const entry: QueuedMessage = {
      level,
      message,
      timestamp: new Date(),
    };

    this.queue.push(entry);
    this.notify(entry);
    return true;
  }

  drainQueue(): QueuedMessage[] {
    this.isDraining = true;
    const drained = [...this.queue];
    this.queue = [];
    this.notify();
    this.isDraining = false;
    return drained;
  }

  getState(): MessageHandlerState {
    const errorCount = this.queue.filter((entry) => entry.level === 'error').length;
    return {
      isQueueing: this.isQueueing,
      queuedCount: this.queue.length,
      errorCount,
      lastMessage: this.queue.length > 0 ? this.queue[this.queue.length - 1] : null,
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  hasQueuedMessages(): boolean {
    return this.queue.length > 0;
  }

  private notify(lastMessage?: QueuedMessage): void {
    const state = this.getState();
    if (lastMessage) {
      state.lastMessage = lastMessage;
    }
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}

const globalMessageHandler = new GlobalMessageHandler();

export default globalMessageHandler;
