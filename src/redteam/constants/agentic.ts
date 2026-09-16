export const AGENTIC_RUNTIME_PLUGINS = [
  'agentic:approval-continuity',
  'agentic:handoff-context-leakage',
  'agentic:agent-as-tool-boundary',
  'agentic:mcp-schema-injection',
  'agentic:session-memory-contamination',
  'agentic:tool-discovery-confusion',
  'agentic:tool-error-feedback-injection',
  'agentic:guardrail-coverage-gap',
] as const;

export type AgenticRuntimePlugin = (typeof AGENTIC_RUNTIME_PLUGINS)[number];

export const AGENTIC_MEMORY_PLUGINS = ['agentic:memory-poisoning'] as const;

export const AGENTIC_PLUGINS = [...AGENTIC_MEMORY_PLUGINS, ...AGENTIC_RUNTIME_PLUGINS] as const;

export type AgenticPlugin = (typeof AGENTIC_PLUGINS)[number];

export const AGENTIC_RUNTIME_PLUGIN_DISPLAY_NAMES: Record<AgenticRuntimePlugin, string> = {
  'agentic:approval-continuity': 'Agentic Approval Continuity',
  'agentic:handoff-context-leakage': 'Agentic Handoff Context Leakage',
  'agentic:agent-as-tool-boundary': 'Agentic Agent-as-Tool Boundary',
  'agentic:mcp-schema-injection': 'Agentic MCP Schema Injection',
  'agentic:session-memory-contamination': 'Agentic Session Memory Contamination',
  'agentic:tool-discovery-confusion': 'Agentic Tool Discovery Confusion',
  'agentic:tool-error-feedback-injection': 'Agentic Tool Error Feedback Injection',
  'agentic:guardrail-coverage-gap': 'Agentic Guardrail Coverage Gap',
};

export const AGENTIC_RUNTIME_PLUGIN_DESCRIPTIONS: Record<AgenticRuntimePlugin, string> = {
  'agentic:approval-continuity':
    'Tests whether agentic runtime approval decisions remain scoped to the intended tool call, run, session, and nested agent boundary.',
  'agentic:handoff-context-leakage':
    'Tests whether handoffs expose tool outputs, side effects, user data, or hidden coordinator instructions to the receiving agent.',
  'agentic:agent-as-tool-boundary':
    'Tests whether Agent.as_tool wrappers preserve nested-agent boundaries, approvals, input schemas, and custom output extraction constraints.',
  'agentic:mcp-schema-injection':
    'Tests whether MCP tool names, descriptions, schemas, and approval metadata can inject instructions into agent planning or approval decisions.',
  'agentic:session-memory-contamination':
    'Tests whether SDK sessions isolate users, tenants, runs, and resumed approvals without stale or cross-user memory contamination.',
  'agentic:tool-discovery-confusion':
    'Tests whether deferred tools, ToolSearchTool surfaces, tool namespaces, and hosted tool discovery expose or load tools outside the intended scope.',
  'agentic:tool-error-feedback-injection':
    'Tests whether tool errors, approval rejections, timeout messages, and MCP error payloads can inject follow-up instructions into the agent.',
  'agentic:guardrail-coverage-gap':
    'Tests whether input, output, function-tool, handoff, and nested-agent guardrails consistently cover the action that actually executes.',
};

export const AGENTIC_RUNTIME_PLUGIN_ALIASES: Record<AgenticRuntimePlugin, string> = {
  'agentic:approval-continuity': 'AgenticApprovalContinuity',
  'agentic:handoff-context-leakage': 'AgenticHandoffContextLeakage',
  'agentic:agent-as-tool-boundary': 'AgenticAgentAsToolBoundary',
  'agentic:mcp-schema-injection': 'AgenticMcpSchemaInjection',
  'agentic:session-memory-contamination': 'AgenticSessionMemoryContamination',
  'agentic:tool-discovery-confusion': 'AgenticToolDiscoveryConfusion',
  'agentic:tool-error-feedback-injection': 'AgenticToolErrorFeedbackInjection',
  'agentic:guardrail-coverage-gap': 'AgenticGuardrailCoverageGap',
};
