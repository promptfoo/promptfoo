# Consolidated Provider Integration Plan

## Executive Summary

This document consolidates findings from task.md and task2.md into a comprehensive implementation plan for integrating redteam providers with the defaults system. The analysis identified **13 distinct provider loading locations** and **8 redteam provider classes** that must be handled during integration.

## Comparative Analysis: task.md vs task2.md

### **Areas of Agreement**
1. **Current Architecture**: Both confirm dual provider systems with no integration
2. **Central Manager**: Both identify `redteamProviderManager` as the single loading point
3. **Configuration Hierarchy**: Both document same provider selection order
4. **Integration Benefits**: Both advocate for unified system with credential-based selection
5. **Backward Compatibility**: Both emphasize preserving existing configurations

### **Enhanced Findings in task2.md**
- **Complete Instance Mapping**: Identified all 13 provider loading locations (task.md focused on conceptual flow)
- **Redteam Provider Classes**: Discovered 8 specialized redteam provider implementations
- **Advanced Attack Patterns**: Documented complex providers like Crescendo, GOAT, Iterative variants
- **Validation Framework**: Comprehensive test matrix and success criteria
- **3-Phase Implementation**: Detailed migration strategy with opt-in integration

### **Key Differences**
| Aspect | task.md | task2.md |
|--------|---------|----------|
| **Scope** | Conceptual analysis | Complete implementation plan |
| **Provider Instances** | General mentions | 13 specific locations documented |
| **Redteam Providers** | Basic understanding | 8 provider classes analyzed |
| **Testing Strategy** | E2E scenarios | Comprehensive validation matrix |
| **Implementation** | High-level plan | Detailed 3-phase approach |

## Consolidated Implementation Plan

### **Phase 1: Foundation (Weeks 1-2)**

#### **1.1 Core Infrastructure Changes**
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
  redteamProvider?: ApiProvider;  // NEW: Optional integration
}

// src/providers/defaults.ts
const REDTEAM_PROVIDERS: (keyof DefaultProviders)[] = ['redteamProvider'];
let defaultRedteamProvider: ApiProvider;

export async function setDefaultRedteamProviders(provider: ApiProvider) {
  defaultRedteamProvider = provider;
}
```

#### **1.2 Vendor-Specific Redteam Providers**
Each vendor section in `getDefaultProviders()` enhanced with optimal redteam models:

| Vendor | Current Evaluation Model | New Redteam Provider |
|--------|-------------------------|---------------------|
| **Azure** | User deployment | Same deployment (GPT-4 class) |
| **Anthropic** | Various Claude models | `claude-3.5-sonnet` |
| **Google AI Studio** | Gemini models | `gemini-1.5-pro` |
| **Google Vertex** | Gemini models | `gemini-1.5-pro` |
| **Mistral** | Various models | `mistral-large-latest` |
| **GitHub Models** | Various models | `gpt-4o` |
| **OpenAI** | GPT-4 variants | `gpt-4.1-2025-04-14` (current REDTEAM_MODEL) |

#### **1.3 Integration Point Preparation**
Create provider configuration adapter:
```typescript
// src/redteam/providers/shared.ts
async function configureProviderForRedteam(
  provider: ApiProvider, 
  options: { jsonOnly?: boolean; preferSmallModel?: boolean }
): Promise<ApiProvider> {
  // Handle JSON-only configuration
  // Handle small model preference  
  // Return configured provider
}
```

### **Phase 2: Integration (Weeks 3-4)**

#### **2.1 RedteamProviderManager Enhancement**
```typescript
// Enhanced loadRedteamProvider function
async function loadRedteamProvider({
  provider,
  jsonOnly = false,
  preferSmallModel = false,
} = {}) {
  // NEW: Check defaults system first if no explicit provider
  if (!provider && !cliState.config?.redteam?.provider) {
    try {
      const { getDefaultProviders } = await import('../../providers/defaults');
      const defaultProviders = await getDefaultProviders();
      if (defaultProviders.redteamProvider) {
        logger.debug(`Using default redteam provider: ${defaultProviders.redteamProvider.id()}`);
        return configureProviderForRedteam(defaultProviders.redteamProvider, { 
          jsonOnly, 
          preferSmallModel 
        });
      }
    } catch (error) {
      logger.debug('Failed to load default redteam provider, falling back to constants');
    }
  }
  
  // Existing logic preserved as fallback...
}
```

#### **2.2 All 13 Provider Loading Locations**
Integration must handle every identified location:

**Primary Locations (redteamProviderManager.getProvider calls):**
1. `src/redteam/index.ts:536` - Main synthesis function
2. `src/redteam/providers/crescendo/index.ts:162,181` - Crescendo providers
3. `src/redteam/providers/custom/index.ts:200,219` - Custom providers  
4. `src/redteam/providers/iterative.ts:560,564` - Iterative providers
5. `src/redteam/providers/iterativeTree.ts:980` - Tree provider
6. `src/redteam/providers/iterativeImage.ts:551` - Image provider
7. `src/redteam/strategies/multilingual.ts:128` - Multilingual strategy
8. `src/redteam/strategies/mathPrompt.ts:99` - Math prompt strategy
9. `src/redteam/plugins/base.ts:435` - Base plugin
10. `src/redteam/plugins/crossSessionLeak.ts:84` - Cross session leak

**Specialized Redteam Providers (8 classes identified):**
- `GoatProvider` - Advanced adversarial conversation
- `CrescendoProvider` - Escalating attack strategies  
- `CustomProvider` - User-defined attack patterns
- `MemoryPoisoningProvider` - Memory-based attacks
- `BestOfNProvider` - Multi-attempt optimization
- `RedteamIterativeProvider` (3 variants) - Iterative attack refinement
- `RedteamMischievousUserProvider` - User simulation attacks

#### **2.3 Configuration Options**
```typescript
// Environment variable to control integration
PROMPTFOO_REDTEAM_USE_DEFAULTS=true|false

// Config file option
redteam:
  useDefaults: true  # Enable integration with defaults system
  provider: ...      # Explicit override still takes precedence
```

### **Phase 3: Migration and Optimization (Weeks 5-6)**

#### **3.1 Migration Helper**
```typescript
// src/util/migration/redteamProviders.ts
export async function migrateRedteamConfig(config: UnifiedConfig): Promise<UnifiedConfig> {
  // Convert explicit provider configs to credential-based approach
  // Provide warnings for deprecated patterns
  // Return migrated config
}
```

#### **3.2 Enhanced User Experience**
```bash
# Current: Requires explicit configuration
promptfoo redteam generate --provider "anthropic:chat:claude-3.5-sonnet"

# New: Automatic based on credentials
export ANTHROPIC_API_KEY="sk-ant-..."
promptfoo redteam generate  # Uses claude-3.5-sonnet automatically
```

## Success Criteria (Consolidated)

### **Phase 1 Success Criteria**
1. ✅ **Interface Extension**: `DefaultProviders` includes `redteamProvider`
2. ✅ **Override Function**: `setDefaultRedteamProviders()` implemented
3. ✅ **Vendor Integration**: All 7 vendor sections include redteam providers
4. ✅ **Backward Compatibility**: Zero breaking changes to existing configs
5. ✅ **Test Coverage**: Comprehensive unit tests for new functionality

### **Phase 2 Success Criteria**  
6. ✅ **Manager Integration**: `loadRedteamProvider()` checks defaults first
7. ✅ **Complete Coverage**: All 13 provider loading locations work with defaults
8. ✅ **Override System**: `setDefaultRedteamProviders()` affects all locations
9. ✅ **Specialized Providers**: All 8 redteam provider classes integrate correctly
10. ✅ **Configuration Options**: Environment/config controls available
11. ✅ **Performance**: No degradation in provider loading speed

### **Phase 3 Success Criteria**
12. ✅ **Migration Tool**: Helper successfully converts existing configurations  
13. ✅ **User Experience**: Simplified configuration for common use cases
14. ✅ **Documentation**: Complete migration guides and examples
15. ✅ **Deprecation Path**: Clear timeline for old configuration patterns

## Validation Framework (Enhanced)

### **Test Matrix**
```bash
# Environment-based selection
export ANTHROPIC_API_KEY="test" && promptfoo redteam generate
# Expected: claude-3.5-sonnet from defaults

export OPENAI_API_KEY="test" && promptfoo redteam generate  
# Expected: gpt-4.1-2025-04-14 from defaults

# Explicit override preservation
promptfoo redteam generate --provider "custom:model"
# Expected: Uses custom:model, ignores defaults

# Programmatic override
await setDefaultRedteamProviders(customProvider);
# Expected: All 13 locations use customProvider
```

### **Integration Point Testing**
For each of the 13 provider loading locations:
- **Without config**: Uses defaults system automatically
- **With explicit config**: Preserves explicit configuration  
- **With override**: Uses programmatic override
- **With options**: Handles jsonOnly/preferSmallModel correctly

### **Specialized Provider Testing**  
For each of the 8 redteam provider classes:
- **Provider instantiation**: Creates correctly with defaults
- **Attack execution**: Performs attacks using default providers
- **Configuration handling**: Respects provider options
- **Fallback behavior**: Gracefully handles provider failures

## Risk Assessment and Mitigation

### **High-Priority Risks**
1. **Breaking Changes**: Existing configurations stop working
   - *Mitigation*: Comprehensive backward compatibility testing
2. **Performance Impact**: Provider loading becomes slower
   - *Mitigation*: Benchmark testing and optimization
3. **Configuration Conflicts**: Multiple provider sources create confusion
   - *Mitigation*: Clear precedence rules and documentation

### **Medium-Priority Risks**  
4. **Complex Migration**: Users struggle to adopt new patterns
   - *Mitigation*: Migration tools and clear documentation
5. **Vendor-Specific Issues**: Some providers don't integrate cleanly
   - *Mitigation*: Vendor-specific testing and fallback handling

## Timeline and Resource Requirements

### **Development Timeline (6 weeks)**
- **Weeks 1-2**: Phase 1 implementation and unit testing
- **Weeks 3-4**: Phase 2 integration and system testing  
- **Weeks 5-6**: Phase 3 migration tools and documentation

### **Resource Requirements**
- **1 Senior Developer**: Core implementation and architecture
- **1 QA Engineer**: Comprehensive testing across all integration points
- **1 Technical Writer**: Documentation and migration guides

### **Testing Effort**
- **13 integration points** × **5 test scenarios** = **65 integration tests**
- **8 redteam providers** × **4 test scenarios** = **32 provider tests**  
- **7 vendor configurations** × **3 test scenarios** = **21 vendor tests**
- **Total**: ~120 new test cases across unit, integration, and E2E levels

## Conclusion

This consolidated plan provides a comprehensive roadmap for integrating redteam providers with the defaults system. The 3-phase approach ensures minimal risk while delivering maximum value through improved user experience and simplified configuration. The detailed validation framework guarantees that all 13 provider loading locations and 8 specialized redteam providers work correctly with the new system.

The integration maintains 100% backward compatibility while providing a clear migration path toward unified provider management, making promptfoo's redteam functionality more accessible and easier to configure.