import type { Job, JobError, JobMetrics } from '../../types';

/**
 * Helper to create initial job metrics
 */
export function createInitialMetrics(): JobMetrics {
  return {
    testPassCount: 0,
    testFailCount: 0,
    testErrorCount: 0,
    tokenUsage: {
      total: 0,
      prompt: 0,
      completion: 0,
      numRequests: 0,
    },
    totalLatencyMs: 0,
  };
}

/**
 * Helper to add an error to a job with deduplication
 */
export function addJobError(job: Job, errorType: JobError['type'], message: string): void {
  if (!job.errors) {
    job.errors = [];
  }

  // Check for existing error with same type and message
  const existing = job.errors.find((e) => e.type === errorType && e.message === message);
  if (existing) {
    existing.count++;
    existing.timestamp = Date.now();
  } else {
    job.errors.push({
      type: errorType,
      message,
      timestamp: Date.now(),
      count: 1,
    });
  }
}

/**
 * Detect phase and detail from log message
 */
export function detectPhaseFromLog(
  message: string,
  currentPhase: Job['phase'],
): { phase: Job['phase']; detail?: string } | null {
  // Generation phase indicators
  if (message.includes('Generating test cases')) {
    return { phase: 'generating', detail: 'Initializing test generation...' };
  }
  if (message.includes('Extracting system purpose')) {
    return { phase: 'generating', detail: 'Extracting system purpose...' };
  }
  if (message.includes('Extracting entities')) {
    return { phase: 'generating', detail: 'Extracting entities...' };
  }
  const pluginMatch = message.match(/Generating tests for (\S+)/);
  if (pluginMatch) {
    return { phase: 'generating', detail: `Generating ${pluginMatch[1]} tests...` };
  }
  const strategyMatch = message.match(/Generating (\S+) tests/);
  if (strategyMatch && !message.includes('Generating tests for')) {
    return { phase: 'generating', detail: `Applying ${strategyMatch[1]} strategy...` };
  }

  // Evaluation phase indicators
  if (message.includes('Running scan')) {
    return { phase: 'evaluating', detail: 'Starting evaluation...' };
  }
  if (message.includes('Evaluating')) {
    return { phase: 'evaluating' };
  }

  // Completion indicators
  if (message.includes('Red team scan complete')) {
    return { phase: 'complete' };
  }

  // Error detection
  if (message.toLowerCase().includes('rate limit')) {
    return { phase: currentPhase }; // Keep current phase, will add error separately
  }

  return null;
}

/**
 * Detect error type from log message
 */
export function detectErrorFromLog(
  message: string,
): { type: JobError['type']; message: string } | null {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('rate limit')) {
    return { type: 'rate_limit', message: 'Rate limit exceeded' };
  }
  if (lowerMessage.includes('timeout')) {
    return { type: 'timeout', message: 'Request timed out' };
  }
  if (lowerMessage.includes('error') && lowerMessage.includes('target')) {
    return { type: 'target_error', message };
  }
  if (lowerMessage.includes('error') && lowerMessage.includes('grad')) {
    return { type: 'grader_error', message };
  }
  if (message.startsWith('Error:')) {
    return { type: 'unknown', message: message.substring(7).trim() };
  }

  return null;
}
