# Ink-Based Init Command: Comprehensive Implementation Plan

## Overview

This plan describes the implementation of a unified, Ink-based `init` command that replaces both the regular init and redteam init flows with a modern, interactive wizard experience.

### Goals

1. **Unified experience** - Single wizard handles all init paths (example, eval, rag, agent, redteam)
2. **Back navigation** - Users can go back to previous steps
3. **Multi-select providers** - Select multiple providers with drill-down to specific models
4. **File preview** - See generated config before writing
5. **Searchable lists** - Type to filter long lists (providers, plugins, strategies)
6. **Visual progress** - Step indicator showing wizard progress
7. **Inline redteam** - No delegation to separate flow

---

## Current State Analysis

### Regular Init Flow (4 steps)
```
1. Use case: compare | rag | agent | redteam
2. Language: python | javascript (if rag/agent)
3. Provider: single-select from 14 options
4. Write files
```

### Redteam Init Flow (10+ steps)
```
1. Target type: existing | http | python
2. Target config: provider selection OR custom setup
3. System prompt: external editor ($EDITOR)
4. Purpose: text input describing app purpose
5. Plugin categories: multi-select (harmful, pii, etc.)
6. Plugins: multi-select within categories
7. Strategies: multi-select
8. Num tests: number input
9. Write files
10. Optional: generate tests immediately
```

### Pain Points Addressed
| Issue | Current | Ink Solution |
|-------|---------|--------------|
| Can't go back | Restart wizard | `←`/`b` to go back |
| No progress indicator | None | `[●●○○] Step 2 of 4` |
| Long lists | Scroll only | Type to search/filter |
| Single provider | Edit config later | Multi-select with drill-down |
| No preview | Blind write | Full YAML preview before write |
| Jarring `console.clear()` | Erases history | Clean Ink transitions |

---

## Architecture

### File Structure

```
src/ui/init/
├── InitApp.tsx                     # Main app container with router
├── initRunner.tsx                  # Entry point (exports initInk, shouldUseInkInit)
│
├── machines/
│   ├── initMachine.ts              # Main state machine (XState)
│   ├── initMachine.types.ts        # Type definitions
│   └── initMachine.actions.ts      # Machine actions (file writing, etc.)
│
├── components/
│   ├── shared/
│   │   ├── StepIndicator.tsx       # Visual step progress
│   │   ├── SearchableSelect.tsx    # Single-select with search
│   │   ├── MultiSelect.tsx         # Multi-select with search
│   │   ├── HierarchicalSelect.tsx  # Two-level selection (family → models)
│   │   ├── TextInput.tsx           # Styled single-line input
│   │   ├── FilePreview.tsx         # Tabbed file preview
│   │   ├── NavigationBar.tsx       # Back/Next/Cancel footer
│   │   └── HelpOverlay.tsx         # Keyboard shortcuts (reuse from eval)
│   │
│   ├── steps/
│   │   ├── PathStep.tsx            # Example vs New project
│   │   ├── ExampleStep.tsx         # Example selection + download
│   │   ├── UseCaseStep.tsx         # compare/rag/agent/redteam
│   │   ├── LanguageStep.tsx        # python/javascript
│   │   ├── ProviderStep.tsx        # Multi-select with drill-down
│   │   ├── PreviewStep.tsx         # File preview before write
│   │   └── CompleteStep.tsx        # Success with next steps
│   │
│   └── redteam/
│       ├── TargetStep.tsx          # Target type selection
│       ├── TargetConfigStep.tsx    # Model or custom config
│       ├── SystemPromptStep.tsx    # External editor integration
│       ├── PurposeStep.tsx         # Text input for purpose
│       ├── PluginStep.tsx          # Category → plugin selection
│       ├── StrategyStep.tsx        # Strategy multi-select
│       └── TestConfigStep.tsx      # numTests, immediate generate?
│
├── hooks/
│   ├── useWizardNavigation.ts      # Back/next/cancel logic
│   ├── useExternalEditor.ts        # Spawn $EDITOR and capture result
│   ├── useFilePreview.ts           # Generate preview content
│   └── useProviderValidation.ts    # Check API keys
│
├── utils/
│   ├── configGenerator.ts          # Generate YAML from wizard state
│   ├── fileWriter.ts               # Write files with progress
│   └── exampleDownloader.ts        # Download examples from GitHub
│
└── data/
    ├── providers.ts                # Provider catalog with models
    ├── plugins.ts                  # Plugin categories and descriptions
    └── strategies.ts               # Strategy descriptions
```

### State Machine Design

```typescript
// initMachine.types.ts

interface InitContext {
  // Path selection
  path: 'example' | 'new' | null;

  // Example flow
  exampleName: string | null;
  downloadProgress: number;
  downloadedFiles: string[];

  // Project flow - common
  useCase: 'compare' | 'rag' | 'agent' | 'redteam' | null;
  language: 'python' | 'javascript' | 'not_sure' | null;
  providers: SelectedProvider[];

  // Redteam-specific
  redteam: {
    targetType: 'existing' | 'http' | 'python' | null;
    targetConfig: Record<string, any>;
    systemPrompt: string;
    purpose: string;
    pluginCategories: string[];
    plugins: PluginSelection[];
    strategies: string[];
    numTests: number;
    generateImmediately: boolean;
  };

  // Output
  outputDirectory: string;
  filesToWrite: FileToWrite[];
  filesWritten: string[];

  // Errors
  error: string | null;
}

interface SelectedProvider {
  family: string;        // e.g., "openai"
  models: string[];      // e.g., ["openai:gpt-5", "openai:gpt-5-mini"]
  config?: Record<string, any>; // For custom providers
}

interface FileToWrite {
  path: string;
  content: string;
  exists: boolean;
  overwrite: boolean;
}

type InitState =
  | { value: 'idle' }
  | { value: 'selectingPath' }
  // Example flow
  | { value: 'example.selecting' }
  | { value: 'example.downloading' }
  | { value: 'example.complete' }
  // New project flow
  | { value: 'project.selectingUseCase' }
  | { value: 'project.selectingLanguage' }
  | { value: 'project.selectingProviders' }
  | { value: 'project.selectingModels' }
  // Redteam flow
  | { value: 'redteam.selectingTarget' }
  | { value: 'redteam.configuringTarget' }
  | { value: 'redteam.editingPrompt' }
  | { value: 'redteam.enteringPurpose' }
  | { value: 'redteam.selectingPluginCategories' }
  | { value: 'redteam.selectingPlugins' }
  | { value: 'redteam.selectingStrategies' }
  | { value: 'redteam.configuringTests' }
  // Common completion
  | { value: 'previewing' }
  | { value: 'writing' }
  | { value: 'complete' }
  | { value: 'error' };
```

### State Machine Diagram

```
                                    ┌─────────────────┐
                                    │      idle       │
                                    └────────┬────────┘
                                             │ START
                                             ▼
                                    ┌─────────────────┐
                                    │  selectingPath  │
                                    └────────┬────────┘
                          ┌──────────────────┼──────────────────┐
                          │ example          │ new              │
                          ▼                  ▼                  │
               ┌──────────────────┐ ┌─────────────────┐         │
               │ example.selecting│ │project.useCase │         │
               └────────┬─────────┘ └────────┬────────┘         │
                        │                    │                  │
                        ▼          ┌─────────┼─────────┐        │
               ┌──────────────────┐│         │         │        │
               │example.downloading│         │         │        │
               └────────┬─────────┘│         │         │        │
                        │          ▼         ▼         ▼        │
                        │     ┌────────┐ ┌───────┐ ┌────────┐   │
                        │     │language│ │language│ │redteam │   │
                        │     │(rag)   │ │(agent) │ │.target │   │
                        │     └───┬────┘ └───┬────┘ └───┬────┘   │
                        │         │          │          │        │
                        │         └────┬─────┘          │        │
                        │              ▼                │        │
                        │     ┌─────────────────┐       │        │
                        │     │project.providers│◄──────┤        │
                        │     └────────┬────────┘       │        │
                        │              │                │        │
                        │              │         ┌──────┴──────┐ │
                        │              │         │ redteam.*   │ │
                        │              │         │ (8 steps)   │ │
                        │              │         └──────┬──────┘ │
                        │              │                │        │
                        │              └───────┬────────┘        │
                        │                      ▼                 │
                        │             ┌─────────────────┐        │
                        └────────────►│   previewing    │        │
                                      └────────┬────────┘        │
                                               │ CONFIRM         │
                                               ▼                 │
                                      ┌─────────────────┐        │
                                      │    writing      │        │
                                      └────────┬────────┘        │
                                               │                 │
                                               ▼                 │
                                      ┌─────────────────┐        │
                                      │    complete     │◄───────┘
                                      └─────────────────┘
```

---

## Component Specifications

### 1. StepIndicator

```tsx
interface StepIndicatorProps {
  steps: Array<{ id: string; label: string }>;
  currentStep: string;
  completedSteps: string[];
}

// Renders:
// [●] Path  [●] Use Case  [◐] Providers  [○] Preview  [○] Complete
//                            ▲ current
```

### 2. HierarchicalSelect (Provider Selection)

Two-phase selection:
1. Select provider families (OpenAI, Anthropic, etc.)
2. Select specific models within each family

```tsx
interface HierarchicalSelectProps {
  families: ProviderFamily[];
  selected: SelectedProvider[];
  onSelect: (selected: SelectedProvider[]) => void;
  showApiKeyWarnings?: boolean;
}

// Phase 1 - Family selection:
// ┌─ Select providers (Space to toggle) ─────────────────┐
// │ ▸ [x] OpenAI          GPT models via OpenAI API     │
// │   [ ] Anthropic       Claude models                  │
// │   [ ] Google          Gemini models                  │
// │ ▸ [x] Ollama          Local models                   │
// │   [ ] Custom HTTP     Your own API endpoint          │
// │                                                       │
// │ 2 selected  [Enter] Next: Select models  [?] Help    │
// └───────────────────────────────────────────────────────┘

// Phase 2 - Model selection (shown after Enter):
// ┌─ OpenAI Models (Space to toggle) ────────────────────┐
// │ [x] gpt-5           Latest flagship model            │
// │ [x] gpt-5-mini      Fast and affordable              │
// │ [ ] gpt-4.1         Previous generation              │
// │ [ ] o3              Reasoning model                  │
// │ [ ] o4-mini         Fast reasoning                   │
// └───────────────────────────────────────────────────────┘
// ┌─ Ollama Models ──────────────────────────────────────┐
// │ [x] llama3.3        Meta's latest Llama              │
// │ [ ] phi4            Microsoft Phi-4                  │
// │ [ ] qwen2.5         Alibaba Qwen                     │
// └───────────────────────────────────────────────────────┘
```

### 3. MultiSelect with Search

```tsx
interface MultiSelectProps<T> {
  items: Array<{ value: T; label: string; description?: string }>;
  selected: T[];
  onSelect: (selected: T[]) => void;
  searchable?: boolean;
  grouped?: boolean;
  groupBy?: (item: T) => string;
}

// With search active:
// ┌─ Select plugins (/harm to filter) ───────────────────┐
// │ /harm                                                 │
// │                                                       │
// │ ▸ Harmful Content                                     │
// │   [x] harmful:violent-crime    Violent crime advice   │
// │   [x] harmful:hate             Hate speech            │
// │   [ ] harmful:self-harm        Self-harm content      │
// │                                                       │
// │ 2 of 32 selected  [/] search  [Space] toggle          │
// └───────────────────────────────────────────────────────┘
```

### 4. FilePreview

```tsx
interface FilePreviewProps {
  files: FileToWrite[];
  activeFile: number;
  onActiveChange: (index: number) => void;
  onToggleOverwrite: (path: string) => void;
}

// Renders:
// ┌─ Files to create ────────────────────────────────────┐
// │ [Tab] to switch files                                 │
// │                                                       │
// │ [promptfooconfig.yaml] [README.md] [provider.py]     │
// │      ▲ active                        ⚠️ exists        │
// │                                                       │
// │ ─────────────────────────────────────────────────────│
// │  1 │ # yaml-language-server: $schema=...             │
// │  2 │                                                  │
// │  3 │ description: "My eval"                          │
// │  4 │                                                  │
// │  5 │ prompts:                                         │
// │  6 │   - "Write a tweet about {{topic}}"             │
// │  7 │                                                  │
// │  8 │ providers:                                       │
// │  9 │   - openai:gpt-5                                │
// │ 10 │   - openai:gpt-5-mini                           │
// │    │ ...                                              │
// │                                                       │
// │ [Enter] Write all  [Esc] Go back  [?] Help           │
// └───────────────────────────────────────────────────────┘
```

### 5. SystemPromptStep (External Editor)

```tsx
// useExternalEditor.ts
interface UseExternalEditorOptions {
  initialContent: string;
  fileExtension?: string;  // .txt, .md, etc.
  editorCommand?: string;  // Override $EDITOR
}

interface UseExternalEditorResult {
  content: string;
  isEditing: boolean;
  error: string | null;
  openEditor: () => Promise<void>;
}

// Implementation:
// 1. Write initialContent to temp file
// 2. Pause Ink rendering (instance.unmount or waitUntilExit)
// 3. Spawn $EDITOR (or $VISUAL, or fallback chain: code, nano, vim, notepad)
// 4. Wait for editor to close
// 5. Read temp file content
// 6. Resume Ink rendering
// 7. Return content

// UI when not editing:
// ┌─ System Prompt ──────────────────────────────────────┐
// │                                                       │
// │ Your system prompt defines how the AI should behave.  │
// │                                                       │
// │ ┌─────────────────────────────────────────────────┐  │
// │ │ You are a helpful customer service assistant.   │  │
// │ │ You help users with orders and returns.         │  │
// │ │                                                  │  │
// │ │ Always be polite and professional.              │  │
// │ │                                                  │  │
// │ │ User: {{prompt}}                                │  │
// │ └─────────────────────────────────────────────────┘  │
// │                                                       │
// │ [e] Edit in $EDITOR  [Enter] Continue  [Esc] Back    │
// └───────────────────────────────────────────────────────┘
```

---

## Provider Catalog

```typescript
// data/providers.ts

export interface ProviderFamily {
  id: string;
  name: string;
  description: string;
  icon: string;  // Emoji for visual distinction
  apiKeyEnv?: string;
  website?: string;
  models: ProviderModel[];
  isCustom?: boolean;  // For HTTP, Python, JS providers
}

export interface ProviderModel {
  id: string;
  name: string;
  description: string;
  tags?: ('fast' | 'cheap' | 'reasoning' | 'vision' | 'latest' | 'deprecated')[];
  defaultSelected?: boolean;
  config?: Record<string, any>;  // Default config for this model
}

export const PROVIDER_CATALOG: ProviderFamily[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT and o-series models',
    icon: '🤖',
    apiKeyEnv: 'OPENAI_API_KEY',
    website: 'https://platform.openai.com',
    models: [
      {
        id: 'openai:gpt-5',
        name: 'GPT-5',
        description: 'Latest flagship model',
        tags: ['latest'],
        defaultSelected: true,
      },
      {
        id: 'openai:gpt-5-mini',
        name: 'GPT-5 Mini',
        description: 'Fast and affordable',
        tags: ['fast', 'cheap'],
        defaultSelected: true,
      },
      {
        id: 'openai:gpt-4.1',
        name: 'GPT-4.1',
        description: 'Previous generation flagship',
      },
      {
        id: 'openai:gpt-4.1-mini',
        name: 'GPT-4.1 Mini',
        description: 'Previous generation fast model',
        tags: ['fast', 'cheap'],
      },
      {
        id: 'openai:o3',
        name: 'o3',
        description: 'Advanced reasoning model',
        tags: ['reasoning'],
      },
      {
        id: 'openai:o4-mini',
        name: 'o4-mini',
        description: 'Fast reasoning model',
        tags: ['reasoning', 'fast'],
      },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude models',
    icon: '🎭',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    website: 'https://console.anthropic.com',
    models: [
      {
        id: 'anthropic:messages:claude-opus-4-5-20251101',
        name: 'Claude Opus 4.5',
        description: 'Most capable, latest',
        tags: ['latest'],
        defaultSelected: true,
      },
      {
        id: 'anthropic:messages:claude-sonnet-4-5-20250929',
        name: 'Claude Sonnet 4.5',
        description: 'Balanced performance and speed',
        tags: ['fast'],
      },
      {
        id: 'anthropic:messages:claude-3-7-sonnet-20250219',
        name: 'Claude 3.7 Sonnet',
        description: 'Previous generation',
      },
    ],
  },
  {
    id: 'google',
    name: 'Google',
    description: 'Gemini models via Vertex AI',
    icon: '🔷',
    apiKeyEnv: 'GOOGLE_APPLICATION_CREDENTIALS',
    models: [
      {
        id: 'vertex:gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        description: 'Latest Gemini model',
        tags: ['latest'],
        defaultSelected: true,
      },
      {
        id: 'vertex:gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        description: 'Fast Gemini model',
        tags: ['fast'],
      },
    ],
  },
  {
    id: 'ollama',
    name: 'Ollama',
    description: 'Local models via Ollama',
    icon: '🦙',
    website: 'https://ollama.ai',
    models: [
      {
        id: 'ollama:chat:llama3.3',
        name: 'Llama 3.3',
        description: "Meta's latest Llama",
        defaultSelected: true,
      },
      {
        id: 'ollama:chat:phi4',
        name: 'Phi-4',
        description: "Microsoft's Phi-4",
      },
      {
        id: 'ollama:chat:qwen2.5',
        name: 'Qwen 2.5',
        description: "Alibaba's Qwen",
      },
    ],
  },
  {
    id: 'bedrock',
    name: 'AWS Bedrock',
    description: 'Models via AWS Bedrock',
    icon: '☁️',
    apiKeyEnv: 'AWS_ACCESS_KEY_ID',
    models: [
      {
        id: 'bedrock:us.anthropic.claude-sonnet-4-5-20250929-v1:0',
        name: 'Claude Sonnet (Bedrock)',
        description: 'Claude via AWS',
        defaultSelected: true,
      },
      {
        id: 'bedrock:us.meta.llama3-3-70b-instruct-v1:0',
        name: 'Llama 3.3 70B (Bedrock)',
        description: 'Llama via AWS',
      },
    ],
  },
  {
    id: 'azure',
    name: 'Azure OpenAI',
    description: 'OpenAI models via Azure',
    icon: '☁️',
    apiKeyEnv: 'AZURE_OPENAI_API_KEY',
    models: [
      {
        id: 'azure:chat:gpt-4',
        name: 'GPT-4 (Azure)',
        description: 'GPT-4 via Azure deployment',
        config: {
          apiHost: 'YOUR_RESOURCE.openai.azure.com',
        },
      },
    ],
  },
  // Custom providers
  {
    id: 'custom-http',
    name: 'Custom HTTP',
    description: 'Your own HTTP API endpoint',
    icon: '🌐',
    isCustom: true,
    models: [
      {
        id: 'https://example.com/api/chat',
        name: 'HTTP Endpoint',
        description: 'Custom API URL',
      },
    ],
  },
  {
    id: 'custom-python',
    name: 'Python Script',
    description: 'Local Python provider',
    icon: '🐍',
    isCustom: true,
    models: [
      {
        id: 'file://provider.py',
        name: 'provider.py',
        description: 'Custom Python script',
      },
    ],
  },
  {
    id: 'custom-javascript',
    name: 'JavaScript Script',
    description: 'Local JavaScript provider',
    icon: '📜',
    isCustom: true,
    models: [
      {
        id: 'file://provider.js',
        name: 'provider.js',
        description: 'Custom JavaScript module',
      },
    ],
  },
];
```

---

## Plugin Catalog (for Redteam)

```typescript
// data/plugins.ts

export interface PluginCategory {
  id: string;
  name: string;
  description: string;
  plugins: PluginDefinition[];
}

export interface PluginDefinition {
  id: string;
  name: string;
  description: string;
  defaultSelected?: boolean;
  severity?: 'critical' | 'high' | 'medium' | 'low';
}

export const PLUGIN_CATALOG: PluginCategory[] = [
  {
    id: 'harmful',
    name: 'Harmful Content',
    description: 'Tests for generation of harmful or dangerous content',
    plugins: [
      { id: 'harmful:violent-crime', name: 'Violent Crime', description: 'Violence advice', severity: 'critical' },
      { id: 'harmful:hate', name: 'Hate Speech', description: 'Discriminatory content', severity: 'critical' },
      { id: 'harmful:self-harm', name: 'Self-Harm', description: 'Self-harm content', severity: 'critical' },
      // ... more
    ],
  },
  {
    id: 'security',
    name: 'Security',
    description: 'Tests for security vulnerabilities',
    plugins: [
      { id: 'pii', name: 'PII Leakage', description: 'Personal information exposure', severity: 'critical', defaultSelected: true },
      { id: 'sql-injection', name: 'SQL Injection', description: 'SQL injection attempts', severity: 'critical' },
      { id: 'shell-injection', name: 'Shell Injection', description: 'Command injection', severity: 'critical' },
      { id: 'ssrf', name: 'SSRF', description: 'Server-side request forgery', severity: 'high' },
    ],
  },
  {
    id: 'reliability',
    name: 'Reliability',
    description: 'Tests for reliability and robustness',
    plugins: [
      { id: 'hallucination', name: 'Hallucination', description: 'Factual accuracy', severity: 'medium', defaultSelected: true },
      { id: 'overreliance', name: 'Overreliance', description: 'Excessive AI trust', severity: 'low' },
      { id: 'contracts', name: 'Contracts', description: 'Unauthorized agreements', severity: 'medium' },
    ],
  },
  // ... more categories
];
```

---

## Implementation Phases

### Phase 1: Foundation (3-4 days)

**Day 1-2: Core Infrastructure**
- [ ] Create `src/ui/init/` directory structure
- [ ] Implement `initMachine.ts` with basic states (no redteam yet)
- [ ] Create `StepIndicator` component
- [ ] Create `NavigationBar` component with back/next/cancel
- [ ] Create `initRunner.tsx` with `shouldUseInkInit()` check

**Day 3-4: Shared Components**
- [ ] Implement `SearchableSelect` component
- [ ] Implement `MultiSelect` component
- [ ] Implement `HierarchicalSelect` for providers
- [ ] Add comprehensive tests for all shared components

### Phase 2: Regular Init Flow (2-3 days)

**Day 5-6: Core Steps**
- [ ] Implement `PathStep` (example vs new)
- [ ] Implement `UseCaseStep` (compare/rag/agent/redteam branching)
- [ ] Implement `LanguageStep` (conditional for rag/agent)
- [ ] Implement `ProviderStep` with hierarchical selection

**Day 7: Preview & Completion**
- [ ] Implement `FilePreview` component
- [ ] Implement `configGenerator.ts` for YAML generation
- [ ] Implement `PreviewStep` with file tabs
- [ ] Implement `CompleteStep` with next steps
- [ ] Implement file writing with progress

### Phase 3: Example Download Flow (1 day)

**Day 8:**
- [ ] Implement `ExampleStep` with GitHub example list
- [ ] Implement download progress display
- [ ] Handle download errors gracefully
- [ ] Add retry flow on failure

### Phase 4: Redteam Flow (4-5 days)

**Day 9-10: Target Configuration**
- [ ] Extend state machine with redteam states
- [ ] Implement `TargetStep` (provider type selection)
- [ ] Implement `TargetConfigStep` (model or custom config)
- [ ] Implement `useExternalEditor` hook
- [ ] Implement `SystemPromptStep` with editor integration

**Day 11-12: Plugin & Strategy Selection**
- [ ] Implement `PurposeStep` (text input)
- [ ] Implement `PluginStep` with category grouping
- [ ] Implement `StrategyStep`
- [ ] Implement `TestConfigStep` (numTests, generate option)

**Day 13: Redteam Config Generation**
- [ ] Extend `configGenerator.ts` for redteam YAML
- [ ] Add redteam-specific file preview
- [ ] Integrate with existing `doGenerateRedteam` for optional immediate generation

### Phase 5: Integration & Polish (2-3 days)

**Day 14-15: Integration**
- [ ] Wire up to `src/commands/init.ts` with feature flag
- [ ] Add telemetry for all steps (match existing funnel events)
- [ ] Handle edge cases (Ctrl+C, errors, missing API keys)
- [ ] Add keyboard help overlay

**Day 16: Testing & Documentation**
- [ ] Add integration tests for full flows
- [ ] Update CLI documentation
- [ ] Add migration guide in `docs/agents/`

---

## Testing Strategy

### Unit Tests
```
test/ui/init/
├── components/
│   ├── StepIndicator.test.tsx
│   ├── SearchableSelect.test.tsx
│   ├── MultiSelect.test.tsx
│   ├── HierarchicalSelect.test.tsx
│   └── FilePreview.test.tsx
├── machines/
│   └── initMachine.test.ts
└── utils/
    ├── configGenerator.test.ts
    └── externalEditor.test.ts
```

### Integration Tests
```typescript
describe('Init Wizard Integration', () => {
  describe('Regular init flow', () => {
    it('should complete compare flow with single provider');
    it('should complete rag flow with language selection');
    it('should handle back navigation correctly');
    it('should show file preview before writing');
    it('should warn about missing API keys');
  });

  describe('Example download flow', () => {
    it('should fetch and display examples list');
    it('should download example with progress');
    it('should handle download failure gracefully');
  });

  describe('Redteam init flow', () => {
    it('should complete full redteam wizard');
    it('should open external editor for system prompt');
    it('should filter plugins by category');
    it('should generate config with selected plugins and strategies');
  });
});
```

---

## Migration Strategy

1. **Feature flag**: `PROMPTFOO_INTERACTIVE_INIT=true`
2. **Parallel code**: Keep existing `init.ts` and `onboarding.ts` unchanged
3. **Detection**: Check TTY and feature flag in `init.ts` action handler
4. **Fallback**: If Ink fails, fall back to inquirer version
5. **Metrics**: Track usage of both paths via telemetry
6. **Graduation**: After validation, make Ink default (invert flag meaning)

```typescript
// In src/commands/init.ts action handler:
if (shouldUseInkInit()) {
  try {
    await runInkInit(directory, cmdObj);
  } catch (err) {
    logger.debug('Ink init failed, falling back to inquirer', { error: err });
    // Existing inquirer flow
    await handleExampleDownload(directory, cmdObj.example);
    // ...
  }
} else {
  // Existing inquirer flow
}
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| External editor doesn't work on all platforms | Medium | High | Fallback chain: $EDITOR → $VISUAL → platform-specific → inline |
| Ink rendering issues in some terminals | Low | Medium | Fallback to inquirer version |
| State machine complexity leads to bugs | Medium | Medium | Comprehensive unit tests, visualize with XState inspector |
| Provider catalog becomes stale | High | Low | Make catalog data-driven, consider fetching from API |
| Redteam flow too long for users | Medium | Medium | Add "quick start" option with sensible defaults |

---

## Success Metrics

1. **Completion rate**: % of users who complete init vs abandon
2. **Time to complete**: Average time from start to config written
3. **Back navigation usage**: How often users go back (validates feature value)
4. **Error rate**: Crashes or failures during init
5. **Satisfaction**: User feedback on new experience

---

## Open Questions

1. **Should we support "undo" for file writes?** (backup before overwrite)
2. **Should provider catalog be fetched from remote?** (stays current)
3. **Should we add a "quick start" mode?** (skip to sensible defaults)
4. **How to handle redteam "generate immediately" in Ink context?** (transition to eval UI?)
