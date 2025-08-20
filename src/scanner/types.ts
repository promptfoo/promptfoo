export type GenAiCapability =
  | 'chat'
  | 'embeddings'
  | 'image'
  | 'audio'
  | 'moderation'
  | 'agent'
  | 'rag'
  | 'unknown';

export interface DetectorRule {
  id: string;
  description: string;
  provider?: string;
  capability?: GenAiCapability;
  tags: string[];
  // Precompiled regex will be attached at runtime
  pattern: RegExp;
  // Optional language hint to reduce false positives
  languages?: string[];
  confidence: number; // 0..1
}

export interface RepoScanFinding {
  filePath: string;
  line: number;
  column: number;
  lineText: string;
  detectorId: string;
  description: string;
  provider?: string;
  capability?: GenAiCapability;
  confidence: number;
  tags: string[];
  // small snippet
  contextBefore?: string[];
  contextAfter?: string[];
  // Links
  repoRemote?: string;
  repoRef?: string;
  relativePath?: string;
  webUrl?: string;
  editorUrl?: string;
}

export interface RepoScanSummary {
  filesScanned: number;
  bytesScanned: number;
  findingsCount: number;
  byProvider: Record<string, number>;
  byCapability: Record<GenAiCapability | 'unknown', number>;
}

export interface RepoScanOptions {
  exclude?: string[];
  maxFileSizeBytes?: number;
  maxTotalBytes?: number;
  concurrency?: number;
  // languages to consider (file extensions), empty means all
  languages?: string[];
  // Link options
  gitRemote?: string; // e.g. https://github.com/owner/repo or git@github.com:owner/repo.git
  gitRef?: string; // commit SHA or ref
  editor?: 'vscode' | 'idea' | 'none';
}

export interface RepoScanResult {
  findings: RepoScanFinding[];
  summary: RepoScanSummary;
} 