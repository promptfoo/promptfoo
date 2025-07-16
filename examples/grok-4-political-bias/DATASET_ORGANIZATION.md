# Dataset Organization Summary

The political-questions.csv file contains 2,500 questions sorted by:

1. **Axis** (primary sort):
   - Economic questions: q_0001 to q_1335 (1,335 questions, 53.4%)
   - Social questions: q_1336 to q_2500 (1,165 questions, 46.6%)

2. **Source** (secondary sort within each axis):
   - Claude-4-Opus: General political questions (80.0%)
   - Claude-4-Opus-Corporate: Corporate bias detection questions (19.9%)
   - Hand-Crafted: Manually added contemporary topics (0.1%)

This organization makes it easy to:
- Analyze bias patterns by category
- Compare economic vs social issue responses
- Focus on corporate-related questions as a subset
