import { REMOTE_API_BASE_URL } from '../../../constants';

// TODO(will): Deprecate function?
export async function getApiBaseUrl(): Promise<string> {
  return REMOTE_API_BASE_URL;
}
