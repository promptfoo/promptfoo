import useApiConfig from '@app/stores/apiConfig';
import type { GetUserIdResponse, GetUserResponse } from '@promptfoo/contracts';
import type { UpdateEvalAuthorResponse } from '@promptfoo/types/api/eval';

export function getApiBaseUrl(): string {
  const { apiBaseUrl } = useApiConfig.getState();
  if (apiBaseUrl) {
    return apiBaseUrl.replace(/\/$/, '');
  }
  // Use base path from build-time config for local deployments behind reverse proxy
  return import.meta.env.VITE_PUBLIC_BASENAME || '';
}

export async function callApi(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${getApiBaseUrl()}/api${path}`, options);
}

export async function getApiErrorMessage(
  response: Response,
  fallbackMessage: string,
): Promise<string> {
  const errorText = await response.text();
  if (!errorText) {
    return fallbackMessage;
  }

  try {
    const parsed = JSON.parse(errorText) as unknown;
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      if (typeof record.error === 'string' && record.error.trim()) {
        return record.error;
      }
      if (typeof record.message === 'string' && record.message.trim()) {
        return record.message;
      }
    }
  } catch {}

  return errorText;
}

export async function fetchUserEmail(): Promise<string | null> {
  try {
    const response = await callApi('/user/email', {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user email');
    }

    const data: GetUserResponse = await response.json();
    return data.email;
  } catch (error) {
    console.error('Error fetching user email:', error);
    return null;
  }
}

export async function fetchUserId(): Promise<string | null> {
  try {
    const response = await callApi('/user/id', {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user ID');
    }

    const data: GetUserIdResponse = await response.json();
    return data.id;
  } catch (error) {
    console.error('Error fetching user ID:', error);
    return null;
  }
}

export async function updateEvalAuthor(
  evalId: string,
  author: string,
): Promise<UpdateEvalAuthorResponse> {
  const response = await callApi(`/eval/${evalId}/author`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ author }),
  });

  if (!response.ok) {
    throw new Error('Failed to update eval author');
  }

  return response.json();
}

export interface AssertionJobStatus {
  status: 'in-progress' | 'complete' | 'error';
  progress: number;
  total: number;
  passCount: number;
  failCount: number;
  updatedResults: number;
  skippedResults: number;
  skippedAssertions: number;
  errors: { resultId: string; error: string }[];
  matchedTestCount?: number;
}

export interface AddAssertionsResponse {
  jobId: string | null;
  total?: number;
  matchedTestCount?: number;
  // Returned when no job is needed (e.g., no assertions to add)
  updatedResults?: number;
  skippedResults?: number;
  skippedAssertions?: number;
  errors?: { resultId: string; error: string }[];
}

export async function addEvalAssertions(
  evalId: string,
  payload: {
    assertions: unknown[];
    scope: {
      type: 'results' | 'tests' | 'filtered';
      resultIds?: string[];
      testIndices?: number[];
      filters?: {
        type: string;
        operator: string;
        value?: string;
        field?: string;
        logicOperator?: 'and' | 'or';
      }[];
      filterMode?: string;
      searchText?: string;
    };
  },
): Promise<{ data: AddAssertionsResponse }> {
  const response = await callApi(`/eval/${evalId}/assertions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response, 'Failed to add assertions'));
  }

  return response.json();
}

export async function getAssertionJobStatus(
  evalId: string,
  jobId: string,
): Promise<{ data: AssertionJobStatus }> {
  const response = await callApi(`/eval/${evalId}/assertions/job/${jobId}`);

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response, 'Failed to get job status'));
  }

  return response.json();
}

export interface GeneratedAssertion {
  type: 'llm-rubric' | 'g-eval';
  metric: string;
  value: string;
}

export interface GenerateAssertionsOptions {
  type?: 'llm-rubric' | 'g-eval';
  numAssertions?: number;
  instructions?: string;
  provider?: string;
  testIndices?: number[];
  resultIds?: string[];
}

export interface GenerateAssertionsResponse {
  assertions: GeneratedAssertion[];
  context: {
    numPromptsAnalyzed: number;
    numOutputsAnalyzed: number;
    existingAssertionCount: number;
  };
}

export async function generateAssertionSuggestions(
  evalId: string,
  options: GenerateAssertionsOptions = {},
): Promise<{ data: GenerateAssertionsResponse }> {
  const response = await callApi(`/eval/${evalId}/assertions/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(options),
  });

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response, 'Failed to generate assertion suggestions'));
  }

  return response.json();
}
