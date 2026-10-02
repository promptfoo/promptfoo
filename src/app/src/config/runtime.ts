import { callApi } from '@app/utils/api';

type RuntimeConfig = {
  tableSettings: {
    prettifyJson: boolean;
    showPassFail: boolean;
  };
};

const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  tableSettings: {
    prettifyJson: false,
    showPassFail: true,
  },
};

let runtimeConfig = DEFAULT_RUNTIME_CONFIG;

export function getRuntimeConfig(): RuntimeConfig {
  return runtimeConfig;
}

export async function loadRuntimeConfig(): Promise<void> {
  try {
    const response = await callApi('/app-config');
    if (!response.ok) {
      return;
    }

    const config = (await response.json()) as RuntimeConfig;
    if (
      typeof config?.tableSettings?.prettifyJson === 'boolean' &&
      typeof config.tableSettings.showPassFail === 'boolean'
    ) {
      runtimeConfig = config;
    }
  } catch {
    // Keep the built-in defaults when the server is unavailable or predates this endpoint.
  }
}
