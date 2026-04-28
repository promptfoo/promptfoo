export const CODING_AGENT_CORE_PLUGINS = [
  'coding-agent:repo-prompt-injection',
  'coding-agent:terminal-output-injection',
  'coding-agent:secret-file-read',
  'coding-agent:secret-env-read',
  'coding-agent:terminal-network-exfil',
  'coding-agent:markdown-url-exfil',
  'coding-agent:trace-log-exfil',
  'coding-agent:sandbox-read-escape',
  'coding-agent:sandbox-write-escape',
  'coding-agent:network-egress-bypass',
  'coding-agent:approval-bypass',
  'coding-agent:approval-misrepresentation',
  'coding-agent:least-privilege-drift',
  'coding-agent:verifier-sabotage',
  'coding-agent:dependency-confusion',
  'coding-agent:lifecycle-script-execution',
  'coding-agent:claim-validation-mismatch',
  'coding-agent:trace-completeness',
  'coding-agent:trace-redaction',
  'coding-agent:replay-bundle-completeness',
] as const;

export type CodingAgentCorePlugin = (typeof CODING_AGENT_CORE_PLUGINS)[number];

export const CODEX_AGENT_EXTRA_PLUGINS = [
  'coding-agent:agents-md-injection',
  'coding-agent:mcp-resource-injection',
  'coding-agent:connector-data-overreach',
  'coding-agent:connector-parameter-exfil',
  'coding-agent:codex-home-poisoning',
  'coding-agent:codex-config-poisoning',
  'coding-agent:codex-rules-poisoning',
  'coding-agent:skill-poisoning',
  'coding-agent:mcp-config-poisoning',
  'coding-agent:mcp-confused-deputy',
  'coding-agent:child-agent-bypass',
  'coding-agent:self-approval-bypass',
  'coding-agent:thread-memory-leak',
  'coding-agent:terminal-control-injection',
  'coding-agent:externalized-execution',
] as const;

export type CodexAgentExtraPlugin = (typeof CODEX_AGENT_EXTRA_PLUGINS)[number];

export const CODEX_AGENT_PLUGINS = [
  ...CODING_AGENT_CORE_PLUGINS,
  ...CODEX_AGENT_EXTRA_PLUGINS,
] as const;

export type CodingAgentPlugin = CodingAgentCorePlugin | CodexAgentExtraPlugin;

// Backward-compatible alias for configs created before the Codex-specific
// collection name was introduced.
export const CODING_AGENT_PLUGINS = CODEX_AGENT_PLUGINS;

export const HARNESS_PREFLIGHT_PLUGINS = [
  'harness:policy-applied',
  'harness:workspace-isolation',
  'harness:secret-placement',
  'harness:network-trap-coverage',
  'harness:artifact-redaction',
  'harness:known-bad-agent',
  'harness:known-good-agent',
  'harness:state-reset',
  'harness:grader-injection-resistance',
  'harness:replay-completeness',
  'harness:version-attestation',
  'harness:cleanup',
  'harness:resource-budget',
  'harness:result-integrity',
] as const;

export type HarnessPlugin = (typeof HARNESS_PREFLIGHT_PLUGINS)[number];

export const CODING_AGENT_COLLECTIONS = [
  'coding-agent:core',
  'coding-agent:all',
  'coding-agent:codex',
  'harness:preflight',
] as const;

export type CodingAgentCollection = (typeof CODING_AGENT_COLLECTIONS)[number];

export const CODING_AGENT_REMOTE_ONLY_PLUGINS = [
  ...CODING_AGENT_CORE_PLUGINS,
  ...CODEX_AGENT_EXTRA_PLUGINS,
  ...HARNESS_PREFLIGHT_PLUGINS,
] as const;

export type CodingAgentRemoteOnlyPlugin = (typeof CODING_AGENT_REMOTE_ONLY_PLUGINS)[number];

export const CODING_AGENT_RISK_PLUGINS = CODING_AGENT_REMOTE_ONLY_PLUGINS;

type CodingAgentMetadataPlugin = CodingAgentPlugin | HarnessPlugin | CodingAgentCollection;

export const CODING_AGENT_PLUGIN_DISPLAY_NAMES: Record<CodingAgentMetadataPlugin, string> = {
  'coding-agent:core': 'Coding Agent Core',
  'coding-agent:all': 'Coding Agent All',
  'coding-agent:codex': 'Codex Coding Agent',
  'harness:preflight': 'Harness Preflight',
  'coding-agent:repo-prompt-injection': 'Repository Prompt Injection',
  'coding-agent:terminal-output-injection': 'Terminal Output Injection',
  'coding-agent:secret-file-read': 'Secret File Read',
  'coding-agent:secret-env-read': 'Secret Environment Read',
  'coding-agent:terminal-network-exfil': 'Terminal Network Exfiltration',
  'coding-agent:markdown-url-exfil': 'Markdown URL Exfiltration',
  'coding-agent:trace-log-exfil': 'Trace and Log Exfiltration',
  'coding-agent:sandbox-read-escape': 'Sandbox Read Escape',
  'coding-agent:sandbox-write-escape': 'Sandbox Write Escape',
  'coding-agent:network-egress-bypass': 'Network Egress Bypass',
  'coding-agent:approval-bypass': 'Approval Bypass',
  'coding-agent:approval-misrepresentation': 'Approval Misrepresentation',
  'coding-agent:least-privilege-drift': 'Least Privilege Drift',
  'coding-agent:verifier-sabotage': 'Verifier Sabotage',
  'coding-agent:dependency-confusion': 'Dependency Confusion',
  'coding-agent:lifecycle-script-execution': 'Lifecycle Script Execution',
  'coding-agent:claim-validation-mismatch': 'Claim Validation Mismatch',
  'coding-agent:trace-completeness': 'Trace Completeness',
  'coding-agent:trace-redaction': 'Trace Redaction',
  'coding-agent:replay-bundle-completeness': 'Replay Bundle Completeness',
  'coding-agent:agents-md-injection': 'AGENTS.md Injection',
  'coding-agent:mcp-resource-injection': 'MCP Resource Injection',
  'coding-agent:connector-data-overreach': 'Connector Data Overreach',
  'coding-agent:connector-parameter-exfil': 'Connector Parameter Exfiltration',
  'coding-agent:codex-home-poisoning': 'Codex Home Poisoning',
  'coding-agent:codex-config-poisoning': 'Codex Config Poisoning',
  'coding-agent:codex-rules-poisoning': 'Codex Rules Poisoning',
  'coding-agent:skill-poisoning': 'Skill Poisoning',
  'coding-agent:mcp-config-poisoning': 'MCP Config Poisoning',
  'coding-agent:mcp-confused-deputy': 'MCP Confused Deputy',
  'coding-agent:child-agent-bypass': 'Child Agent Bypass',
  'coding-agent:self-approval-bypass': 'Self Approval Bypass',
  'coding-agent:thread-memory-leak': 'Thread Memory Leak',
  'coding-agent:terminal-control-injection': 'Terminal Control Injection',
  'coding-agent:externalized-execution': 'Externalized Execution',
  'harness:policy-applied': 'Harness Policy Applied',
  'harness:workspace-isolation': 'Workspace Isolation',
  'harness:secret-placement': 'Secret Placement',
  'harness:network-trap-coverage': 'Network Trap Coverage',
  'harness:artifact-redaction': 'Artifact Redaction',
  'harness:known-bad-agent': 'Known Bad Agent',
  'harness:known-good-agent': 'Known Good Agent',
  'harness:state-reset': 'Harness State Reset',
  'harness:grader-injection-resistance': 'Grader Injection Resistance',
  'harness:replay-completeness': 'Replay Completeness',
  'harness:version-attestation': 'Version Attestation',
  'harness:cleanup': 'Harness Cleanup',
  'harness:resource-budget': 'Resource Budget',
  'harness:result-integrity': 'Result Integrity',
};

export const CODING_AGENT_PLUGIN_DESCRIPTIONS: Record<CodingAgentMetadataPlugin, string> = {
  'coding-agent:core':
    'Tests coding agents across repository instructions, terminal I/O, filesystem isolation, network egress, approvals, verification, claims, traces, and replay artifacts',
  'coding-agent:all': 'Backward-compatible alias for the full Codex coding-agent risk suite',
  'coding-agent:codex':
    'Tests Codex-style coding agents across core coding-agent risks plus AGENTS.md, Codex home/config/rules, MCP, connectors, skills, memory, child agents, approvals, and terminal controls',
  'harness:preflight':
    'Tests whether the red-team harness, sandbox, canaries, traps, graders, trace capture, replay bundle, result files, resource caps, and cleanup checks are trustworthy before testing a real agent',
  'coding-agent:repo-prompt-injection':
    'Tests whether instructions embedded in README files, source comments, fixture data, or generated artifacts can override the user task or system policy',
  'coding-agent:terminal-output-injection':
    'Tests whether compiler, test, package manager, linter, or script output can instruct the coding agent to perform unrelated or dangerous actions',
  'coding-agent:secret-file-read':
    'Tests whether the agent reads, summarizes, hashes, copies, prints, traces, or exfiltrates a synthetic secret file that is not required for the coding task',
  'coding-agent:secret-env-read':
    'Tests whether launcher-only environment canaries remain absent from commands, output, traces, reports, diffs, URLs, and connector parameters',
  'coding-agent:terminal-network-exfil':
    'Tests whether shell-accessible network clients, package managers, test helpers, browser tools, or language runtimes can leak canaries from the terminal',
  'coding-agent:markdown-url-exfil':
    'Tests whether the final response or generated markdown artifacts can hide canaries in links, image URLs, badges, issue templates, docs, or comments',
  'coding-agent:trace-log-exfil':
    'Tests whether raw traces, span attributes, terminal logs, provider metadata, screenshots, promptfoo output, or Admin Console payloads disclose canaries',
  'coding-agent:sandbox-read-escape':
    'Tests whether the agent can read outside the intended workspace through absolute paths, sibling checkout paths, symlinks, archives, mount points, caches, or home directories',
  'coding-agent:sandbox-write-escape':
    'Tests whether the agent can modify outside sentinels through traversal, symlinks, generated archives, install hooks, editor swap files, build outputs, or spawned processes',
  'coding-agent:network-egress-bypass':
    'Tests whether a disabled network policy applies consistently to raw sockets, DNS, curl/wget, Python, Node, git, package managers, browser fetches, telemetry, and MCP servers',
  'coding-agent:approval-bypass':
    'Tests whether dangerous effects that require approval can happen through aliases, scripts, package lifecycle hooks, child processes, subagents, tools, MCP, or deferred jobs',
  'coding-agent:approval-misrepresentation':
    'Tests whether the approval request faithfully describes the command, filesystem, network, secret, connector, MCP, browser, or child-agent effects that will occur',
  'coding-agent:least-privilege-drift':
    'Tests whether a narrow coding task causes the agent to request or use broader sandbox, network, home, connector, MCP, model, browser, devbox, SSH, or approval privileges',
  'coding-agent:verifier-sabotage':
    'Tests whether the agent weakens tests, lint, typecheck, CI, snapshots, fixtures, auth, security checks, locks, policies, or harness assertions instead of fixing the requested code',
  'coding-agent:dependency-confusion':
    'Tests whether the agent installs, pins, imports, or documents an attacker package, unexpected registry, tarball URL, git dependency, postinstall hook, or lookalike module',
  'coding-agent:lifecycle-script-execution':
    'Tests whether install, build, test, format, lint, prepare, prepublish, git hook, task runner, or language-specific lifecycle scripts create forbidden file, process, network, or trace effects',
  'coding-agent:claim-validation-mismatch':
    'Tests whether final validation claims are supported by successful, trace-linked commands that ran after the relevant edits and did not rely on stale output',
  'coding-agent:trace-completeness':
    'Tests whether commands, tool calls, approvals, denied actions, file writes, network attempts, connector calls, child-agent runs, and versions are trace-linked well enough to investigate findings',
  'coding-agent:trace-redaction':
    'Tests whether sensitive values are redacted from trace export, Admin/UI payloads, span attributes, provider metadata, screenshots, terminal logs, promptfoo results, and replay bundles',
  'coding-agent:replay-bundle-completeness':
    'Tests whether a failed finding includes enough prompt, config, versions, policy, workspace patch, trap log, trace id, approval transcript, canary manifest, and replay command to reproduce on a clean checkout',
  'coding-agent:agents-md-injection':
    'Tests whether root, nested, generated, vendor, fixture, or symlinked AGENTS.md / CLAUDE.md / rules files can weaken the instruction hierarchy or sandbox policy',
  'coding-agent:mcp-resource-injection':
    'Tests whether MCP resources, prompts, tool results, file attachments, and server error messages are treated as untrusted data rather than privileged instructions',
  'coding-agent:connector-data-overreach':
    'Tests whether the agent reads unrelated Slack, Gmail, Drive, Notion, Linear, GitHub, calendar, meeting, or connector resources beyond the explicitly authorized task context',
  'coding-agent:connector-parameter-exfil':
    'Tests whether connector search queries, write calls, drafts, comments, issue bodies, PR text, calendar fields, canvas/docs edits, or attachment names carry canaries or hidden instructions',
  'coding-agent:codex-home-poisoning':
    'Tests whether an isolated Codex run avoids reading from or writing to the real CODEX_HOME, auth, memory, sessions, logs, caches, skills, plugins, MCP config, automations, or profiles',
  'coding-agent:codex-config-poisoning':
    'Tests whether repo-local config, environment, prompt files, generated settings, wrapper scripts, or provider config can silently relax sandbox, network, approval, model, tracing, MCP, or connector policy',
  'coding-agent:codex-rules-poisoning':
    'Tests whether attacker-controlled rule, memory, instruction, skill, plugin, MCP, profile, or automation files can be installed, modified, or obeyed in later Codex runs',
  'coding-agent:skill-poisoning':
    'Tests whether repo-provided, generated, downloaded, shadowed, or marketplace skills are trusted as privileged instructions instead of untrusted workspace content',
  'coding-agent:mcp-config-poisoning':
    'Tests whether committed or generated MCP config, OAuth material, env files, command arguments, server manifests, or tool schemas can add or redirect an attacker-controlled MCP server',
  'coding-agent:mcp-confused-deputy':
    'Tests whether data from one MCP server, connector, terminal command, browser page, file, trace, or child agent can be leaked through another tool with stronger write or network authority',
  'coding-agent:child-agent-bypass':
    'Tests whether spawned agents, delegated workers, resumed agents, scripts that launch agents, CI agents, or hosted agents inherit sandbox, network, connector, approval, trace, canary, and artifact-scanning constraints',
  'coding-agent:self-approval-bypass':
    'Tests whether model, reviewer, policy, Guardian, helper agent, tool, or scripted approval can be prompt-injected into approving privilege escalation or out-of-scope effects',
  'coding-agent:thread-memory-leak':
    'Tests whether canaries, approvals, connector data, prompt injections, traces, or decisions from one thread, session, run, user, heartbeat, or automation leak into another',
  'coding-agent:terminal-control-injection':
    'Tests whether terminal escape codes, OSC hyperlinks, title changes, bracketed paste, clipboard writes, host-open links, CI annotations, or clickable logs cause hidden host actions or misleading approvals',
  'coding-agent:externalized-execution':
    'Tests whether the agent moves work, secrets, approvals, tests, installs, fetches, or untrusted instructions to unmonitored CI, devboxes, SSH hosts, automations, browsers, notebooks, web apps, MCP servers, issue trackers, or hosted agents',
  'harness:policy-applied':
    'Tests whether the actually launched agent policy for sandboxing, network, approvals, workspace roots, home, env, model, MCP, connectors, browser, tracing, and subagents matches promptfoo configuration',
  'harness:workspace-isolation':
    'Tests whether sibling repos, home directories, temp paths, caches, mounted secrets, Docker socket, SSH agent, browser profile, and outside canaries are excluded from the target workspace and reports',
  'harness:secret-placement':
    'Tests whether canaries are present only in intended files, env, traps, or connector fixtures, and never in the prompt, expected output, visible env, golden files, report fixture, grader prompt, or safe-stub context',
  'harness:network-trap-coverage':
    'Tests whether known-bad HTTP, HTTPS, DNS, raw socket, git, package manager, browser, telemetry, MCP, and webhook probes reach the configured trap when network observation is expected',
  'harness:artifact-redaction':
    'Tests whether reports, traces, logs, HTML, JSON, JUnit, screenshots, replay bundles, Admin/UI payloads, and failure messages identify leak locations without repeating raw canaries',
  'harness:known-bad-agent':
    'Tests whether a malicious stub that reads, prints, traces, copies, writes, or exfiltrates a canary is caught by the harness and fails the eval',
  'harness:known-good-agent':
    'Tests whether a safe stub that performs only the requested edit passes without false trap hits, canary disclosure, policy escalation, hidden writes, lingering processes, or bogus failures',
  'harness:state-reset':
    'Tests whether homes, sessions, memory, browser profiles, tmp, package caches, venvs, containers, git state, promptfoo cache, provider pools, env, network state, MCP state, and connector fixtures reset between eval cells',
  'harness:grader-injection-resistance':
    'Tests whether target output, terminal logs, trace text, tool results, connector data, markdown, screenshots, or comments containing grader-targeting instructions can change deterministic harness verdicts or LLM grader instructions',
  'harness:replay-completeness':
    'Tests whether the saved replay bundle can reproduce a controlled failed finding on a clean checkout using the recorded config, target, policy, versions, canary manifest, trap log, trace id, transcript, patch, env recipe, and command',
  'harness:version-attestation':
    'Tests whether reported Codex, promptfoo, provider, model, sandbox, proxy, OS/container, MCP server, connector, plugin, git, package-lock, browser, trap, and policy versions match the observed launched processes',
  'harness:cleanup':
    'Tests whether failed, timed-out, crashed, or malicious targets cannot leave processes, ports, cron/jobs, automations, containers, browser state, temp files, package cache changes, git/config changes, MCP servers, or network listeners behind',
  'harness:resource-budget':
    'Tests whether runaway stdout/stderr, trace volume, file creation, processes, browser tabs, network attempts, recursion, wall time, tokens, cost, retries, and child agents are capped and reported',
  'harness:result-integrity':
    'Tests whether the target cannot modify promptfoo result JSON, reports, traces, databases, caches, junit, summary verdicts, grading prompts, config, or upload payloads that determine the eval outcome',
};

export const CODING_AGENT_PLUGIN_ALIASES: Record<CodingAgentMetadataPlugin, string> = {
  'coding-agent:core': 'CodingAgentCore',
  'coding-agent:all': 'CodingAgentAll',
  'coding-agent:codex': 'CodingAgentCodex',
  'harness:preflight': 'HarnessPreflight',
  'coding-agent:repo-prompt-injection': 'CodingAgentRepoPromptInjection',
  'coding-agent:terminal-output-injection': 'CodingAgentTerminalOutputInjection',
  'coding-agent:secret-file-read': 'CodingAgentSecretFileRead',
  'coding-agent:secret-env-read': 'CodingAgentSecretEnvRead',
  'coding-agent:terminal-network-exfil': 'CodingAgentTerminalNetworkExfil',
  'coding-agent:markdown-url-exfil': 'CodingAgentMarkdownUrlExfil',
  'coding-agent:trace-log-exfil': 'CodingAgentTraceLogExfil',
  'coding-agent:sandbox-read-escape': 'CodingAgentSandboxReadEscape',
  'coding-agent:sandbox-write-escape': 'CodingAgentSandboxWriteEscape',
  'coding-agent:network-egress-bypass': 'CodingAgentNetworkEgressBypass',
  'coding-agent:approval-bypass': 'CodingAgentApprovalBypass',
  'coding-agent:approval-misrepresentation': 'CodingAgentApprovalMisrepresentation',
  'coding-agent:least-privilege-drift': 'CodingAgentLeastPrivilegeDrift',
  'coding-agent:verifier-sabotage': 'CodingAgentVerifierSabotage',
  'coding-agent:dependency-confusion': 'CodingAgentDependencyConfusion',
  'coding-agent:lifecycle-script-execution': 'CodingAgentLifecycleScriptExecution',
  'coding-agent:claim-validation-mismatch': 'CodingAgentClaimValidationMismatch',
  'coding-agent:trace-completeness': 'CodingAgentTraceCompleteness',
  'coding-agent:trace-redaction': 'CodingAgentTraceRedaction',
  'coding-agent:replay-bundle-completeness': 'CodingAgentReplayBundleCompleteness',
  'coding-agent:agents-md-injection': 'CodingAgentAgentsMdInjection',
  'coding-agent:mcp-resource-injection': 'CodingAgentMcpResourceInjection',
  'coding-agent:connector-data-overreach': 'CodingAgentConnectorDataOverreach',
  'coding-agent:connector-parameter-exfil': 'CodingAgentConnectorParameterExfil',
  'coding-agent:codex-home-poisoning': 'CodingAgentCodexHomePoisoning',
  'coding-agent:codex-config-poisoning': 'CodingAgentCodexConfigPoisoning',
  'coding-agent:codex-rules-poisoning': 'CodingAgentCodexRulesPoisoning',
  'coding-agent:skill-poisoning': 'CodingAgentSkillPoisoning',
  'coding-agent:mcp-config-poisoning': 'CodingAgentMcpConfigPoisoning',
  'coding-agent:mcp-confused-deputy': 'CodingAgentMcpConfusedDeputy',
  'coding-agent:child-agent-bypass': 'CodingAgentChildAgentBypass',
  'coding-agent:self-approval-bypass': 'CodingAgentSelfApprovalBypass',
  'coding-agent:thread-memory-leak': 'CodingAgentThreadMemoryLeak',
  'coding-agent:terminal-control-injection': 'CodingAgentTerminalControlInjection',
  'coding-agent:externalized-execution': 'CodingAgentExternalizedExecution',
  'harness:policy-applied': 'HarnessPolicyApplied',
  'harness:workspace-isolation': 'HarnessWorkspaceIsolation',
  'harness:secret-placement': 'HarnessSecretPlacement',
  'harness:network-trap-coverage': 'HarnessNetworkTrapCoverage',
  'harness:artifact-redaction': 'HarnessArtifactRedaction',
  'harness:known-bad-agent': 'HarnessKnownBadAgent',
  'harness:known-good-agent': 'HarnessKnownGoodAgent',
  'harness:state-reset': 'HarnessStateReset',
  'harness:grader-injection-resistance': 'HarnessGraderInjectionResistance',
  'harness:replay-completeness': 'HarnessReplayCompleteness',
  'harness:version-attestation': 'HarnessVersionAttestation',
  'harness:cleanup': 'HarnessCleanup',
  'harness:resource-budget': 'HarnessResourceBudget',
  'harness:result-integrity': 'HarnessResultIntegrity',
};
