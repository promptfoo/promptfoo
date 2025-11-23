# OpenAI Codex SDK Provider - End-to-End Test Plan

## Test Scenarios

### 1. Basic Code Generation
- **Goal**: Verify simple code generation works
- **Test**: Generate a Python factorial function
- **Expected**: Working Python code with proper function definition

### 2. Thread Persistence
- **Goal**: Verify thread reuse with persist_threads
- **Test**: Run multiple prompts with same cache key
- **Expected**: Same thread ID reused across calls

### 3. Thread Resumption
- **Goal**: Verify thread_id resumption works
- **Test**: Create thread, get ID, resume in second call
- **Expected**: Conversation context maintained

### 4. Structured Output
- **Goal**: Verify JSON schema output works
- **Test**: Request structured JSON with Zod-like schema
- **Expected**: Valid JSON matching schema

### 5. Git Repository Check
- **Goal**: Verify Git validation works
- **Test**: Try to run in non-Git directory
- **Expected**: Error unless skip_git_repo_check is true

### 6. Working Directory
- **Goal**: Verify custom working_dir works
- **Test**: Set working_dir to examples/
- **Expected**: Codex operates in that directory

### 7. Model Selection
- **Goal**: Verify model configuration
- **Test**: Use different models (gpt-4o, o3-mini)
- **Expected**: Model parameter passed correctly

### 8. Error Handling
- **Goal**: Verify graceful error handling
- **Test**: Invalid API key, timeout, abort signal
- **Expected**: Proper error messages, no crashes

## Implementation

Tests will be run using:
1. Direct provider instantiation with real SDK
2. Via promptfoo config (npm run local -- eval)
3. Verification of response format, token usage, costs
