# Repository Pattern Implementation

This directory contains the implementation of the Repository Pattern for database operations in promptfoo.

## Overview

The Repository Pattern provides a clean separation of concerns by isolating the database access logic from the business logic. It provides a simpler API for working with database entities and hides the complexity of the underlying database operations.

## Key Components

### BaseRepository

`BaseRepository` is an abstract base class that provides common functionality for all repositories:
- Error handling
- Database access
- Logging

### Specialized Repositories

1. **EvalRepository** - Handles operations related to evaluations
   - Writing results to the database
   - Reading and updating existing evaluations
   - Deleting evaluations

2. **PromptRepository** - Handles operations related to prompts
   - Retrieving prompts with various filtering options
   - Batch loading of related evaluations
   - Processing prompt metadata

3. **DatasetRepository** - Handles operations related to test case datasets
   - Retrieving datasets with optional filtering
   - Processing dataset metadata
   - Batch loading of related evaluations

### Facade Pattern

The `index.ts` file implements a Facade pattern by exposing a simplified API through the `DatabaseRepository` object. This object provides a unified interface to the underlying repositories while maintaining backward compatibility with the existing codebase.

## Benefits

1. **Improved Maintainability**: Related logic is grouped together, making the code easier to understand and maintain.

2. **Better Testability**: Repositories can be mocked for testing business logic in isolation.

3. **Cleaner Code**: The repository pattern encourages separation of concerns and reduces duplication.

4. **Optimized Database Access**: Common operations like batch loading are centralized in the repositories.

5. **Type Safety**: Repositories provide type-safe interfaces for database operations.

## Usage Example

```typescript
// Get all prompts with a limit
const prompts = await DatabaseRepository.getPrompts(10);

// Get a specific evaluation by ID
const eval = await DatabaseRepository.getEvalFromId('abc123');

// Delete an evaluation
const success = await DatabaseRepository.deleteEval('abc123');
```

## Functional Programming Improvements

The repositories also use functional programming techniques:

1. **Immutability**: Results are not modified in-place, but transformed through pure functions.

2. **Higher-Order Functions**: Map, filter, and reduce are used for data transformation.

3. **Function Composition**: Multiple pure functions are composed to achieve complex transformations.

4. **Avoiding Side Effects**: Side effects are minimized and isolated.

These techniques result in code that is easier to reason about, test, and maintain. 