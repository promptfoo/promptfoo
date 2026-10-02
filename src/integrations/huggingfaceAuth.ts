import { getEnvString } from '../envars';

// Resolve aliases per request and keep headers local to their authenticated fetch.
export function getHuggingFaceHeaders(): Record<string, string> {
  const token =
    getEnvString('HF_TOKEN') ||
    getEnvString('HF_API_TOKEN') ||
    getEnvString('HUGGING_FACE_HUB_TOKEN');
  return token ? { Authorization: `Bearer ${token}` } : {};
}
