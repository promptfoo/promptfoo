export interface ManagedPrompt {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  currentVersion: number;
  createdAt: Date;
  updatedAt: Date;
  author?: string;
}

export interface PromptVersion {
  id: string;
  promptId: string;
  version: number;
  content: string;
  author?: string;
  createdAt: Date;
  notes?: string;
}

export interface PromptDeployment {
  promptId: string;
  environment: string;
  versionId: string;
  updatedAt: Date;
  updatedBy?: string;
}

export interface ManagedPromptWithVersions extends ManagedPrompt {
  versions: PromptVersion[];
  deployments?: Record<string, number>; // environment -> version number
}

export interface PromptYaml {
  id: string;
  description?: string;
  tags?: string[];
  currentVersion: number;
  versions: Array<{
    version: number;
    author?: string;
    createdAt: string;
    content: string;
    notes?: string;
  }>;
  deployments?: Record<string, number>;
}

export interface PromptManagementConfig {
  mode: 'local' | 'cloud';
  localPath?: string; // Path to prompts directory for local mode
  cloudApiUrl?: string; // API URL for cloud mode
}

export interface PromptTestOptions {
  promptId: string;
  version?: number;
  testFile: string;
  provider?: string;
  options?: Record<string, any>;
}

export interface PromptDiffOptions {
  promptId: string;
  versionA?: number;
  versionB?: number;
}
