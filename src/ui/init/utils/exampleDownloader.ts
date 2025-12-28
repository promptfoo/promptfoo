/**
 * Example Downloader - Fetch and download examples from GitHub.
 *
 * Fetches the list of available examples and downloads selected
 * examples to the local filesystem.
 */

import * as fs from 'fs';
import * as path from 'path';

import { fetchWithProxy } from '../../../util/fetch';

const GITHUB_API_BASE = 'https://api.github.com/repos/promptfoo/promptfoo';
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/promptfoo/promptfoo/main';

export interface DownloadProgress {
  /** Current file being downloaded */
  currentFile: string;
  /** Number of files downloaded */
  filesDownloaded: number;
  /** Total files to download */
  totalFiles: number;
  /** Progress percentage (0-100) */
  percentage: number;
}

export interface DownloadResult {
  success: boolean;
  filesDownloaded: string[];
  errors: Array<{ file: string; error: string }>;
}

/**
 * Fetch the list of available examples from GitHub.
 */
export async function fetchExampleList(): Promise<string[]> {
  const response = await fetchWithProxy(`${GITHUB_API_BASE}/contents/examples`, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'promptfoo-cli',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch examples: ${response.statusText}`);
  }

  const contents = (await response.json()) as Array<{ name: string; type: string }>;

  // Filter to only directories (actual examples)
  return contents
    .filter((item) => item.type === 'dir')
    .map((item) => item.name)
    .sort();
}

/**
 * Get the list of files in an example directory.
 */
async function getExampleFiles(exampleName: string): Promise<string[]> {
  const response = await fetchWithProxy(`${GITHUB_API_BASE}/contents/examples/${exampleName}`, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'promptfoo-cli',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch example files: ${response.statusText}`);
  }

  const contents = (await response.json()) as Array<{ name: string; type: string; path: string }>;

  const files: string[] = [];

  for (const item of contents) {
    if (item.type === 'file') {
      files.push(item.path);
    } else if (item.type === 'dir') {
      // Recursively get files in subdirectories
      const subFiles = await getSubdirectoryFiles(item.path);
      files.push(...subFiles);
    }
  }

  return files;
}

/**
 * Recursively get files from a subdirectory.
 */
async function getSubdirectoryFiles(dirPath: string): Promise<string[]> {
  const response = await fetchWithProxy(`${GITHUB_API_BASE}/contents/${dirPath}`, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'promptfoo-cli',
    },
  });

  if (!response.ok) {
    return [];
  }

  const contents = (await response.json()) as Array<{ name: string; type: string; path: string }>;

  const files: string[] = [];

  for (const item of contents) {
    if (item.type === 'file') {
      files.push(item.path);
    } else if (item.type === 'dir') {
      const subFiles = await getSubdirectoryFiles(item.path);
      files.push(...subFiles);
    }
  }

  return files;
}

/**
 * Download a single file from GitHub.
 */
async function downloadFile(remotePath: string, localPath: string): Promise<void> {
  const response = await fetchWithProxy(`${GITHUB_RAW_BASE}/${remotePath}`, {
    headers: {
      'User-Agent': 'promptfoo-cli',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download ${remotePath}: ${response.statusText}`);
  }

  const content = await response.text();

  // Ensure directory exists
  const dir = path.dirname(localPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(localPath, content, 'utf-8');
}

/**
 * Download an example to a local directory.
 */
export async function downloadExample(
  exampleName: string,
  targetDirectory: string,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<DownloadResult> {
  const result: DownloadResult = {
    success: true,
    filesDownloaded: [],
    errors: [],
  };

  // Get list of files in the example
  const files = await getExampleFiles(exampleName);

  if (files.length === 0) {
    result.success = false;
    result.errors.push({ file: exampleName, error: 'No files found in example' });
    return result;
  }

  // Ensure target directory exists
  if (!fs.existsSync(targetDirectory)) {
    fs.mkdirSync(targetDirectory, { recursive: true });
  }

  // Download each file
  for (let i = 0; i < files.length; i++) {
    const remotePath = files[i];
    // Remove the examples/exampleName prefix from the path
    const relativePath = remotePath.replace(`examples/${exampleName}/`, '');
    const localPath = path.join(targetDirectory, relativePath);

    onProgress?.({
      currentFile: relativePath,
      filesDownloaded: i,
      totalFiles: files.length,
      percentage: Math.round((i / files.length) * 100),
    });

    try {
      await downloadFile(remotePath, localPath);
      result.filesDownloaded.push(relativePath);
    } catch (error) {
      result.success = false;
      result.errors.push({
        file: relativePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Final progress update
  onProgress?.({
    currentFile: '',
    filesDownloaded: files.length,
    totalFiles: files.length,
    percentage: 100,
  });

  return result;
}

/**
 * Get a description for an example based on common patterns.
 */
export function getExampleDescription(name: string): string {
  const descriptions: Record<string, string> = {
    // Provider examples
    'openai-chat': 'Basic OpenAI chat completion',
    'openai-function-calling': 'OpenAI function/tool calling',
    'openai-assistants': 'OpenAI Assistants API',
    anthropic: 'Anthropic Claude',
    'azure-openai': 'Azure OpenAI Service',
    'google-vertex': 'Google Vertex AI',
    'amazon-bedrock': 'Amazon Bedrock',
    ollama: 'Ollama local models',

    // RAG examples
    'rag-basic': 'Simple RAG evaluation',
    'rag-advanced': 'Advanced RAG with multiple retrievers',
    'rag-context-relevance': 'RAG context relevance testing',

    // Agent examples
    'agent-tool-use': 'Agent with tool use evaluation',
    langchain: 'LangChain integration',
    llamaindex: 'LlamaIndex integration',
    autogen: 'AutoGen multi-agent',

    // Red team examples
    'redteam-basic': 'Basic security testing',
    'redteam-advanced': 'Advanced adversarial testing',

    // Other
    'custom-provider': 'Custom provider implementation',
    'python-provider': 'Python-based provider',
    'http-provider': 'HTTP API provider',
  };

  // Check for exact match first
  if (descriptions[name]) {
    return descriptions[name];
  }

  // Check for partial matches
  for (const [key, desc] of Object.entries(descriptions)) {
    if (name.toLowerCase().includes(key.toLowerCase())) {
      return desc;
    }
  }

  // Fallback based on patterns
  if (name.includes('redteam') || name.includes('red-team')) {
    return 'Security/red team testing';
  }
  if (name.includes('rag')) {
    return 'RAG evaluation example';
  }
  if (name.includes('agent')) {
    return 'Agent evaluation example';
  }
  if (name.includes('tool')) {
    return 'Tool use evaluation';
  }

  return 'Promptfoo configuration example';
}
