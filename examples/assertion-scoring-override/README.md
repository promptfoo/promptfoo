# Assertion Scoring Function Override Example

This example demonstrates how to use and override scoring functions in promptfoo. It shows three different approaches to scoring test results:

1. Default JavaScript scoring function (balanced with emphasis on accuracy)
2. Python scoring function override (focuses only on accuracy)
3. JavaScript scoring function override (emphasizes style and fluency)

## Files

- `promptfooconfig.yaml` - Main configuration file
- `default_scoring.js` - Default scoring function that weights accuracy more heavily
- `override_scoring.py` - Python override that focuses only on accuracy
- `override_scoring.js` - JavaScript override that prioritizes style metrics

## How it Works

The example evaluates translations with three different scoring approaches:

1. **Default Scoring (JavaScript)**

   - Weights accuracy 1.5x more than other metrics
   - Considers fluency and grammar equally
   - Applied to Spanish translation test

2. **Accuracy Focus (Python)**

   - Only considers accuracy (2x weight)
   - Ignores style metrics completely
   - Applied to French translation test

3. **Style Focus (JavaScript)**
   - Weights fluency and grammar 1.5x more than accuracy
   - Prioritizes style over accuracy
   - Applied to German translation test

Each scoring function:

- Takes `namedScores` and `context` parameters
- Returns a `GradingResult` object with `pass`, `score`, and `reason`
- Uses different weighting strategies for the metrics

## Running the Example

```bash
promptfoo eval
```

The output will show how each scoring function evaluates the same metrics differently based on their priorities.
