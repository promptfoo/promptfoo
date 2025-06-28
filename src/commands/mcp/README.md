# MCP (Model Context Protocol) Server

A well-structured MCP server implementation for Promptfoo that provides external tools for AI systems to interact with Promptfoo's evaluation and testing capabilities.

## 🏗️ Architecture

The MCP server is organized using a domain-driven design approach with clear separation of concerns:

```
src/commands/mcp/
├── README.md                 # This documentation
├── index.ts                  # Main entry point
├── server.ts                 # Legacy server (for backward compatibility)
├── server-new.ts            # Improved server with new architecture
├── lib/                     # Core library and utilities
│   ├── index.ts            # Barrel exports
│   ├── types.ts            # Type definitions and interfaces
│   ├── errors.ts           # Custom error classes
│   ├── base-tool.ts        # Abstract base class for tools
│   └── utils.ts            # Utility functions
├── tools/                  # Domain-organized tools
│   ├── system/            # System-level tools
│   │   ├── index.ts       # System tools exports
│   │   └── health-check.ts # Server health verification
│   ├── evaluation/        # Evaluation-related tools
│   │   ├── index.ts       # Evaluation tools exports
│   │   └── list-evaluations.ts # Browse evaluation runs
│   ├── configuration/     # Configuration tools
│   │   ├── index.ts       # Config tools exports
│   │   └── validate-config.ts # Configuration validation
│   ├── provider/          # Provider-related tools
│   │   └── index.ts       # Provider tools exports (placeholder)
│   ├── testing/           # Testing-related tools
│   │   └── index.ts       # Testing tools exports (placeholder)
│   └── [legacy tools]     # Existing function-based tools
└── resources/             # MCP resources
    └── index.ts           # Resource handlers
```

## 🔧 Core Components

### Base Tool Architecture

All new tools extend the `AbstractTool` class which provides:

- **Automatic error handling** with custom error types
- **Input validation** using Zod schemas
- **Consistent response formatting**
- **Built-in timeout handling**
- **Type safety** throughout

```typescript
export class MyTool extends AbstractTool {
  readonly name = 'my_tool';
  readonly description = 'Description of what this tool does';

  protected readonly schema = z.object({
    param: z.string().describe('Parameter description'),
  });

  protected async execute(args: { param: string }): Promise<ToolResult<MyData>> {
    // Tool implementation
    return this.success(data);
  }
}
```

### Error Handling

The new architecture includes comprehensive error handling with specific error types:

- `ValidationError` - Invalid input arguments
- `NotFoundError` - Requested resource not found
- `ConfigurationError` - Configuration issues
- `ProviderError` - Provider-related failures
- `TimeoutError` - Operation timeouts
- `ServiceUnavailableError` - External service issues
- `AuthenticationError` - Auth/auth failures
- `SharingError` - Sharing functionality issues

### Type Safety

The refactored code eliminates `any` types in favor of:

- **Generic type parameters** for tool responses
- **Specific interfaces** for different data types
- **Union types** for constrained values
- **Type guards** for runtime type checking

## 🛠️ Available Tools

### System Tools

- **`promptfoo_health_check`** - Verify server connectivity and system status

### Evaluation Tools

- **`list_evaluations`** - List and browse evaluation runs with optional filtering
- **`get_evaluation_details`** _(legacy)_ - Get detailed evaluation results
- **`analyze_evaluation_metrics`** _(legacy)_ - Calculate evaluation statistics
- **`run_evaluation`** _(legacy)_ - Execute targeted evaluations
- **`share_evaluation`** _(legacy)_ - Share evaluations via public URLs

### Configuration Tools

- **`validate_promptfoo_config`** - Validate configuration files

### Provider Tools

- **`test_ai_provider`** _(legacy)_ - Test provider connectivity

### Testing Tools

- **`run_assertion`** _(legacy)_ - Test assertion logic
- **`get_test_prompts`** _(legacy)_ - Retrieve test case prompts
- **`list_test_datasets`** _(legacy)_ - Browse available test datasets

## 🚀 Usage

### Starting the Server

```bash
# HTTP transport (default)
promptfoo mcp --transport http --port 3100

# STDIO transport (for MCP clients)
promptfoo mcp --transport stdio
```

### Using the New Architecture

To create a new tool:

1. **Create the tool class** extending `AbstractTool`
2. **Define the schema** for input validation
3. **Implement the `execute` method**
4. **Add to appropriate domain directory**
5. **Export from domain index file**
6. **Register in server**

```typescript
// tools/my-domain/my-tool.ts
import { z } from 'zod';
import { AbstractTool } from '../../lib';

export class MyTool extends AbstractTool {
  readonly name = 'my_tool';
  readonly description = 'My tool description';

  protected readonly schema = z.object({
    input: z.string(),
  });

  protected async execute(args: { input: string }) {
    // Implementation
    return this.success({ result: 'processed' });
  }
}
```

### Migration from Legacy Tools

Legacy function-based tools can be gradually migrated to the new class-based architecture:

1. **Convert function to class** extending `AbstractTool`
2. **Move schema definition** to class property
3. **Refactor error handling** to use custom error types
4. **Update imports** in server file
5. **Test thoroughly**

## 🔍 Best Practices

### Error Handling

```typescript
// ❌ Old way
catch (error: unknown) {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  return createToolResponse('tool', false, undefined, errorMessage);
}

// ✅ New way
catch (error) {
  if (error instanceof ConfigurationError) {
    throw error; // Re-throw specific errors
  }
  throw new ValidationError(`Failed to process: ${error.message}`);
}
```

### Type Safety

```typescript
// ❌ Old way
function processData(data: any): any {
  return data.someProperty;
}

// ✅ New way
function processData<T extends { someProperty: string }>(data: T): string {
  return data.someProperty;
}
```

### Input Validation

```typescript
// ❌ Old way
if (!args.id) {
  return error('Missing ID');
}

// ✅ New way
protected readonly schema = z.object({
  id: z.string().min(1, 'ID cannot be empty'),
});
```

## 🧪 Testing

The new architecture makes testing easier with:

- **Isolated tool classes** that can be unit tested
- **Mocked dependencies** through dependency injection
- **Predictable error types** for error scenario testing
- **Type-safe test data** with TypeScript

```typescript
describe('MyTool', () => {
  let tool: MyTool;

  beforeEach(() => {
    tool = new MyTool();
  });

  it('should process valid input', async () => {
    const result = await tool.execute({ input: 'test' });
    expect(result.isError).toBe(false);
  });
});
```

## 🔄 Migration Status

- ✅ **Core infrastructure** - Types, errors, base classes
- ✅ **System tools** - Health check
- ✅ **Evaluation tools** - List evaluations
- ✅ **Configuration tools** - Config validation
- 🚧 **Provider tools** - In progress
- 🚧 **Testing tools** - In progress
- 📋 **Legacy tools** - Maintained for backward compatibility

## 🤝 Contributing

When adding new tools:

1. **Follow the domain organization** - Place tools in appropriate directories
2. **Use the AbstractTool base class** - Ensures consistency
3. **Include comprehensive JSDoc** - Document purpose and usage
4. **Add proper error handling** - Use custom error types
5. **Write tests** - Cover happy path and error scenarios
6. **Update documentation** - Keep this README current

## 📚 References

- [Model Context Protocol Specification](https://spec.modelcontextprotocol.io/)
- [Promptfoo Documentation](https://promptfoo.dev/docs/)
- [TypeScript Best Practices](https://typescript-eslint.io/)
