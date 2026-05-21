import path from 'path';

import type { SkillCallEntry } from '../../types/index';

interface CodexSkillPathCandidate {
  name: string;
  path: string;
}

export interface CodexCommandSkillItemAdapter<T> {
  getCommand: (item: T) => string | undefined;
  isSuccessfulCommand: (item: T) => boolean;
}

export interface CodexSkillMetadata {
  attemptedSkillCalls: SkillCallEntry[];
  skillCalls: SkillCallEntry[];
}

export interface CodexSkillRootPrefixOptions {
  codexHome?: string;
  gitRepositoryRoot?: string;
  homeDir?: string;
  workingDir?: string;
}

export function getCodexSkillRootPrefixes(options: CodexSkillRootPrefixOptions): string[] {
  const prefixes = new Set<string>();
  const addPrefix = (candidate?: string) => {
    if (!candidate) {
      return;
    }

    const normalized = candidate.replace(/\\/g, '/').replace(/\/+$/g, '');
    if (normalized) {
      prefixes.add(normalized);
    }
  };

  addPrefix(options.codexHome);
  addPrefix('/etc/codex');

  if (options.workingDir) {
    const resolvedWorkingDir = path.resolve(options.workingDir).replace(/\\/g, '/');
    addPrefix(path.posix.join(resolvedWorkingDir, '.agents'));

    if (options.gitRepositoryRoot) {
      addPrefix(path.posix.join(options.gitRepositoryRoot.replace(/\\/g, '/'), '.agents'));
    }
  }

  if (options.homeDir) {
    addPrefix(path.posix.join(options.homeDir.replace(/\\/g, '/'), '.codex'));
  }

  return Array.from(prefixes);
}

export function extractCodexSkillPathCandidates(
  text: string,
  skillRootPrefixes: readonly string[] = [],
): CodexSkillPathCandidate[] {
  const matches = new Map<string, CodexSkillPathCandidate>();

  for (const rawToken of text.split(/\s+/)) {
    const token = rawToken.replace(/^[`"'([{<]+|[`"',;:)\]}>]+$/g, '').trim();
    if (!token) {
      continue;
    }

    const normalizedPath = token.replace(/\\/g, '/');
    const repoMatch = normalizedPath.match(/^\.agents\/skills\/([^/\s]+)\/SKILL\.md$/);
    if (repoMatch) {
      if (isValidCodexSkillName(repoMatch[1])) {
        matches.set(normalizedPath, { name: repoMatch[1], path: normalizedPath });
      }
      continue;
    }

    const matchingRoot = skillRootPrefixes.find((prefix) =>
      normalizedPath.startsWith(`${prefix}/skills/`),
    );
    if (!matchingRoot) {
      continue;
    }

    const relativeSkillPath = normalizedPath.slice(matchingRoot.length + 1);
    const customRootMatch = relativeSkillPath.match(/^skills\/([^/\s]+)\/SKILL\.md$/);
    if (customRootMatch && isValidCodexSkillName(customRootMatch[1])) {
      matches.set(normalizedPath, { name: customRootMatch[1], path: normalizedPath });
    }
  }

  return Array.from(matches.values());
}

export function buildCodexSkillMetadata<T>(
  items: unknown,
  skillRootPrefixes: readonly string[],
  itemAdapter: CodexCommandSkillItemAdapter<T>,
): CodexSkillMetadata | undefined {
  if (!Array.isArray(items) || items.length === 0) {
    return undefined;
  }

  const commandItems = items as T[];
  const attemptedSkillCalls = extractCodexSkillCallsFromItems(
    commandItems,
    skillRootPrefixes,
    itemAdapter,
  );
  const skillCalls = extractCodexSkillCallsFromItems(commandItems, skillRootPrefixes, itemAdapter, {
    requireSuccessfulCommand: true,
  });

  if (skillCalls.length === 0 && attemptedSkillCalls.length <= skillCalls.length) {
    return undefined;
  }

  return { attemptedSkillCalls, skillCalls };
}

export function getCodexSkillMetadataFields(skillMetadata: CodexSkillMetadata): {
  attemptedSkillCalls?: SkillCallEntry[];
  skillCalls?: SkillCallEntry[];
} {
  return {
    ...(skillMetadata.skillCalls.length > 0 ? { skillCalls: skillMetadata.skillCalls } : {}),
    ...(skillMetadata.attemptedSkillCalls.length > skillMetadata.skillCalls.length
      ? { attemptedSkillCalls: skillMetadata.attemptedSkillCalls }
      : {}),
  };
}

function extractCodexSkillCallsFromItems<T>(
  items: T[],
  skillRootPrefixes: readonly string[],
  itemAdapter: CodexCommandSkillItemAdapter<T>,
  options: { requireSuccessfulCommand?: boolean } = {},
): SkillCallEntry[] {
  const skillCalls = new Map<string, CodexSkillPathCandidate>();

  for (const item of items) {
    if (options.requireSuccessfulCommand && !itemAdapter.isSuccessfulCommand(item)) {
      continue;
    }

    const command = itemAdapter.getCommand(item);
    if (!command) {
      continue;
    }

    for (const skillPath of extractCodexSkillPathCandidates(command, skillRootPrefixes)) {
      skillCalls.set(skillPath.path, skillPath);
    }
  }

  return Array.from(skillCalls.values()).map((skillCall) => ({
    name: skillCall.name,
    path: skillCall.path,
    source: 'heuristic',
  }));
}

function isValidCodexSkillName(name: string): boolean {
  return /^[A-Za-z0-9._:-]+$/.test(name);
}
