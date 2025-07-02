# Add comprehensive provider configuration support in Web UI

## Summary

This PR implements full provider configuration support in the promptfoo web UI, addressing issue #4536. Users can now configure all provider parameters (apiKey, apiBaseUrl, headers, etc.) directly from the web interface, matching the capabilities available in YAML configuration files.

## Changes

### Provider Configuration Dialog Enhancement

- **Form Editor Tab**:
  - Always displays common provider fields (apiKey, apiBaseUrl, apiHost, temperature, max_tokens, timeout, headers)
  - Supports dynamic addition of custom configuration fields
  - Provides field-specific input types (text, number, boolean, JSON)
  - Includes helpful descriptions for common fields
- **YAML Editor Tab**:
  - Full YAML editing with syntax highlighting
  - Dark mode support
  - Validation and error handling
  - Easy copy/paste from existing YAML configurations

### Red Team Setup Integration

- Updated CustomTargetConfiguration to use the same ProviderConfigDialog
- Added "Configure Provider Settings" button for comprehensive configuration
- Displays current configuration in a readable format

### Documentation

- Added comprehensive guide at `site/docs/guides/configure-providers-web-ui.md`
- Includes examples for OpenAI, Azure, and local AI configurations
- Migration guide for users moving from CLI to web UI

### Testing

- Added tests for ProviderConfigDialog component
- Added tests for CustomTargetConfiguration component
- All tests use Vitest with proper mocking

## Screenshots

### Form Editor

![Form Editor - showing common fields and custom field addition]

### YAML Editor

![YAML Editor - with syntax highlighting and dark mode support]

### Red Team Configuration

![Red Team - Configure Provider Settings button and current config display]

## Benefits

1. **Feature Parity**: Web UI now supports all configuration options available in YAML files
2. **User-Friendly**: Form editor provides guided configuration with helpful descriptions
3. **Flexibility**: YAML editor allows power users to paste complex configurations
4. **Consistency**: Same configuration experience across eval creator and red team setup
5. **No Breaking Changes**: Existing configurations continue to work as before

## Testing

1. Create a new evaluation in the web UI
2. Select any provider and click to configure it
3. Verify all common fields are visible even if not in the default config
4. Add custom fields using the "Add Field" button
5. Switch to YAML editor and verify configuration
6. Test in red team setup with custom targets

## Related Issues

Closes #4536
