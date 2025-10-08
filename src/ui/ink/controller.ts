import type { MessageHandlerState, QueuedMessage } from '../../util/globalMessageHandler';

export type ExperimentalUiProgress = {
  completed: number;
  total: number;
  errorCount: number;
  provider?: string;
  promptLabel?: string;
  testLabel?: string;
};

export type ExperimentalUiCompletion = {
  status: 'success' | 'error';
  error?: Error;
};

type ProgressListener = (progress: ExperimentalUiProgress) => void;
type ErrorListener = (entry: QueuedMessage) => void;
type StatusListener = (status: string) => void;
type CompletionListener = (payload: ExperimentalUiCompletion) => void;

type CompletionResolver = (payload: ExperimentalUiCompletion) => void;

class ExperimentalEvalUiController {
  private progressListeners = new Set<ProgressListener>();
  private errorListeners = new Set<ErrorListener>();
  private statusListeners = new Set<StatusListener>();
  private completionListeners = new Set<CompletionListener>();
  private completionResolvers: CompletionResolver[] = [];
  private lastProgress: ExperimentalUiProgress = {
    completed: 0,
    total: 0,
    errorCount: 0,
  };
  private completionValue: ExperimentalUiCompletion | null = null;

  onProgress(listener: ProgressListener): () => void {
    this.progressListeners.add(listener);
    listener(this.lastProgress);
    return () => {
      this.progressListeners.delete(listener);
    };
  }

  onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => {
      this.errorListeners.delete(listener);
    };
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  onComplete(listener: CompletionListener): () => void {
    this.completionListeners.add(listener);
    if (this.completionValue) {
      listener(this.completionValue);
    }
    return () => {
      this.completionListeners.delete(listener);
    };
  }

  setStatus(status: string) {
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }

  updateProgress(update: Partial<ExperimentalUiProgress>) {
    this.lastProgress = {
      ...this.lastProgress,
      ...update,
      errorCount: update.errorCount ?? this.lastProgress.errorCount,
    };

    for (const listener of this.progressListeners) {
      listener(this.lastProgress);
    }
  }

  updateErrorState(state: MessageHandlerState) {
    this.lastProgress = {
      ...this.lastProgress,
      errorCount: state.errorCount,
    };

    if (state.lastMessage?.level === 'error') {
      for (const listener of this.errorListeners) {
        listener(state.lastMessage);
      }
    }

    for (const listener of this.progressListeners) {
      listener(this.lastProgress);
    }
  }

  complete(payload: ExperimentalUiCompletion) {
    if (this.completionValue) {
      return;
    }

    this.completionValue = payload;
    for (const listener of this.completionListeners) {
      listener(payload);
    }
    for (const resolve of this.completionResolvers) {
      resolve(payload);
    }
    this.completionResolvers = [];
  }

  hasCompleted(): boolean {
    return this.completionValue !== null;
  }

  waitForCompletion(): Promise<ExperimentalUiCompletion> {
    if (this.completionValue) {
      return Promise.resolve(this.completionValue);
    }
    return new Promise<ExperimentalUiCompletion>((resolve) => {
      this.completionResolvers.push(resolve);
    });
  }
}

export default ExperimentalEvalUiController;
