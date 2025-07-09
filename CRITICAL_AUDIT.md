# Critical Audit: Prompty Support Implementation

## Summary

After reviewing the Microsoft Prompty specification and our implementation, here's a critical assessment of what we should keep, improve, or remove if we were to PR this right now.

## Key Findings

### 1. **Template Engine Mismatch**

**Issue**: Microsoft Prompty uses **Jinja2** as its template engine, NOT Handlebars. Our implementation adds Handlebars support which deviates from the specification.

**Evidence**: 
- Microsoft documentation clearly states: "After this front matter is the prompt template, articulated in the **Jinja** format."
- The official prompty repository and all examples use Jinja2 syntax

**Recommendation**: **REMOVE** Handlebars support entirely. It adds unnecessary complexity and confusion.

### 2. **Nunjucks vs Jinja2**

**Current**: We use Nunjucks as our "Jinja2-compatible" engine.

**Analysis**: While Nunjucks is largely compatible with Jinja2, there are subtle differences that could cause issues:
- Jinja2 uses `{% set var = value %}` while Nunjucks uses `{% set var = value %}` (same) but handles scoping differently
- Some filters and functions differ between the two

**Recommendation**: **KEEP** Nunjucks but document the differences clearly. Most basic templates will work fine.

### 3. **Feature Completeness**

**What We Support Well**:
- ✅ YAML frontmatter parsing
- ✅ Chat/Completion API types
- ✅ Variable substitution
- ✅ Sample data merging
- ✅ Azure OpenAI configuration
- ✅ Multi-turn conversations
- ✅ Image support

**What We're Missing**:
- ❌ Embedding API type
- ❌ Image generation API type
- ❌ `inputs` field with type definitions and JSON schema
- ❌ `outputs` field specification
- ❌ `response` mode (first/all)
- ❌ Environment variable substitution (`${env:VAR_NAME}`)
- ❌ Connection references
- ❌ Base/inheritance functionality

**Recommendation**: **IMPROVE** by adding at least environment variable support and input/output specifications.

### 4. **Configuration Mapping**

**Current**: We map `azure_openai` to promptfoo's Azure configuration format.

**Issue**: The mapping might not be complete. Microsoft's format includes:
- `connection` field for referencing named connections
- `${env:VAR}` syntax for environment variables
- Different parameter names

**Recommendation**: **IMPROVE** the configuration mapping to handle all cases.

### 5. **Examples Quality**

**Issues**:
- Our examples use incorrect Handlebars syntax
- The advanced examples are overly complex for demonstration
- Missing examples of core features like environment variables

**Recommendation**: **IMPROVE** examples to match the specification exactly.

## Proposed Changes

### 1. Remove Handlebars Support

```typescript
// Remove Handlebars import
// Remove the renderTemplate function
// Simplify to only use Nunjucks/Jinja2
```

### 2. Add Environment Variable Support

```typescript
function resolveEnvVariables(value: any): any {
  if (typeof value === 'string') {
    return value.replace(/\${env:(\w+)}/g, (_, envVar) => process.env[envVar] || '');
  }
  if (typeof value === 'object') {
    // Recursively resolve in objects
  }
  return value;
}
```

### 3. Add Input/Output Specifications

```typescript
interface PromptyFrontmatter {
  // ... existing fields ...
  inputs?: {
    [key: string]: {
      type: string;
      description?: string;
      default?: any;
      is_required?: boolean;
      json_schema?: any;
    };
  };
  outputs?: {
    [key: string]: {
      type: string;
      description?: string;
      json_schema?: any;
    };
  };
}
```

### 4. Simplify Examples

- Remove the Handlebars example
- Create a simple environment variable example
- Add an example showing input specifications

### 5. Update Documentation

- Remove all mentions of Handlebars
- Clarify that we use Nunjucks which is "Jinja2-compatible"
- Add notes about any incompatibilities
- Document environment variable support

## Final Recommendation

**If we were to PR this right now**, I would:

1. **REMOVE** all Handlebars-related code and examples
2. **KEEP** the core prompty file processing with Nunjucks
3. **ADD** environment variable support (critical feature)
4. **ADD** basic input/output field support
5. **IMPROVE** examples to be simpler and spec-compliant
6. **UPDATE** documentation to be accurate about what we support

The Handlebars addition was well-intentioned but ultimately creates confusion and maintenance burden. The Microsoft Prompty specification is clear about using Jinja2, and we should stick to that standard. Our Nunjucks implementation is close enough for most use cases, and we should focus on supporting the core features that users actually need.

## Why Handlebars Doesn't Matter

1. **No demand**: There's no evidence of users asking for Handlebars in prompty files
2. **Specification violation**: It goes against the official format
3. **Confusion**: Users familiar with Prompty expect Jinja2 syntax
4. **Maintenance burden**: Supporting multiple template engines increases complexity
5. **Compatibility**: Tools that consume prompty files expect Jinja2

The effort would be better spent on implementing missing core features like environment variables and proper input/output specifications. 