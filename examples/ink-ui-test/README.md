# ink-ui-test (Ink UI Comprehensive Test)

A test configuration designed to exercise the Ink CLI UI with various scenarios:

- **Passing tests**: Simple assertions that should succeed
- **Failing tests**: Assertions designed to fail (for UI testing)
- **Error provider**: A non-existent model that will throw API errors
- **LLM-as-a-judge**: Uses `llm-rubric` and `factuality` assertions

## Usage

```bash
# With Ink UI enabled
PROMPTFOO_INTERACTIVE_UI=true npx promptfoo@latest eval

# Or initialize the example
npx promptfoo@latest init --example ink-ui-test
```

## What to expect

- **gpt-4o-mini**: Should complete all tests (some pass, some fail)
- **gpt-3.5-turbo**: Should complete all tests (some pass, some fail)
- **error-provider**: Should show errors for all tests (invalid model)

## Test scenarios

| Test | Expected Result |
|------|-----------------|
| Capital of France | Pass |
| Math (2+2) | Pass |
| Sky color | Fail (impossible assertion) |
| Photosynthesis | Pass (LLM graded) |
| Water wet | Fail (contradictory rubric) |
| Hello greeting | Pass |
| Romeo and Juliet | Pass (factuality) |
| Prime numbers | Partial fail |
