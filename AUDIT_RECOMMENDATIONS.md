# Provider Config Dialog - Audit Recommendations

## Current Issues
1. Over-engineered with dual Form/YAML modes
2. Dangerous auto-save behavior  
3. Complex state synchronization
4. Hardcoded field definitions
5. Poor type safety

## Recommended Refactor

### Option 1: Simple JSON Editor (Recommended)
```tsx
// Just use a JSON editor with syntax highlighting
<JsonTextField
  label="Provider Configuration"
  value={JSON.stringify(config, null, 2)}
  onChange={onConfigChange}
  error={validationError}
  helperText="Enter provider configuration as JSON"
/>
```

### Option 2: Dynamic Form from Schema
```tsx
// Generate form fields from provider schema
const providerSchema = getProviderSchema(providerId);
return providerSchema.fields.map(field => 
  <DynamicField key={field.name} field={field} />
);
```

### Remove These Features
- ❌ Auto-save (let users explicitly save)
- ❌ Dual editing modes
- ❌ Silent error handling
- ❌ Provider-specific logic in generic component

### Add These Instead
- ✅ Schema-based validation
- ✅ Proper TypeScript types per provider
- ✅ Clear save/cancel actions
- ✅ Validation before save