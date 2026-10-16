# Portable Bedrock Converse configuration

Import `BedrockConverseConfigInputSchema`,
`BedrockConverseProviderOptionsInputSchema`, their inferred input types, and their
JSON Schema documents from `promptfoo/contracts`. Use `safeParse` for serializable
authoring input. Conversion to JSON Schema fails on unrepresentable types.

The options schema pairs `bedrock:converse:<model>` IDs with the Converse config.
Native model IDs, regional inference profiles and application inference profile
ARNs are supported. IDs redirected to Responses, Messages, or bidirectional audio
are excluded. This is route coverage, not a model availability or permissions check.
Bare `bedrock:<model>` IDs currently use InvokeModel and are outside this contract.
Agents, knowledge bases, embeddings, InvokeModel and native API configuration are
also outside this contract.

Coverage follows the current runtime: AWS credentials/profile/bearer key, region,
endpoint, guardrails, sampling aliases, thinking, Nova reasoning, service tiers,
streaming, MCP, the three tool formats, tool choices, and callback strings.
Tool files and template strings are retained for execution. Open JSON is intentional
in tool input schemas and `additionalModelRequestFields`. Runtime callback functions
are excluded. No defaults, credentials, file reads or SDK initialization occur in
the portable layer; omitted credentials retain the runtime provider chain.

Model-specific thinking/sampling restrictions remain runtime decisions. The schema
does not add fields from pending PR #11568 (such as request metadata or output
configuration) before that implementation lands. Update this contract alongside
future Converse routing and request changes.

This PR stands on main, independently of the pending OpenAI/Azure/Anthropic/Gemini
contracts and reasoning refactor. Global YAML/editor and Cloud MCP wiring are
separate work.
