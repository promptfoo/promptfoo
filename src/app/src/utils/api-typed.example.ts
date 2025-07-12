import type {
  ApiResponse,
  JobCreateRequest,
  JobCreateResponse,
  JobGetResponse,
  ListResponse,
  PaginationRequest,
} from '@promptfoo/shared/dto';
import { callApi } from './api';

/**
 * Example of typed API utility functions using shared DTOs
 */

// Generic typed API call wrapper
async function callApiTyped<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  try {
    const response = await callApi(path, options);
    const data = await response.json();
    
    if (!response.ok) {
      return {
        success: false,
        error: {
          code: `HTTP_${response.status}`,
          message: data.message || 'Request failed',
          details: data,
        },
      };
    }
    
    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

// Example: Create a new job
export async function createJob(
  request: JobCreateRequest,
): Promise<ApiResponse<JobCreateResponse>> {
  return callApiTyped<JobCreateResponse>('/jobs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
}

// Example: Get job status
export async function getJob(jobId: string): Promise<ApiResponse<JobGetResponse>> {
  return callApiTyped<JobGetResponse>(`/jobs/${jobId}`, {
    method: 'GET',
  });
}

// Example: List jobs with pagination
export async function listJobs(
  pagination?: PaginationRequest,
): Promise<ApiResponse<ListResponse<JobGetResponse>>> {
  const params = new URLSearchParams();
  if (pagination) {
    Object.entries(pagination).forEach(([key, value]) => {
      if (value !== undefined) {
        params.append(key, String(value));
      }
    });
  }
  
  return callApiTyped<ListResponse<JobGetResponse>>(
    `/jobs?${params.toString()}`,
    { method: 'GET' },
  );
}

// Usage example:
/*
const result = await createJob({
  testSuite: {
    prompts: ['Test prompt'],
    providers: ['openai:gpt-4'],
  },
  evaluateOptions: {
    maxConcurrency: 5,
  },
});

if (result.success) {
  console.log('Job created:', result.data.id);
} else {
  console.error('Error:', result.error.message);
}
*/