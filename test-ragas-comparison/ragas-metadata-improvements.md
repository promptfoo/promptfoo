# RAGAS Metrics Metadata Improvements

## Summary

Enhanced existing RAGAS-ported metrics in promptfoo to provide detailed metadata for better transparency and debugging.

## Changes Made

### 1. Answer-Relevance Metadata
- **File**: `src/matchers.ts` - `matchesAnswerRelevance` function
- **Enhancement**: Added metadata showing:
  - All 3 generated questions
  - Individual similarity scores for each question
  - Average similarity score
  - Threshold value

Example output:
```json
{
  "generatedQuestions": [
    {
      "question": "What is the capital of France?",
      "similarity": 0.9999999999999999
    },
    // ... 2 more questions
  ],
  "averageSimilarity": 0.9999999999999999,
  "threshold": 0.7
}
```

### 2. Context-Recall Metadata
- **Files**: 
  - `src/matchers.ts` - `matchesContextRecall` function
  - `src/assertions/contextRecall.ts` - Handler to preserve metadata
- **Enhancement**: Added metadata showing:
  - Sentence-by-sentence attribution analysis
  - Total sentences analyzed
  - Number of attributed sentences
  - Overall score

Example output:
```json
{
  "sentenceAttributions": [
    {
      "sentence": "Paris is the capital of France",
      "attributed": true
    },
    // ... more sentences
  ],
  "totalSentences": 10,
  "attributedSentences": 1,
  "score": 0.1
}
```

### 3. Context-Relevance Metadata
- **Files**: 
  - `src/matchers.ts` - `matchesContextRelevance` function
  - `src/assertions/contextRelevance.ts` - Handler to preserve metadata
- **Enhancement**: Added metadata showing:
  - Extracted relevant sentences
  - Total sentences analyzed
  - Number of relevant sentences
  - Whether "Insufficient Information" was returned
  - Overall score

Example output:
```json
{
  "extractedSentences": [
    "Paris is the capital and largest city of France..."
  ],
  "totalSentences": 1,
  "relevantSentences": 1,
  "insufficientInformation": false,
  "score": 1
}
```

## Benefits

1. **Better Debugging**: Users can now see exactly why a metric passed or failed
2. **Transparency**: Shows the intermediate steps in RAGAS calculations
3. **Consistency**: All RAGAS metrics now provide detailed metadata
4. **Backward Compatible**: Changes don't break existing functionality

## Testing

Test configuration (`test-ragas-metadata.yaml`) demonstrates all metadata features:
```yaml
tests:
  - vars:
      query: "What is the capital of France?"
      context: "France is a country in Western Europe..."
    assert:
      - type: answer-relevance
        threshold: 0.7
      - type: context-recall
        value: "Paris is the capital of France"
        threshold: 0.8
      - type: context-relevance
        threshold: 0.8
```

Run with: `npm run local -- eval -c test-ragas-metadata.yaml`

## Documentation Updates

- Updated `CLAUDE.md` to include local testing instructions
- Context faithfulness already has claim-level metadata from previous work