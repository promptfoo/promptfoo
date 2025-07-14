import { useState, useEffect } from 'react';
import { callApi } from '@app/utils/api';

interface ApiKeyStatus {
  openai: boolean;
  anthropic: boolean;
  google: boolean;
  aws: boolean;
  azure: boolean;
  mistral: boolean;
  replicate: boolean;
}

export const useApiKeyDiscovery = () => {
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus>({
    openai: false,
    anthropic: false,
    google: false,
    aws: false,
    azure: false,
    mistral: false,
    replicate: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkApiKeys = async () => {
      try {
        const response = await callApi('/providers/available');
        const data = await response.json();

        setApiKeyStatus({
          openai: data.openai || false,
          anthropic: data.anthropic || false,
          google: data.google || false,
          aws: data.aws || false,
          azure: data.azure || false,
          mistral: data.mistral || false,
          replicate: data.replicate || false,
        });
      } catch (error) {
        console.error('Failed to check API keys:', error);
        // Fall back to checking localStorage
        setApiKeyStatus({
          openai: checkLocalStorage('OPENAI_API_KEY'),
          anthropic: checkLocalStorage('ANTHROPIC_API_KEY'),
          google:
            checkLocalStorage('GOOGLE_API_KEY') ||
            checkLocalStorage('GOOGLE_APPLICATION_CREDENTIALS'),
          aws: checkLocalStorage('AWS_ACCESS_KEY_ID'),
          azure: checkLocalStorage('AZURE_OPENAI_API_KEY'),
          mistral: checkLocalStorage('MISTRAL_API_KEY'),
          replicate: checkLocalStorage('REPLICATE_API_TOKEN'),
        });
      } finally {
        setLoading(false);
      }
    };

    checkApiKeys();
  }, []);

  return { apiKeyStatus, loading };
};

const checkLocalStorage = (keyName: string): boolean => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(`promptfoo_${keyName}`);
      return !!stored;
    }
  } catch (_e) {
    // Ignore localStorage errors
  }
  return false;
};
