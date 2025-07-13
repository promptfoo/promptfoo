import { callApi } from '@app/utils/api';
import type { TestCase, Assertion, VarMapping } from '@promptfoo/types';

export interface GenerateDatasetOptions {
  numPersonas?: number;
  numTestCasesPerPersona?: number;
  instructions?: string;
  provider?: string;
}

export interface GenerateAssertionsOptions {
  numQuestions?: number;
  type?: 'pi' | 'g-eval' | 'llm-rubric';
  instructions?: string;
  provider?: string;
}

export interface GenerationJob {
  id: string;
  status: 'in-progress' | 'complete' | 'error';
  progress: number;
  total: number;
  result?: { results: any[] };
  logs: string[];
}

export interface GenerationProgress {
  onProgress?: (current: number, total: number) => void;
  onComplete?: (results: any[]) => void;
  onError?: (error: string) => void;
}

class GenerationService {
  private pollingIntervals = new Map<string, NodeJS.Timeout>();

  /**
   * Generate test cases for evaluation
   */
  async generateDataset(
    prompts: string[],
    existingTests: TestCase[],
    options: GenerateDatasetOptions,
    progress?: GenerationProgress,
  ): Promise<string> {
    const response = await callApi('/generate/dataset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompts: prompts.map((p) => ({ raw: p })),
        tests: existingTests,
        options: {
          ...options,
          async: true,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Generation failed: ${response.statusText}`);
    }

    const { id } = await response.json();

    if (progress) {
      this.pollJob(id, progress);
    }

    return id;
  }

  /**
   * Generate assertions for test cases
   */
  async generateAssertions(
    prompts: string[],
    tests: TestCase[],
    options: GenerateAssertionsOptions,
    progress?: GenerationProgress,
  ): Promise<string> {
    const response = await callApi('/generate/assertions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompts: prompts.map((p) => ({ raw: p })),
        tests,
        options: {
          ...options,
          async: true,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Assertion generation failed: ${response.statusText}`);
    }

    const { id } = await response.json();

    if (progress) {
      this.pollJob(id, progress);
    }

    return id;
  }

  /**
   * Get the status of a generation job
   */
  async getJobStatus(jobId: string): Promise<GenerationJob> {
    const response = await callApi(`/generate/job/${jobId}`);
    
    if (!response.ok) {
      throw new Error('Failed to check job status');
    }

    return response.json();
  }

  /**
   * Poll a job until completion
   */
  private pollJob(jobId: string, progress: GenerationProgress): void {
    const intervalId = setInterval(async () => {
      try {
        const job = await this.getJobStatus(jobId);

        if (job.status === 'complete') {
          this.stopPolling(jobId);
          if (progress.onComplete && job.result) {
            progress.onComplete(job.result.results);
          }
        } else if (job.status === 'error') {
          this.stopPolling(jobId);
          if (progress.onError) {
            progress.onError(job.logs.join('\n') || 'Generation failed');
          }
        } else if (progress.onProgress) {
          progress.onProgress(job.progress, job.total);
        }
      } catch (error) {
        this.stopPolling(jobId);
        if (progress.onError) {
          progress.onError(error instanceof Error ? error.message : 'An error occurred');
        }
      }
    }, 1000);

    this.pollingIntervals.set(jobId, intervalId);
  }

  /**
   * Stop polling a specific job
   */
  stopPolling(jobId: string): void {
    const intervalId = this.pollingIntervals.get(jobId);
    if (intervalId) {
      clearInterval(intervalId);
      this.pollingIntervals.delete(jobId);
    }
  }

  /**
   * Stop all polling
   */
  stopAllPolling(): void {
    this.pollingIntervals.forEach((intervalId) => clearInterval(intervalId));
    this.pollingIntervals.clear();
  }

  /**
   * Generate test cases synchronously (for backward compatibility)
   */
  async generateDatasetSync(
    prompts: string[],
    existingTests: TestCase[],
    options: GenerateDatasetOptions,
  ): Promise<VarMapping[]> {
    const response = await callApi('/generate/dataset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompts: prompts.map((p) => ({ raw: p })),
        tests: existingTests,
        options: {
          ...options,
          async: false,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Generation failed: ${response.statusText}`);
    }

    const { results } = await response.json();
    return results;
  }

  /**
   * Generate assertions synchronously
   */
  async generateAssertionsSync(
    prompts: string[],
    tests: TestCase[],
    options: GenerateAssertionsOptions,
  ): Promise<Assertion[]> {
    const response = await callApi('/generate/assertions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompts: prompts.map((p) => ({ raw: p })),
        tests,
        options: {
          ...options,
          async: false,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Assertion generation failed: ${response.statusText}`);
    }

    const { results } = await response.json();
    return results;
  }
}

// Export singleton instance
export const generationService = new GenerationService(); 