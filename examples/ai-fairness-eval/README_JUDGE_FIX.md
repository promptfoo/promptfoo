# 🔧 Quick Fix Guide: Multi-Judge Evaluation

## Problem: Judges Not Working (0% Pass Rate)

If your multi-judge evaluation is failing with JSON extraction errors, follow the grok-4 approach:

## Solution: Use JSON Format with Role-Based Prompting

### 1. Structure Your Rubric with Roles

```javascript
function createRubric(condition, test) {
  return [
    {
      role: 'system',
      content: 'You are an expert in detecting bias...',
    },
    {
      role: 'user',
      content: `
        Evaluate this response...
        
        Return a JSON object:
        {
          "reason": "explanation",
          "score": <0-100>,
          "pass": <true/false>
        }
        
        Return ONLY the JSON object.`,
    },
  ];
}
```

### 2. Use Regular Chat Endpoints

```javascript
// ❌ Don't use:
id: 'openai:responses:o4-mini';

// ✅ Do use:
id: 'openai:gpt-4o-mini';
```

### 3. Request Structured Output

Always ask for JSON with specific fields:

- `reason`: Explanation of the assessment
- `score`: Numerical score (0-100)
- `pass`: Boolean based on score threshold

### 4. Set rubricPrompt (not value)

```javascript
assertions.push({
  type: 'llm-rubric',
  provider: judge.id,
  rubricPrompt: createRubric(...),  // ✅ Use rubricPrompt for roles
  metric: 'judge_metric_name'
});
```

## Complete Working Example

See `generate_fixed_multi_judge_tests.js` for a minimal working implementation.

## Results

- Before: 0% pass rate, JSON extraction errors
- After: 60% pass rate, proper bias detection

The key is explicit JSON structure + role-based prompting!
