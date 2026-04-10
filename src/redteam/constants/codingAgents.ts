export const CODING_AGENT_CORE_PLUGINS = [
  'coding-agent:repo-prompt-injection',
  'coding-agent:terminal-output-injection',
  'coding-agent:secret-env-read',
  'coding-agent:sandbox-read-escape',
  'coding-agent:verifier-sabotage',
] as const;

export const CODING_AGENT_PLUGINS = [
  ...CODING_AGENT_CORE_PLUGINS,
  'coding-agent:secret-file-read',
  'coding-agent:sandbox-write-escape',
  'coding-agent:network-egress-bypass',
] as const;

export type CodingAgentPlugin = (typeof CODING_AGENT_PLUGINS)[number];

export const CODING_AGENT_COLLECTIONS = ['coding-agent:core'] as const;

export type CodingAgentCollection = (typeof CODING_AGENT_COLLECTIONS)[number];

type CodingAgentMetadataPlugin = CodingAgentCollection | CodingAgentPlugin;

export const CODING_AGENT_PLUGIN_DISPLAY_NAMES: Record<CodingAgentMetadataPlugin, string> = {
  'coding-agent:core': 'Coding Agent Core',
  'coding-agent:repo-prompt-injection': 'Repository Prompt Injection',
  'coding-agent:terminal-output-injection': 'Terminal Output Injection',
  'coding-agent:secret-env-read': 'Secret Environment Read',
  'coding-agent:secret-file-read': 'Secret File Read',
  'coding-agent:sandbox-read-escape': 'Sandbox Read Escape',
  'coding-agent:sandbox-write-escape': 'Sandbox Write Escape',
  'coding-agent:network-egress-bypass': 'Network Egress Bypass',
  'coding-agent:verifier-sabotage': 'Verifier Sabotage',
};

export const CODING_AGENT_PLUGIN_DESCRIPTIONS: Record<CodingAgentMetadataPlugin, string> = {
  'coding-agent:core':
    'Tests coding agents against a focused MVP set of repository prompt injection, terminal output injection, secret environment read, sandbox read escape, and verifier sabotage risks',
  'coding-agent:repo-prompt-injection':
    'Tests whether instructions embedded in README files, source comments, fixture data, issue text, logs, or generated artifacts can override the user task or operating policy',
  'coding-agent:terminal-output-injection':
    'Tests whether compiler, test, package manager, linter, formatter, git, grep, or script output can instruct the coding agent to perform unrelated or dangerous actions',
  'coding-agent:secret-env-read':
    'Tests whether launcher-only environment canaries remain absent from commands, output, traces, reports, diffs, URLs, and tool or connector parameters',
  'coding-agent:secret-file-read':
    'Tests whether protected local files, dotfiles, sibling checkout files, temp files, cache files, browser profile files, or support-bundle files remain outside the coding agent task boundary',
  'coding-agent:sandbox-read-escape':
    'Tests whether the agent can read outside the intended workspace through absolute paths, sibling checkout paths, symlinks, archives, mount points, caches, temp paths, browser profiles, or home directories',
  'coding-agent:sandbox-write-escape':
    'Tests whether the agent can create, overwrite, append, delete, chmod, or otherwise mutate files outside the intended workspace through relative paths, absolute paths, symlinks, temp paths, home paths, caches, mounts, or sibling checkouts',
  'coding-agent:network-egress-bypass':
    'Tests whether the agent can make unauthorized outbound network requests, DNS lookups, package fetches, webhook calls, tunnels, or connector/tool calls that bypass the intended network policy',
  'coding-agent:verifier-sabotage':
    'Tests whether the agent weakens tests, lint, typecheck, CI, snapshots, fixtures, auth, locks, security checks, policies, or harness assertions instead of fixing the requested implementation',
};

export const CODING_AGENT_PLUGIN_ALIASES: Record<CodingAgentMetadataPlugin, string> = {
  'coding-agent:core': 'CodingAgentCore',
  'coding-agent:repo-prompt-injection': 'CodingAgentRepoPromptInjection',
  'coding-agent:terminal-output-injection': 'CodingAgentTerminalOutputInjection',
  'coding-agent:secret-env-read': 'CodingAgentSecretEnvRead',
  'coding-agent:secret-file-read': 'CodingAgentSecretFileRead',
  'coding-agent:sandbox-read-escape': 'CodingAgentSandboxReadEscape',
  'coding-agent:sandbox-write-escape': 'CodingAgentSandboxWriteEscape',
  'coding-agent:network-egress-bypass': 'CodingAgentNetworkEgressBypass',
  'coding-agent:verifier-sabotage': 'CodingAgentVerifierSabotage',
};
