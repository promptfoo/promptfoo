# Model and Repository Pattern Integration

This directory contains the domain models for the promptfoo application. We've implemented a hybrid approach combining Active Record and Repository patterns for database operations.

## Approach

### 1. Models with Active Record Capabilities

Our models include basic CRUD operations and domain-specific transformations:

- **Eval**: Core evaluation model with methods for finding, creating, and manipulating evaluations
- **EvalResult**: Individual evaluation results with their metrics and metadata
- **Prompt**: Prompt models with methods for retrieval and transformation
- **Dataset**: Dataset models for test case management

### 2. Repository Pattern for Complex Operations

The Repository pattern is used for:
- Complex queries spanning multiple entities
- Batch operations requiring optimization
- Caching strategies
- Complex transformations

### 3. Hybrid Integration

The integration follows these principles:

1. **Simple CRUD Operations**: Implemented directly on models
2. **Complex Queries**: Handled by repositories but may delegate to model methods
3. **Batch Loading**: Implemented in both models and repositories depending on use case
4. **Facade Pattern**: `DatabaseRepository` provides a unified API hiding the implementation details

## Benefits

1. **Simpler API**: Models expose self-contained methods for common operations
2. **Code Organization**: Related functionality is grouped together
3. **Performance**: Batch loading patterns are consistently applied
4. **Maintainability**: Each component has a clear responsibility
5. **Flexibility**: Implementation details can change without affecting clients

## Usage Examples

### Using Models Directly

```typescript
// Find a specific evaluation
const eval = await Eval.findById('eval-123');

// Get prompts for a dataset
const prompts = await Prompt.getByDatasetId('dataset-123');

// Get all datasets
const datasets = await Dataset.getAll();
```

### Using Repository Facade

```typescript
// Get evaluation results
const result = await DatabaseRepository.readResult('eval-123');

// Get prompts with predicate filtering
const prompts = await DatabaseRepository.getPromptsWithPredicate(
  result => result.config.tests.length > 5,
  10
);
```

## Future Improvements

1. **Complete Active Record Implementation**: Expand models to include all necessary operations
2. **Stronger Typing**: Improve type safety across the integration
3. **Caching Strategies**: Add more sophisticated caching at the model level
4. **Testing**: Add unit tests for models and repositories 