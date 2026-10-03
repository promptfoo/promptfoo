import useApiConfig from '@app/stores/apiConfig';
import type { GetUserIdResponse, GetUserResponse } from '@promptfoo/contracts';
import type { UpdateEvalAuthorResponse } from '@promptfoo/types/api/eval';

export function getApiBaseUrl(apiBaseUrl = useApiConfig.getState().apiBaseUrl): string {
  if (apiBaseUrl) {
    return apiBaseUrl.replace(/\/$/, '');
  }
  // Use base path from build-time config for local deployments behind reverse proxy
  return import.meta.env.VITE_PUBLIC_BASENAME || '';
}

export async function callApi(
  path: string,
  options: RequestInit = {},
  apiBaseUrl = getApiBaseUrl(),
): Promise<Response> {
  return fetch(`${apiBaseUrl}/api${path}`, options);
}

async function fetchUserField<Field extends 'email' | 'id'>(
  field: Field,
  label: string,
): Promise<string | null> {
  try {
    const response = await callApi(`/user/${field}`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch user ${label}`);
    }

    return ((await response.json()) as Pick<GetUserResponse & GetUserIdResponse, Field>)[field];
  } catch (error) {
    console.error(`Error fetching user ${label}:`, error);
    return null;
  }
}

export function fetchUserEmail(): Promise<string | null> {
  return fetchUserField('email', 'email');
}

export function fetchUserId(): Promise<string | null> {
  return fetchUserField('id', 'ID');
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
