import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { diffLines } from 'diff';
import os from 'os';
import logger from '../../logger';
import { cloudConfig } from '../../globalConfig/cloud';
import { fetchWithRetries } from '../../fetch';
import { getUserEmail } from '../../globalConfig/accounts';
import type { 
  ManagedPrompt, 
  ManagedPromptWithVersions, 
  PromptYaml,
  PromptManagementConfig 
} from '../../types/prompt-management';
import packageJson from '../../../package.json';

export class PromptManager {
  private config: PromptManagementConfig;
  
  constructor(config?: PromptManagementConfig) {
    this.config = config || this.getDefaultConfig();
  }

  private getDefaultConfig(): PromptManagementConfig {
    // Check if user wants to force local mode
    if (process.env.PROMPTFOO_PROMPT_LOCAL_MODE === 'true') {
      return {
        mode: 'local',
        localPath: path.join(process.cwd(), 'prompts'),
      };
    }
    
    if (cloudConfig.isEnabled()) {
      return {
        mode: 'cloud',
        cloudApiUrl: cloudConfig.getApiHost(),
      };
    }
    return {
      mode: 'local',
      localPath: path.join(process.cwd(), 'prompts'),
    };
  }

  async createPrompt(id: string, description?: string, content?: string): Promise<ManagedPromptWithVersions> {
    if (this.config.mode === 'local') {
      return this.createPromptLocal(id, description, content);
    } else {
      return this.createPromptCloud(id, description, content);
    }
  }

  private async createPromptLocal(id: string, description?: string, content?: string): Promise<ManagedPromptWithVersions> {
    const promptsDir = this.config.localPath!;
    await fs.mkdir(promptsDir, { recursive: true });
    
    const filePath = path.join(promptsDir, `${id}.yaml`);
    
    // Check if prompt already exists
    try {
      await fs.access(filePath);
      throw new Error(`Prompt with id "${id}" already exists`);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    const now = new Date();
    const author = getUserEmail() || 'unknown';
    
    const promptYaml: PromptYaml = {
      id,
      description,
      currentVersion: 1,
      versions: [{
        version: 1,
        author,
        createdAt: now.toISOString(),
        content: content || '',
        notes: 'Initial version',
      }],
      deployments: {},
    };

    await fs.writeFile(filePath, yaml.dump(promptYaml), 'utf-8');
    
    return {
      id,
      name: id,
      description,
      currentVersion: 1,
      createdAt: now,
      updatedAt: now,
      author,
      versions: [{
        id: `${id}-v1`,
        promptId: id,
        version: 1,
        content: content || '',
        author,
        createdAt: now,
        notes: 'Initial version',
      }],
      deployments: {},
    };
  }

  private async createPromptCloud(id: string, description?: string, content?: string): Promise<ManagedPromptWithVersions> {
    const apiUrl = `${this.config.cloudApiUrl}/api/prompts`;
    const apiKey = cloudConfig.getApiKey();
    
    if (!apiKey) {
      throw new Error('Not authenticated. Please run "promptfoo auth login" first.');
    }

    // Collect metadata
    const metadata = {
      promptfooVersion: packageJson.version,
      os: os.type(),
      platform: os.platform(),
      arch: os.arch(),
      usageCount: 0,
      lastUsedAt: null,
      isCloudSynced: true,
    };

    const response = await fetchWithRetries(apiUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ id, description, content, notes: 'Initial version', metadata }),
    }, 30000);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create prompt: ${error}`);
    }

    return response.json();
  }

  async listPrompts(): Promise<ManagedPrompt[]> {
    if (this.config.mode === 'local') {
      return this.listPromptsLocal();
    } else {
      return this.listPromptsCloud();
    }
  }

  private async listPromptsLocal(): Promise<ManagedPrompt[]> {
    const promptsDir = this.config.localPath!;
    
    try {
      const files = await fs.readdir(promptsDir);
      const prompts: ManagedPrompt[] = [];
      
      for (const file of files) {
        if (!file.endsWith('.yaml')) {
          continue;
        }
        
        const filePath = path.join(promptsDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const data = yaml.load(content) as PromptYaml;
        
        const latestVersion = data.versions[data.versions.length - 1];
        
        prompts.push({
          id: data.id,
          name: data.id,
          description: data.description,
          tags: data.tags,
          currentVersion: data.currentVersion,
          createdAt: new Date(data.versions[0].createdAt),
          updatedAt: new Date(latestVersion.createdAt),
          author: data.versions[0].author,
        });
      }
      
      return prompts;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private async listPromptsCloud(): Promise<ManagedPrompt[]> {
    const apiUrl = `${this.config.cloudApiUrl}/api/prompts`;
    const apiKey = cloudConfig.getApiKey();
    
    if (!apiKey) {
      throw new Error('Not authenticated. Please run "promptfoo auth login" first.');
    }

    const response = await fetchWithRetries(apiUrl, {
      headers: { 
        'Authorization': `Bearer ${apiKey}`
      }
    }, 30000);
    
    if (!response.ok) {
      throw new Error('Failed to list prompts');
    }
    
    return response.json();
  }

  async getPrompt(id: string): Promise<ManagedPromptWithVersions | null> {
    if (this.config.mode === 'local') {
      return this.getPromptLocal(id);
    } else {
      return this.getPromptCloud(id);
    }
  }

  private async getPromptLocal(id: string): Promise<ManagedPromptWithVersions | null> {
    const promptsDir = this.config.localPath!;
    const filePath = path.join(promptsDir, `${id}.yaml`);
    
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = yaml.load(content) as PromptYaml;
      
      const latestVersion = data.versions[data.versions.length - 1];
      
      return {
        id: data.id,
        name: data.id,
        description: data.description,
        tags: data.tags,
        currentVersion: data.currentVersion,
        createdAt: new Date(data.versions[0].createdAt),
        updatedAt: new Date(latestVersion.createdAt),
        author: data.versions[0].author,
        versions: data.versions.map(v => ({
          id: `${data.id}-v${v.version}`,
          promptId: data.id,
          version: v.version,
          content: v.content,
          author: v.author,
          createdAt: new Date(v.createdAt),
          notes: v.notes,
        })),
        deployments: data.deployments,
      };
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  private async getPromptCloud(id: string): Promise<ManagedPromptWithVersions | null> {
    const apiUrl = `${this.config.cloudApiUrl}/api/prompts/${id}`;
    const apiKey = cloudConfig.getApiKey();
    
    if (!apiKey) {
      throw new Error('Not authenticated. Please run "promptfoo auth login" first.');
    }

    const response = await fetchWithRetries(apiUrl, {
      headers: { 
        'Authorization': `Bearer ${apiKey}`
      }
    }, 30000);
    
    if (response.status === 404) {
      return null;
    }
    
    if (!response.ok) {
      throw new Error('Failed to get prompt');
    }
    
    return response.json();
  }

  async updatePrompt(id: string, content: string, notes?: string): Promise<ManagedPromptWithVersions> {
    if (this.config.mode === 'local') {
      return this.updatePromptLocal(id, content, notes);
    } else {
      return this.updatePromptCloud(id, content, notes);
    }
  }

  private async updatePromptLocal(id: string, content: string, notes?: string): Promise<ManagedPromptWithVersions> {
    const prompt = await this.getPromptLocal(id);
    if (!prompt) {
      throw new Error(`Prompt with id "${id}" not found`);
    }

    const promptsDir = this.config.localPath!;
    const filePath = path.join(promptsDir, `${id}.yaml`);
    const data = yaml.load(await fs.readFile(filePath, 'utf-8')) as PromptYaml;
    
    const newVersion = data.currentVersion + 1;
    const author = getUserEmail() || 'unknown';
    const now = new Date();
    
    data.currentVersion = newVersion;
    data.versions.push({
      version: newVersion,
      author,
      createdAt: now.toISOString(),
      content,
      notes: notes || '',
    });
    
    await fs.writeFile(filePath, yaml.dump(data), 'utf-8');
    
    const result = await this.getPromptLocal(id);
    if (!result) {
      throw new Error(`Failed to retrieve updated prompt "${id}"`);
    }
    return result;
  }

  private async updatePromptCloud(id: string, content: string, notes?: string): Promise<ManagedPromptWithVersions> {
    const apiUrl = `${this.config.cloudApiUrl}/api/prompts/${id}/versions`;
    const apiKey = cloudConfig.getApiKey();
    
    if (!apiKey) {
      throw new Error('Not authenticated. Please run "promptfoo auth login" first.');
    }

    const response = await fetchWithRetries(apiUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ content, notes }),
    }, 30000);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to update prompt: ${error}`);
    }

    const result = await this.getPromptCloud(id);
    if (!result) {
      throw new Error(`Failed to retrieve updated prompt "${id}"`);
    }
    return result;
  }

  async diffPromptVersions(id: string, versionA?: number, versionB?: number): Promise<string> {
    const prompt = await this.getPrompt(id);
    if (!prompt) {
      throw new Error(`Prompt with id "${id}" not found`);
    }

    const versions = prompt.versions.sort((a, b) => a.version - b.version);
    
    // Default to comparing latest with previous version
    const targetVersionB = versionB || prompt.currentVersion;
    const targetVersionA = versionA || (targetVersionB > 1 ? targetVersionB - 1 : 1);
    
    const versionAObj = versions.find(v => v.version === targetVersionA);
    const versionBObj = versions.find(v => v.version === targetVersionB);
    
    if (!versionAObj || !versionBObj) {
      throw new Error('Version not found');
    }

    const diff = diffLines(versionAObj.content, versionBObj.content);
    
    let result = `Diff between version ${targetVersionA} and version ${targetVersionB}:\n`;
    result += '='.repeat(50) + '\n';
    
    diff.forEach(part => {
      const prefix = part.added ? '+' : part.removed ? '-' : ' ';
      const lines = part.value.split('\n').filter(line => line);
      lines.forEach(line => {
        result += `${prefix} ${line}\n`;
      });
    });
    
    return result;
  }

  async deployPrompt(id: string, environment: string, version?: number): Promise<void> {
    if (this.config.mode === 'local') {
      return this.deployPromptLocal(id, environment, version);
    } else {
      return this.deployPromptCloud(id, environment, version);
    }
  }

  private async deployPromptLocal(id: string, environment: string, version?: number): Promise<void> {
    const prompt = await this.getPromptLocal(id);
    if (!prompt) {
      throw new Error(`Prompt with id "${id}" not found`);
    }

    const targetVersion = version || prompt.currentVersion;
    const versionExists = prompt.versions.some(v => v.version === targetVersion);
    
    if (!versionExists) {
      throw new Error(`Version ${targetVersion} not found for prompt "${id}"`);
    }

    const promptsDir = this.config.localPath!;
    const filePath = path.join(promptsDir, `${id}.yaml`);
    const data = yaml.load(await fs.readFile(filePath, 'utf-8')) as PromptYaml;
    
    data.deployments = data.deployments || {};
    data.deployments[environment] = targetVersion;
    
    await fs.writeFile(filePath, yaml.dump(data), 'utf-8');
    
    logger.info(`Deployed prompt "${id}" version ${targetVersion} to ${environment}`);
  }

  private async deployPromptCloud(id: string, environment: string, version?: number): Promise<void> {
    const apiUrl = `${this.config.cloudApiUrl}/api/prompts/${id}/deploy`;
    const apiKey = cloudConfig.getApiKey();
    
    if (!apiKey) {
      throw new Error('Not authenticated. Please run "promptfoo auth login" first.');
    }

    const response = await fetchWithRetries(apiUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ environment, version }),
    }, 30000);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to deploy prompt: ${error}`);
    }
  }

  async deletePrompt(id: string): Promise<void> {
    if (this.config.mode === 'local') {
      return this.deletePromptLocal(id);
    } else {
      return this.deletePromptCloud(id);
    }
  }

  private async deletePromptLocal(id: string): Promise<void> {
    const promptsDir = this.config.localPath!;
    const filePath = path.join(promptsDir, `${id}.yaml`);
    
    try {
      await fs.unlink(filePath);
      logger.info(`Deleted prompt "${id}"`);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`Prompt with id "${id}" not found`);
      }
      throw error;
    }
  }

  private async deletePromptCloud(id: string): Promise<void> {
    const apiUrl = `${this.config.cloudApiUrl}/api/prompts/${id}`;
    const apiKey = cloudConfig.getApiKey();
    
    if (!apiKey) {
      throw new Error('Not authenticated. Please run "promptfoo auth login" first.');
    }

    const response = await fetchWithRetries(apiUrl, {
      method: 'DELETE',
      headers: { 
        'Authorization': `Bearer ${apiKey}`
      }
    }, 30000);

    if (response.status === 404) {
      throw new Error(`Prompt with id "${id}" not found`);
    }

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to delete prompt: ${error}`);
    }
  }

  async trackUsage(id: string): Promise<void> {
    try {
      if (this.config.mode === 'local') {
        // For local mode, we don't track usage to keep it simple
        return;
      }

      const apiUrl = `${this.config.cloudApiUrl}/api/prompts/${id}/usage`;
      const apiKey = cloudConfig.getApiKey();
      
      if (!apiKey) {
        return; // Silently skip if not authenticated
      }

      await fetchWithRetries(apiUrl, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${apiKey}`
        }
      }, 5000); // Short timeout for tracking
    } catch (error) {
      // Silently fail - we don't want usage tracking to break the main flow
      logger.debug(`Failed to track usage for prompt ${id}: ${error}`);
    }
  }

  async exportPrompts(ids?: string[]): Promise<Record<string, PromptYaml>> {
    const prompts = await this.listPrompts();
    const result: Record<string, PromptYaml> = {};
    
    const targetIds = ids || prompts.map(p => p.id);
    
    for (const id of targetIds) {
      const prompt = await this.getPrompt(id);
      if (prompt) {
        result[id] = {
          id: prompt.id,
          description: prompt.description,
          tags: prompt.tags,
          currentVersion: prompt.currentVersion,
          versions: prompt.versions.map(v => ({
            version: v.version,
            author: v.author || 'unknown',
            createdAt: v.createdAt.toISOString(),
            content: v.content,
            notes: v.notes,
          })),
          deployments: prompt.deployments || {},
        };
      }
    }
    
    return result;
  }

  async importPrompts(data: Record<string, PromptYaml>, overwrite: boolean = false): Promise<string[]> {
    const imported: string[] = [];
    const errors: string[] = [];
    
    for (const [id, promptData] of Object.entries(data)) {
      try {
        const existing = await this.getPrompt(id);
        
        if (existing && !overwrite) {
          errors.push(`Prompt "${id}" already exists (use --overwrite to replace)`);
          continue;
        }
        
        if (existing) {
          // Delete existing prompt first
          await this.deletePrompt(id);
        }
        
        // Create the prompt with first version
        const firstVersion = promptData.versions[0];
        await this.createPrompt(id, promptData.description, firstVersion.content);
        
        // Add remaining versions
        for (let i = 1; i < promptData.versions.length; i++) {
          const version = promptData.versions[i];
          await this.updatePrompt(id, version.content, version.notes);
        }
        
        // Apply deployments
        for (const [env, version] of Object.entries(promptData.deployments || {})) {
          await this.deployPrompt(id, env, version);
        }
        
        imported.push(id);
      } catch (error: any) {
        errors.push(`Failed to import "${id}": ${error.message}`);
      }
    }
    
    if (errors.length > 0) {
      logger.warn('Import completed with errors:');
      errors.forEach(err => logger.warn(`  - ${err}`));
    }
    
    return imported;
  }
} 