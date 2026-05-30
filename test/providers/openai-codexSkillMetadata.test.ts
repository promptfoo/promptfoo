import path from 'path';

import { describe, expect, it } from 'vitest';
import {
  type CodexCommandSkillItemAdapter,
  buildCodexSkillMetadata,
  extractCodexSkillPathCandidates,
  getCodexSkillMetadataFields,
  getCodexSkillRootPrefixes,
} from '../../src/providers/openai/codexSkillMetadata';

describe('codexSkillMetadata', () => {
  describe('getCodexSkillRootPrefixes', () => {
    it('always includes the system codex root', () => {
      expect(getCodexSkillRootPrefixes({})).toEqual(['/etc/codex']);
    });

    it('normalizes backslashes and strips trailing slashes', () => {
      const prefixes = getCodexSkillRootPrefixes({ codexHome: 'C:\\codex\\home\\\\' });
      expect(prefixes).toContain('C:/codex/home');
    });

    it('deduplicates equal prefixes', () => {
      const prefixes = getCodexSkillRootPrefixes({ codexHome: '/etc/codex' });
      expect(prefixes).toEqual(['/etc/codex']);
    });

    it('adds the working dir .agents root and ignores an orphan git root without a working dir', () => {
      const workingDir = path.resolve('/repo/project');
      const withWorkingDir = getCodexSkillRootPrefixes({
        workingDir,
        gitRepositoryRoot: '/repo',
      });
      // The working dir is resolved to an absolute path, so derive the expected
      // prefix the same way rather than hard-coding a POSIX-only string.
      expect(withWorkingDir).toContain(
        path.posix.join(workingDir.replace(/\\/g, '/'), '.agents'),
      );
      expect(withWorkingDir).toContain('/repo/.agents');

      const orphanGitRoot = getCodexSkillRootPrefixes({ gitRepositoryRoot: '/repo' });
      expect(orphanGitRoot).toEqual(['/etc/codex']);
    });

    it('adds the home .codex root', () => {
      expect(getCodexSkillRootPrefixes({ homeDir: '/home/user' })).toContain('/home/user/.codex');
    });
  });

  describe('extractCodexSkillPathCandidates', () => {
    it('detects repo-local SKILL.md paths', () => {
      expect(extractCodexSkillPathCandidates('.agents/skills/repo-skill/SKILL.md --help')).toEqual([
        { name: 'repo-skill', path: '.agents/skills/repo-skill/SKILL.md' },
      ]);
    });

    it('strips wrapping punctuation from tokens', () => {
      expect(
        extractCodexSkillPathCandidates('`.agents/skills/repo-skill/SKILL.md`'),
      ).toEqual([{ name: 'repo-skill', path: '.agents/skills/repo-skill/SKILL.md' }]);
      expect(
        extractCodexSkillPathCandidates('(.agents/skills/repo-skill/SKILL.md),'),
      ).toEqual([{ name: 'repo-skill', path: '.agents/skills/repo-skill/SKILL.md' }]);
    });

    it('rejects wildcard skill segments as invalid names', () => {
      expect(extractCodexSkillPathCandidates('.agents/skills/*/SKILL.md')).toEqual([]);
    });

    it('rejects paths outside any known skill root', () => {
      expect(
        extractCodexSkillPathCandidates('/tmp/unrelated/skills/external/SKILL.md', ['/repo/.agents']),
      ).toEqual([]);
    });

    it('detects skills under a custom skill root prefix', () => {
      expect(
        extractCodexSkillPathCandidates('/repo/.agents/skills/custom/SKILL.md', ['/repo/.agents']),
      ).toEqual([{ name: 'custom', path: '/repo/.agents/skills/custom/SKILL.md' }]);
    });

    it('does not treat a string-prefix-but-not-path-segment root as a match', () => {
      // '/etc/codex-extra/...' must not match the '/etc/codex' prefix.
      expect(
        extractCodexSkillPathCandidates('/etc/codex-extra/skills/foo/SKILL.md', ['/etc/codex']),
      ).toEqual([]);
    });

    it('deduplicates a path repeated within one command', () => {
      expect(
        extractCodexSkillPathCandidates(
          '.agents/skills/repo-skill/SKILL.md .agents/skills/repo-skill/SKILL.md',
        ),
      ).toEqual([{ name: 'repo-skill', path: '.agents/skills/repo-skill/SKILL.md' }]);
    });
  });

  describe('buildCodexSkillMetadata', () => {
    const adapter: CodexCommandSkillItemAdapter = {
      getCommand: (item) => (item as { command?: string })?.command,
      isSuccessfulCommand: (item) => (item as { ok?: boolean })?.ok === true,
    };

    it('returns undefined for non-array or empty input', () => {
      expect(buildCodexSkillMetadata(undefined, [], adapter)).toBeUndefined();
      expect(buildCodexSkillMetadata('not-an-array', [], adapter)).toBeUndefined();
      expect(buildCodexSkillMetadata([], [], adapter)).toBeUndefined();
    });

    it('returns undefined when no command references a skill', () => {
      expect(
        buildCodexSkillMetadata([{ command: 'ls -la', ok: true }], [], adapter),
      ).toBeUndefined();
    });

    it('records a successful skill call as both attempted and confirmed', () => {
      const metadata = buildCodexSkillMetadata(
        [{ command: '.agents/skills/repo-skill/SKILL.md', ok: true }],
        [],
        adapter,
      );
      expect(metadata?.skillCalls).toEqual([
        { name: 'repo-skill', path: '.agents/skills/repo-skill/SKILL.md', source: 'heuristic' },
      ]);
      expect(metadata?.attemptedSkillCalls).toEqual(metadata?.skillCalls);
    });

    it('records a failed skill call as attempted only', () => {
      const metadata = buildCodexSkillMetadata(
        [{ command: '.agents/skills/repo-skill/SKILL.md', ok: false }],
        [],
        adapter,
      );
      expect(metadata?.attemptedSkillCalls).toHaveLength(1);
      expect(metadata?.skillCalls).toHaveLength(0);
    });
  });

  describe('getCodexSkillMetadataFields', () => {
    const skill = { name: 's', path: '.agents/skills/s/SKILL.md', source: 'heuristic' as const };

    it('emits skillCalls only when attempted equals confirmed', () => {
      expect(
        getCodexSkillMetadataFields({ attemptedSkillCalls: [skill], skillCalls: [skill] }),
      ).toEqual({ skillCalls: [skill] });
    });

    it('emits attemptedSkillCalls only when it exceeds confirmed calls', () => {
      expect(
        getCodexSkillMetadataFields({ attemptedSkillCalls: [skill], skillCalls: [] }),
      ).toEqual({ attemptedSkillCalls: [skill] });
    });

    it('omits empty skillCalls', () => {
      expect(getCodexSkillMetadataFields({ attemptedSkillCalls: [], skillCalls: [] })).toEqual({});
    });
  });
});
