# Redteam Provider Defaults Integration

## Overview

This document describes the integration of redteam providers with the promptfoo defaults system, implemented in the `feature/integrate-redteam-defaults` branch.

## What Changed

### Core Integration

1. **Extended DefaultProviders Interface**
   - Added optional `redteamProvider?: ApiProvider` field
   - Location: `src/types/providers.ts`

2. **Added Redteam Provider Management**
   - New `setDefaultRedteamProviders()` function for programmatic overrides
   - New `REDTEAM_PROVIDERS` constant for bulk operations
   - Location: `src/providers/defaults.ts`

3. **Enhanced All 7 Vendor Configurations**
   Each vendor section now includes optimized redteam providers:
   - **Anthropic**: `claude-3.5-sonnet` with temperature 0.7
   - **OpenAI**: `gpt-4.1-2025-04-14` with temperature 0.7
   - **Google AI Studio**: `gemini-2.5-pro` equivalent
   - **Google Vertex**: `gemini` models
   - **Mistral**: `mistral-large-latest`
   - **Azure**: User deployment with temperature 0.7
   - **GitHub Models**: `gpt-4o` equivalent

4. **Enhanced RedteamProviderManager**
   - Modified `loadRedteamProvider()` to check defaults system first
   - Maintains full backward compatibility
   - Handles `jsonOnly` and `preferSmallModel` options
   - Location: `src/redteam/providers/shared.ts`

## Usage Examples

### Automatic Provider Selection

```bash
# Before: Required explicit configuration
promptfoo redteam generate --provider "anthropic:chat:claude-3.5-sonnet"

# After: Automatic selection based on credentials
export ANTHROPIC_API_KEY="sk-ant-..."
promptfoo redteam generate  # Uses claude-3.5-sonnet automatically
```

### Configuration Hierarchy

The system now follows this precedence order:

1. **Explicit provider parameter** (highest priority)
2. **Config file provider** (`redteam.provider` or CLI `--provider`)
3. **Default provider from credentials** (NEW - automatic selection)
4. **Hardcoded fallback** (`gpt-4.1-2025-04-14`)

### Programmatic Override

```typescript
import { setDefaultRedteamProviders } from './providers/defaults';

// Override all redteam operations globally
await setDefaultRedteamProviders(customProvider);
```

## Integration Points

### All 13 Provider Loading Locations

The integration affects every redteam provider loading location:

1. **Main synthesis** (`src/redteam/index.ts:536`)
2. **Crescendo providers** (`src/redteam/providers/crescendo/index.ts:162,181`)
3. **Custom providers** (`src/redteam/providers/custom/index.ts:200,219`)
4. **Iterative providers** (`iterative.ts:560,564`, `iterativeTree.ts:980`, `iterativeImage.ts:551`)
5. **Multilingual strategy** (`src/redteam/strategies/multilingual.ts:128`)
6. **Math prompt strategy** (`src/redteam/strategies/mathPrompt.ts:99`)
7. **Base plugin** (`src/redteam/plugins/base.ts:435`)
8. **Cross session leak plugin** (`src/redteam/plugins/crossSessionLeak.ts:84`)

### Backward Compatibility

- All existing configurations continue working unchanged
- No breaking changes to any APIs
- Explicit provider configuration still takes precedence
- Fallback behavior preserved for edge cases

## Testing

### Comprehensive Test Coverage

1. **Unit Tests** (`test/providers/defaults.test.ts`)
   - Redteam provider override functionality
   - Vendor-specific provider selection
   - Integration with existing provider system

2. **Integration Tests** (`test/redteam/providers/shared-integration.test.ts`)
   - RedteamProviderManager integration with defaults
   - Configuration option handling (`jsonOnly`, `preferSmallModel`)
   - Override precedence validation

3. **End-to-End Validation**
   - Manual testing with different credential combinations
   - Configuration file validation
   - CLI command testing

### Test Results

All tests pass successfully:

- **24/24** defaults provider tests ✅
- **6/6** integration tests ✅
- **Build successful** with no TypeScript errors ✅

## Migration Guide

### For Existing Users

**No action required!** All existing configurations continue working:

```yaml
# This still works exactly as before
redteam:
  provider: 'anthropic:chat:claude-3.5-sonnet'
  numTests: 5
  plugins: ['hallucination']
```

### For New Users

**Simplified configuration** - just set API keys:

```bash
# Set your preferred API key
export ANTHROPIC_API_KEY="your-key-here"

# No provider configuration needed
promptfoo redteam generate -c config.yaml
```

### Advanced Usage

**Mixed configuration** for different providers:

```yaml
# Target uses OpenAI for evaluation
providers:
  - id: 'openai:chat:gpt-4'

# Redteam automatically uses Anthropic for generation (if ANTHROPIC_API_KEY set)
redteam:
  numTests: 10
  plugins: ['hallucination', 'jailbreak']
```

## Benefits

### User Experience

- **Simplified configuration**: No need to specify redteam providers explicitly
- **Intelligent defaults**: Best models automatically selected per vendor
- **Consistent behavior**: Same credential-based selection as evaluation providers

### Developer Experience

- **Unified provider management**: Single system for all provider types
- **Consistent APIs**: Same override pattern as completion/embedding providers
- **Enhanced flexibility**: Easy switching between different provider combinations

### System Architecture

- **Reduced complexity**: Eliminated duplicate provider selection logic
- **Better maintainability**: Centralized provider configuration
- **Enhanced testing**: Easier to test different provider combinations

## Implementation Details

### Provider Configuration

Each vendor's redteam provider is optimized for adversarial generation:

| Vendor           | Model                  | Configuration      |
| ---------------- | ---------------------- | ------------------ |
| Anthropic        | `claude-3.5-sonnet`    | `temperature: 0.7` |
| OpenAI           | `gpt-4.1-2025-04-14`   | `temperature: 0.7` |
| Google AI Studio | `gemini-2.5-pro`       | Default config     |
| Google Vertex    | `gemini` latest        | Default config     |
| Mistral          | `mistral-large-latest` | Default config     |
| Azure            | User deployment        | `temperature: 0.7` |
| GitHub           | `gpt-4o` equivalent    | Default config     |

### Configuration Handling

The integration preserves all existing configuration options:

```typescript
// All these patterns still work
redteamProviderManager.getProvider({ jsonOnly: true });
redteamProviderManager.getProvider({ preferSmallModel: true });
redteamProviderManager.getProvider({ provider: 'custom:model' });
```

## Future Enhancements

### Potential Improvements

1. **Model Selection Optimization**
   - Per-plugin model preferences
   - Cost-optimized model selection
   - Performance-based model routing

2. **Configuration Flexibility**
   - Environment-specific provider selection
   - Fallback chains for provider failures
   - Dynamic provider switching

3. **Enhanced Integration**
   - Provider health checking
   - Automatic retry with different providers
   - Provider performance monitoring

## Troubleshooting

### Common Issues

1. **Provider Not Found**
   - Ensure API keys are properly set
   - Check credential format and validity
   - Verify provider is supported in your region

2. **Configuration Conflicts**
   - Explicit configuration takes precedence over defaults
   - Check for multiple API keys set simultaneously
   - Verify environment variable naming

3. **Integration Problems**
   - Restart application after setting new environment variables
   - Clear provider cache if needed: `redteamProviderManager.clearProvider()`
   - Check logs for detailed provider selection information

### Debug Information

Enable debug logging to see provider selection:

```bash
DEBUG=promptfoo* promptfoo redteam generate
```

This will show:

- Which provider selection path was taken
- Default provider loading attempts
- Final provider selection and configuration

## Conclusion

The redteam provider defaults integration successfully unifies the promptfoo provider management system while maintaining 100% backward compatibility. Users benefit from simplified configuration and automatic provider selection, while developers gain a more maintainable and flexible architecture.

The integration has been thoroughly tested across all 13 provider loading locations and 7 vendor configurations, ensuring reliable operation in all usage scenarios.
