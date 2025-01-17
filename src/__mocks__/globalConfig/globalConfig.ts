import yaml from 'js-yaml';
import type { GlobalConfig } from '../../../src/configTypes';
import fs from 'fs';

export function getConfigDirectoryPath(): string {
  return '/mock/config/dir';
}

const configPath = getConfigDirectoryPath() + '/promptfoo.yaml';

// Initialize with default config
const defaultConfig: GlobalConfig = {
  account: {
    email: 'test@example.com',
  },
  cloud: {
    appUrl: 'https://www.promptfoo.app',
    apiHost: 'https://cloud.api.com',
    apiKey: 'test-api-key',
  },
};

// Initialize mock state
fs.__setMockFileContent(configPath, yaml.dump(defaultConfig));

export function __setMockConfig(config: GlobalConfig): void {
  fs.__setMockFileContent(configPath, yaml.dump(config));
}

export function readGlobalConfig(): GlobalConfig {
  try {
    if (!fs.existsSync(configPath)) {
      fs.mkdirSync(getConfigDirectoryPath(), { recursive: true });
      fs.writeFileSync(configPath, yaml.dump({}));
      return {};
    }

    const content = fs.readFileSync(configPath, 'utf8');
    if (!content) {
      return {};
    }

    const parsed = yaml.load(content);
    return (parsed as GlobalConfig) || {};
  } catch (err) {
    const error = err as Error;
    if (error.message?.includes('bad indentation')) {
      throw error;
    }
    return {};
  }
}

export function writeGlobalConfigPartial(config: Partial<GlobalConfig>): void {
  const currentConfig = readGlobalConfig();
  const newConfig = {
    ...currentConfig,
    ...config,
    cloud: {
      ...currentConfig.cloud,
      ...(config.cloud || {}),
    },
    account: {
      ...currentConfig.account,
      ...(config.account || {}),
    },
  };

  // Remove falsy values
  (Object.keys(newConfig) as Array<keyof GlobalConfig>).forEach((key) => {
    if (!newConfig[key]) {
      delete newConfig[key];
    }
  });

  fs.writeFileSync(configPath, yaml.dump(newConfig));
}
