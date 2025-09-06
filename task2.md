# Provider Analysis: Default vs Redteam Providers

## Overview

This document traces through the codebase to understand the difference between default providers and redteam providers in the promptfoo system.

## Key Findings

### Default Providers (`src/providers/defaults.ts`)

**Purpose**: Used for **evaluating** prompts and test cases against target models during normal evaluation runs.

**Architecture**:

- **Multi-category system** with 6 specialized provider types:
  - Completion providers: `gradingJsonProvider`, `gradingProvider`, `llmRubricProvider`, `suggestionsProvider`, `synthesizeProvider`
  - Embedding providers: `embeddingProvider`
  - Moderation providers: `moderationProvider`

**Selection Logic** (lines 67-231):
Automatic credential-based hierarchy:

1. **Azure OpenAI** (if `preferAzure` conditions met - lines 104-129)
2. **Anthropic** (if `preferAnthropic` conditions met - lines 130-141)
3. **Google AI Studio** (if has Google credentials but not OpenAI/Anthropic - lines 142-152)
4. **Google Vertex** (if has Google default credentials - lines 153-167)
5. **Mistral** (if has Mistral API key - lines 168-183)
6. **GitHub Models** (if has GitHub credentials - lines 184-200)
7. **OpenAI** (fallback default - lines 201-210)

**Override Mechanisms**:

- `setDefaultCompletionProviders()` (line 59) - overrides all completion-type providers
- `setDefaultEmbeddingProviders()` (line 63) - overrides embedding providers

**Usage Context**: `promptfoo eval` commands

### Redteam Provider (`src/redteam/` system)

**Purpose**: Used for **generating** adversarial test cases during red team generation.

**Architecture**:

- **Single provider model**: One unified provider handles all generation tasks
- **Explicit configuration**: Defaults to `REDTEAM_MODEL = 'openai:chat:gpt-4.1-2025-04-14'` (plugins.ts:9)

**Configuration Hierarchy** (`src/redteam/commands/generate.ts:357`):

```typescript
provider: redteamConfig?.provider || options.provider;
```

Falls back to `REDTEAM_MODEL` constant.

**Provider Loading** (`src/redteam/index.ts:536`):

```typescript
const redteamProvider = await redteamProviderManager.getProvider({ provider });
```

**Usage Responsibilities**:

- **System purpose extraction** (line 724): `extractSystemPurpose(redteamProvider, prompts)`
- **Entity extraction** (line 733): `extractEntities(redteamProvider, prompts)`
- **Plugin test generation** (line 753): Passed to each plugin's action function
- **Custom plugin generation** (line 819): Used by CustomPlugin instances

**Usage Context**: `promptfoo redteam generate` commands

## System Separation

| Aspect              | Default Providers          | Redteam Provider             |
| ------------------- | -------------------------- | ---------------------------- |
| **Scope**           | Evaluation system          | Generation system            |
| **Provider Count**  | 6 specialized providers    | 1 unified provider           |
| **Selection Logic** | Automatic credential-based | Explicit configuration       |
| **Primary Use**     | Evaluating test cases      | Generating test cases        |
| **Commands**        | `promptfoo eval`           | `promptfoo redteam generate` |
| **Fallback**        | OpenAI providers           | `gpt-4.1-2025-04-14`         |

## Workflow Integration

1. **Generation Phase** (`promptfoo redteam generate`):
   - Uses **redteam provider** to generate adversarial test cases
   - Creates a config file (e.g., `redteam.yaml`) with generated test cases

2. **Evaluation Phase** (`promptfoo redteam eval`):
   - Uses **default providers** to evaluate the generated test cases against target model
   - The redteam provider is no longer involved

## Code References

- Default provider system: `src/providers/defaults.ts:67-231`
- Redteam provider constant: `src/redteam/constants/plugins.ts:9`
- Redteam provider configuration: `src/redteam/commands/generate.ts:357`
- Redteam provider loading: `src/redteam/index.ts:536`
- Provider manager: `src/redteam/providers/shared.ts`

---

## Complete Provider Loading Analysis in src/redteam

### Central Provider Manager (`src/redteam/providers/shared.ts`)

**The `redteamProviderManager` singleton** is the core of all redteam provider loading:

#### Key Components:

1. **`loadRedteamProvider()` function** (lines 26-56):
   - **Priority**: `provider` param → `cliState.config?.redteam?.provider` → fallback
   - **Fallback logic**:
     - `preferSmallModel=true` → `ATTACKER_MODEL_SMALL = 'gpt-4o-mini'`
     - `preferSmallModel=false` → `ATTACKER_MODEL = 'gpt-4.1-2025-04-14'`
   - **Provider types handled**:
     - `ApiProvider` object → direct use
     - String/ProviderOptions → `loadApiProviders()`
     - Fallback → `new OpenAiChatCompletionProvider()`

2. **`RedteamProviderManager` class** (lines 58-97):
   - **Caching**: Maintains `provider` and `jsonOnlyProvider` instances
   - **Methods**:
     - `setProvider()` - caches both regular and JSON-only versions
     - `getProvider()` - returns cached or loads new provider
     - `clearProvider()` - clears cache

### Provider Loading Locations

#### **1. Main Synthesis Function** (`src/redteam/index.ts:536`)

```typescript
const redteamProvider = await redteamProviderManager.getProvider({ provider });
```

**Used for**: System purpose extraction, entity extraction, plugin test generation

#### **2. Advanced Attack Providers**

**Crescendo Provider** (`src/redteam/providers/crescendo/index.ts`):

- Line 162: `redTeamProvider = await redteamProviderManager.getProvider({ provider: this.config.provider })`
- Line 181: `scoringProvider = await redteamProviderManager.getProvider({ provider: this.config.graderProvider })`

**Custom Provider** (`src/redteam/providers/custom/index.ts`):

- Line 200: `redTeamProvider = await redteamProviderManager.getProvider({ provider: this.config.provider })`
- Line 219: `scoringProvider = await redteamProviderManager.getProvider({ provider: this.config.graderProvider })`

**Iterative Providers**:

- `iterative.ts:560,564` - Loads both redteam and grading providers
- `iterativeTree.ts:980` - Loads redteam provider for tree-based attacks
- `iterativeImage.ts:551` - Loads redteam provider for image attacks

#### **3. Strategy-Level Loading**

**Multilingual Strategy** (`src/redteam/strategies/multilingual.ts:128`):

```typescript
const redteamProvider = await redteamProviderManager.getProvider({
  provider,
  preferSmallModel: true,
});
```

**Math Prompt Strategy** (`src/redteam/strategies/mathPrompt.ts:99`):

```typescript
const redteamProvider = await redteamProviderManager.getProvider({
  provider,
  preferSmallModel: true,
});
```

#### **4. Plugin-Level Loading**

**Base Plugin** (`src/redteam/plugins/base.ts:435`):

```typescript
provider: await redteamProviderManager.getProvider({ provider, preferSmallModel: true });
```

**Cross Session Leak Plugin** (`src/redteam/plugins/crossSessionLeak.ts:84`):

```typescript
const provider = await redteamProviderManager.getProvider({ provider });
```

### Provider Type Variations

#### **Direct Provider Creation** (bypassing manager):

- `harmful/unaligned.ts:15`: `new PromptfooHarmfulCompletionProvider()`
- Multiple locations: `new PromptfooChatCompletionProvider()`

#### **Target Provider Usage**:

- `bestOfN.ts:64`: `context.originalProvider` - uses evaluation target
- `agentic/memoryPoisoning.ts:43`: `context?.originalProvider` - uses evaluation target
- `goat.ts:121`: `context?.originalProvider` - uses evaluation target

### Provider Configuration Hierarchy

1. **Explicit provider parameter** (highest priority)
2. **Config-based provider** (`cliState.config?.redteam?.provider`)
3. **Default model fallback**:
   - Regular: `ATTACKER_MODEL = 'gpt-4.1-2025-04-14'`
   - Small model: `ATTACKER_MODEL_SMALL = 'gpt-4o-mini'`

### Key Provider Loading Patterns

#### **Pattern 1: Generation Tasks**

```typescript
// Uses main redteam provider for test case generation
const redteamProvider = await redteamProviderManager.getProvider({ provider });
```

#### **Pattern 2: Small Model Preference**

```typescript
// Uses smaller model for faster/cheaper operations
const provider = await redteamProviderManager.getProvider({ provider, preferSmallModel: true });
```

#### **Pattern 3: JSON-Only Responses**

```typescript
// Forces JSON response format
const provider = await redteamProviderManager.getProvider({ provider, jsonOnly: true });
```

#### **Pattern 4: Target Provider Access**

```typescript
// Accesses the evaluation target (not redteam provider)
const targetProvider = context.originalProvider;
```

### Provider Lifecycle

1. **Configuration Phase**: Provider configured via CLI/config file
2. **Caching Phase**: `RedteamProviderManager` caches provider instances
3. **Generation Phase**: Multiple components request providers via `getProvider()`
4. **Evaluation Phase**: Switches to default providers system

This architecture ensures consistent provider loading across all redteam components while maintaining performance through caching and flexibility through configuration options.

---

## Integration Proposal: Adding Redteam Provider to Defaults System

### Motivation

**Current Pain Points:**

1. **Dual provider systems**: Maintenance overhead with separate defaults and redteam provider management
2. **Inconsistent configuration**: Users configure evaluation providers via credentials but redteam providers via explicit config
3. **Limited provider selection**: Redteam system doesn't leverage automatic provider selection based on available credentials
4. **Override complexity**: No unified way to override redteam providers like other provider types

**Benefits of Integration:**

- **Unified configuration**: Single place to manage all provider types
- **Credential-based selection**: Automatic redteam provider selection based on available credentials
- **Consistent overrides**: Use same pattern as `setDefaultCompletionProviders()`
- **Better defaults**: Smarter fallbacks based on user's available providers

### Design Proposal

#### **1. Extend DefaultProviders Interface**

```typescript
// src/types/providers.ts
export interface DefaultProviders {
  embeddingProvider: ApiProvider;
  gradingJsonProvider: ApiProvider;
  gradingProvider: ApiProvider;
  llmRubricProvider?: ApiProvider;
  moderationProvider: ApiProvider;
  suggestionsProvider: ApiProvider;
  synthesizeProvider: ApiProvider;
  redteamProvider?: ApiProvider; // NEW: Optional redteam provider
}
```

#### **2. Add Redteam Provider Category**

```typescript
// src/providers/defaults.ts
const REDTEAM_PROVIDERS: (keyof DefaultProviders)[] = ['redteamProvider'];

let defaultRedteamProvider: ApiProvider;

export async function setDefaultRedteamProviders(provider: ApiProvider) {
  defaultRedteamProvider = provider;
}
```

#### **3. Enhance getDefaultProviders() Function**

For each vendor section, add redteam provider assignment:

```typescript
// Example for Anthropic section (lines 130-141)
providers = {
  embeddingProvider: OpenAiEmbeddingProvider,
  gradingJsonProvider: anthropicProviders.gradingJsonProvider,
  gradingProvider: anthropicProviders.gradingProvider,
  llmRubricProvider: anthropicProviders.llmRubricProvider,
  moderationProvider: OpenAiModerationProvider,
  suggestionsProvider: anthropicProviders.suggestionsProvider,
  synthesizeProvider: anthropicProviders.synthesizeProvider,
  redteamProvider: anthropicProviders.redteamProvider, // NEW
};
```

#### **4. Create Vendor-Specific Redteam Providers**

Each vendor provider file would export a redteam provider:

```typescript
// src/providers/anthropic/defaults.ts
export function getAnthropicProviders(env?: EnvOverrides) {
  return {
    // ... existing providers
    redteamProvider: new AnthropicProvider('claude-3.5-sonnet', {
      config: { temperature: 0.7 },
    }),
  };
}
```

#### **5. Update RedteamProviderManager Integration**

```typescript
// src/redteam/providers/shared.ts
async function loadRedteamProvider({ provider, jsonOnly = false, preferSmallModel = false } = {}) {
  // NEW: Try defaults system first if no explicit provider
  if (!provider && !cliState.config?.redteam?.provider) {
    try {
      const { redteamProvider } = await import('../../providers/defaults');
      const defaultProviders = await redteamProvider.getDefaultProviders();
      if (defaultProviders.redteamProvider) {
        logger.debug(`Using default redteam provider: ${defaultProviders.redteamProvider.id()}`);
        return configureForOptions(defaultProviders.redteamProvider, {
          jsonOnly,
          preferSmallModel,
        });
      }
    } catch (error) {
      logger.debug('Failed to load default redteam provider, falling back to constants');
    }
  }

  // Existing logic as fallback...
  // ...
}
```

### Implementation Strategy

#### **Phase 1: Foundation** (Backward Compatible)

1. **Extend DefaultProviders interface** with optional `redteamProvider`
2. **Add `setDefaultRedteamProviders()`** function
3. **Update each vendor section** in `getDefaultProviders()` to include redteam provider
4. **Create vendor-specific redteam providers** with appropriate models:
   - Anthropic: `claude-3.5-sonnet`
   - OpenAI: `gpt-4.1-2025-04-14`
   - Google: `gemini-1.5-pro`
   - Azure: Use deployment name with GPT-4 class model
   - Mistral: `mistral-large-latest`

#### **Phase 2: Integration** (Opt-in)

5. **Modify `loadRedteamProvider()`** to check defaults system first
6. **Add configuration option** to enable/disable defaults integration
7. **Update tests** to cover new integration paths
8. **Add documentation** for new configuration options

#### **Phase 3: Migration** (Optional)

9. **Deprecate explicit redteam provider config** in favor of defaults system
10. **Migrate existing configurations** with migration helper
11. **Update examples and documentation** to use new pattern

### Migration Path

#### **Backward Compatibility**

- All existing redteam configurations continue working unchanged
- `redteamProvider` is optional in DefaultProviders interface
- Current `redteamProviderManager` logic preserved as fallback

#### **Opt-in Integration**

```yaml
# Current approach (continues to work)
redteam:
  provider: 'anthropic:chat:claude-3.5-sonnet'
# New approach (automatic based on credentials)
# Just ensure ANTHROPIC_API_KEY is set - no explicit provider needed
```

#### **Configuration Override**

```typescript
// Programmatic override of all redteam providers
await setDefaultRedteamProviders(customRedteamProvider);

// Environment-based selection (automatic)
// ANTHROPIC_API_KEY -> claude-3.5-sonnet for redteam
// OPENAI_API_KEY -> gpt-4.1-2025-04-14 for redteam
```

### Vendor-Specific Redteam Models

| Vendor               | Redteam Provider       | Reasoning                                     |
| -------------------- | ---------------------- | --------------------------------------------- |
| **Anthropic**        | `claude-3.5-sonnet`    | Latest, most capable model                    |
| **OpenAI**           | `gpt-4.1-2025-04-14`   | Current REDTEAM_MODEL constant                |
| **Google AI Studio** | `gemini-1.5-pro`       | Most capable model for adversarial generation |
| **Google Vertex**    | `gemini-1.5-pro`       | Same model, different endpoint                |
| **Azure**            | User's deployment      | Use configured deployment name                |
| **Mistral**          | `mistral-large-latest` | Most capable model                            |
| **GitHub Models**    | `gpt-4o`               | Most capable available model                  |

### Benefits Analysis

#### **Pros:**

- **Unified configuration**: Single system for all provider management
- **Automatic selection**: Smart defaults based on available credentials
- **Consistent API**: Same override pattern as other provider types
- **Better defaults**: Each vendor gets optimized redteam model
- **Reduced complexity**: Eliminate duplicate provider selection logic
- **Enhanced testing**: Easier to test different provider combinations

#### **Considerations:**

- **Additional complexity**: More provider configurations to maintain
- **Model costs**: Advanced models might be more expensive
- **Backward compatibility**: Need to ensure existing configs continue working
- **Configuration precedence**: Clear hierarchy of provider selection needed

### Usage Examples

#### **Automatic Provider Selection**

```bash
# User has ANTHROPIC_API_KEY set
export ANTHROPIC_API_KEY="sk-ant-..."
promptfoo redteam generate  # Uses claude-3.5-sonnet automatically

# User has OPENAI_API_KEY set
export OPENAI_API_KEY="sk-..."
promptfoo redteam generate  # Uses gpt-4.1-2025-04-14 automatically
```

#### **Programmatic Override**

```typescript
import { setDefaultRedteamProviders } from './providers/defaults';

// Override all redteam operations to use custom provider
await setDefaultRedteamProviders(new CustomRedteamProvider());
```

#### **Mixed Configuration**

```yaml
# Use defaults for most providers, override only redteam
providers:
  - id: 'anthropic:chat:claude-3.5-sonnet' # Target for evaluation

# Redteam automatically uses claude-3.5-sonnet based on ANTHROPIC_API_KEY
```

This integration provides a path toward unified provider management while maintaining full backward compatibility and offering enhanced configuration flexibility.

---

## Success Criteria and Validation

### **Success Criteria**

#### **Phase 1: Foundation**

1. ✅ **Interface Extension**: `DefaultProviders` includes optional `redteamProvider` field
2. ✅ **Function Addition**: `setDefaultRedteamProviders()` function exists and works
3. ✅ **Vendor Integration**: All 7 vendor sections in `getDefaultProviders()` include redteam providers
4. ✅ **Provider Creation**: Each vendor file exports appropriate redteam provider
5. ✅ **Backward Compatibility**: All existing redteam configurations continue working unchanged
6. ✅ **Test Coverage**: New functionality covered by comprehensive tests

#### **Phase 2: Integration**

7. ✅ **Manager Integration**: `loadRedteamProvider()` checks defaults system first
8. ✅ **Configuration Option**: Environment variable or config to enable/disable integration
9. ✅ **Override System**: `setDefaultRedteamProviders()` affects all 13 provider loading locations
10. ✅ **Fallback Logic**: Graceful fallback to current system if defaults integration fails
11. ✅ **Performance**: No performance degradation in provider loading
12. ✅ **Documentation**: Clear documentation for new configuration patterns

#### **Phase 3: Migration**

13. ✅ **Migration Helper**: Tool to convert existing configs to new pattern
14. ✅ **Deprecation Warnings**: Clear warnings for old configuration patterns
15. ✅ **Example Updates**: All examples use new automatic provider selection

### **Validation Steps**

#### **Comprehensive Provider Loading Validation**

**All 13 Provider Loading Locations Must Work:**

1. **Main synthesis** (`src/redteam/index.ts:536`)
2. **Crescendo provider** (`src/redteam/providers/crescendo/index.ts:162,181`)
3. **Custom provider** (`src/redteam/providers/custom/index.ts:200,219`)
4. **Iterative providers** (`iterative.ts:560,564`, `iterativeTree.ts:980`, `iterativeImage.ts:551`)
5. **Multilingual strategy** (`src/redteam/strategies/multilingual.ts:128`)
6. **Math prompt strategy** (`src/redteam/strategies/mathPrompt.ts:99`)
7. **Base plugin** (`src/redteam/plugins/base.ts:435`)
8. **Cross session leak plugin** (`src/redteam/plugins/crossSessionLeak.ts:84`)

#### **Test Matrix**

**Provider Selection Tests:**

```bash
# Test 1: Automatic Anthropic selection
export ANTHROPIC_API_KEY="test-key"
unset OPENAI_API_KEY GOOGLE_API_KEY
promptfoo redteam generate
# Expected: Uses claude-3.5-sonnet from defaults

# Test 2: Automatic OpenAI selection
export OPENAI_API_KEY="test-key"
unset ANTHROPIC_API_KEY GOOGLE_API_KEY
promptfoo redteam generate
# Expected: Uses gpt-4.1-2025-04-14 from defaults

# Test 3: Explicit provider override
export ANTHROPIC_API_KEY="test-key"
promptfoo redteam generate --provider "openai:chat:gpt-3.5-turbo"
# Expected: Uses gpt-3.5-turbo, ignores defaults

# Test 4: Programmatic override
await setDefaultRedteamProviders(customProvider);
promptfoo redteam generate
# Expected: Uses customProvider for all operations
```

**Backward Compatibility Tests:**

```yaml
# Test 5: Existing config continues working
redteam:
  provider: "anthropic:chat:claude-3.5-sonnet"
# Expected: Uses explicit provider, ignores defaults

# Test 6: Mixed configuration
providers:
  - id: "openai:chat:gpt-4"
redteam: {}  # No explicit provider
# Expected: Uses automatic selection based on credentials
```

#### **Integration Point Validation**

**Each Provider Loading Location:**

1. **Without explicit config**: Should use defaults system
2. **With explicit config**: Should use explicit config (backward compatibility)
3. **With override set**: Should use override provider
4. **With preferSmallModel**: Should handle model size preference
5. **With jsonOnly**: Should handle JSON formatting

#### **Vendor-Specific Validation**

**For each vendor (7 total):**

- ✅ **Credential detection**: Proper credential checking logic
- ✅ **Provider instantiation**: Correct model and configuration
- ✅ **Fallback behavior**: Graceful degradation if provider fails
- ✅ **Override compatibility**: Works with `setDefaultRedteamProviders()`

### **Complete Instance Coverage**

#### **All Provider Loading Instances Identified and Handled:**

**Direct `redteamProviderManager.getProvider()` calls (13 locations):**

1. `src/redteam/index.ts:536` - Main synthesis function
2. `src/redteam/providers/crescendo/index.ts:162` - Crescendo redteam provider
3. `src/redteam/providers/crescendo/index.ts:181` - Crescendo scoring provider
4. `src/redteam/providers/custom/index.ts:200` - Custom redteam provider
5. `src/redteam/providers/custom/index.ts:219` - Custom scoring provider
6. `src/redteam/providers/iterative.ts:560` - Iterative redteam provider
7. `src/redteam/providers/iterative.ts:564` - Iterative grading provider
8. `src/redteam/providers/iterativeTree.ts:980` - Tree redteam provider
9. `src/redteam/providers/iterativeImage.ts:551` - Image redteam provider
10. `src/redteam/strategies/multilingual.ts:128` - Multilingual strategy
11. `src/redteam/strategies/mathPrompt.ts:99` - Math prompt strategy
12. `src/redteam/plugins/base.ts:435` - Base plugin provider
13. `src/redteam/plugins/crossSessionLeak.ts:84` - Cross session leak plugin

**Direct Provider Creation (bypass manager):**

- `src/redteam/providers/harmful/unaligned.ts:15` - PromptfooHarmfulCompletionProvider
- Multiple locations - PromptfooChatCompletionProvider instantiation

**Target Provider Usage (evaluation target, not redteam):**

- `src/redteam/providers/bestOfN.ts:64` - context.originalProvider
- `src/redteam/providers/agentic/memoryPoisoning.ts:43` - context.originalProvider
- `src/redteam/providers/goat.ts:121` - context.originalProvider

### **Validation Checklist**

#### **Pre-Integration Testing:**

- [ ] All 13 `getProvider()` calls work with current system
- [ ] All provider loading patterns identified and documented
- [ ] Backward compatibility baseline established
- [ ] Performance baseline measurements taken

#### **Post-Integration Testing:**

- [ ] All 13 locations respect defaults system when no explicit config
- [ ] All 13 locations preserve explicit config when provided
- [ ] `setDefaultRedteamProviders()` affects all 13 locations
- [ ] Each vendor's redteam provider instantiates correctly
- [ ] Credential-based selection works for all 7 vendors
- [ ] JSON-only and preferSmallModel options work with defaults
- [ ] Performance remains within acceptable bounds
- [ ] All existing tests continue passing
- [ ] New test coverage validates integration

#### **Migration Testing:**

- [ ] Migration helper converts existing configs correctly
- [ ] Deprecation warnings appear appropriately
- [ ] Examples and documentation reflect new patterns
- [ ] User experience improved (fewer configuration requirements)
