# Portable provider configuration

Import the input schemas, inferred input types, and JSON Schema documents from
`promptfoo/contracts`. Call `safeParse` on an authoring object before storing it.
The schemas apply no defaults, load no files, resolve no templates, and initialize
no SDKs. JSON Schema export fails if a type cannot be represented.

## Gemini GenerateContent

`GeminiProviderOptionsInputSchema` pairs configuration with these provider IDs:

- `google:gemini-*` and `palm:gemini-*` for AI Studio.
- `vertex:gemini-*` and `vertex:chat:gemini-*` for Vertex Gemini.

The union validates the service-specific configuration even when the other branch
fails. AI Studio accepts its API key and endpoint settings; Vertex accepts project,
region, credentials, ADC options, express mode, and Model Armor settings.
Omitted credentials retain runtime environment/ADC behavior. Strings can contain
templates and file references where supported by the provider. Inline response
schema objects match the existing runtime parser; the separate PR correcting the
legacy runtime response-schema TypeScript declarations remains independent.

GenerateContent sampling, thinking, safety, tools, streaming, speech configuration,
MCP and serializable callback references are covered. Open JSON is intentional in
schema documents, provider tool payloads, `passthrough`, and Google auth options.
Executable callback functions and SDK auth clients belong to runtime configuration.

Image generation, video, Live, embeddings, Interactions, and non-Gemini Vertex
models are outside this contract. Model IDs dispatched to those APIs by the current
factory are excluded, including implicit Omni, Robotics, Live Translate and native
image routes. `google:chat:<model>` is not a supported GenerateContent alias in the
current factory. Future routing changes must update these route tests.

Embedded MCP uses the client-only contract; standalone provider transforms and
`defaultArgs` are not accepted. Set `enabled: true` to enable the runtime client.

These exports are opt-in contracts. Global YAML/editor validation and Cloud MCP
integration remain separate work. This change builds on the OpenAI/MCP contracts on main and remains independent of
the pending Azure/Anthropic stack and shared Gemini pipeline refactor.
