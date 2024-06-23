import { REMOTE_API_BASE_URL } from '../../../constants';

export async function getApiBaseUrl(): Promise<string> {
  return REMOTE_API_BASE_URL;
}
