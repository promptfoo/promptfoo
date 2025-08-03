# Manual Comparison: RAGAS vs Promptfoo Noise Sensitivity

## Test Case 1: Capital of France

**Input:**
- Query: "What is the capital of France?"
- Output: "The capital of France is Paris. Berlin is the capital of Germany."
- Reference: "The capital of France is Paris."
- Context Chunks:
  - "Paris is the capital of France." (relevant: true)
  - "Berlin is the capital of Germany." (relevant: false)

**Expected Analysis:**

1. **Claims Extraction:**
   - Claim 1: "The capital of France is Paris."
   - Claim 2: "Berlin is the capital of Germany."

2. **Correctness Check (vs Reference):**
   - Claim 1: ✓ CORRECT (matches reference)
   - Claim 2: ✗ INCORRECT (not in reference)

3. **Source Attribution (for incorrect claims):**
   - Claim 2 comes from chunk 2 (irrelevant chunk)

4. **Expected Scores:**
   - **Relevant Mode**: 1 incorrect / 2 total = 0.5
   - **Irrelevant Mode**: 1 incorrect from irrelevant / 2 total = 0.5

## Test Case 2: Machine Learning Language

**Input:**
- Query: "What programming language is best for machine learning?"
- Output: "Python is widely used for machine learning. It has libraries like TensorFlow and PyTorch. JavaScript is used for web development."
- Reference: "Python is widely used for machine learning due to its extensive libraries like TensorFlow, PyTorch, and scikit-learn."
- Context Chunks:
  - "Python is the most popular language for machine learning with libraries like TensorFlow and PyTorch." (relevant: true)
  - "JavaScript is primarily used for web development and frontend programming." (relevant: false)
  - "Java is used for enterprise applications." (relevant: false)

**Expected Analysis:**

1. **Claims Extraction:**
   - Claim 1: "Python is widely used for machine learning."
   - Claim 2: "It has libraries like TensorFlow and PyTorch."
   - Claim 3: "JavaScript is used for web development."

2. **Correctness Check (vs Reference):**
   - Claim 1: ✓ CORRECT (matches reference)
   - Claim 2: ✓ CORRECT (partially matches - TensorFlow and PyTorch are in reference)
   - Claim 3: ✗ INCORRECT (not in reference)

3. **Source Attribution (for incorrect claims):**
   - Claim 3 comes from chunk 2 (irrelevant chunk)

4. **Expected Scores:**
   - **Relevant Mode**: 1 incorrect / 3 total = 0.33
   - **Irrelevant Mode**: 1 incorrect from irrelevant / 3 total = 0.33

## RAGAS Algorithm Summary

1. Extract all claims from the output
2. Check each claim against the reference (ground truth) for correctness
3. For incorrect claims, identify which context chunk they came from
4. Calculate score:
   - **Relevant mode**: All incorrect claims count
   - **Irrelevant mode**: Only incorrect claims from irrelevant chunks count

## Key Insights

- The score is always: incorrect claims (filtered by mode) / total claims
- Both modes use the same threshold comparison
- The difference is in which incorrect claims are counted
- Context chunks must be labeled as relevant/irrelevant for proper irrelevant mode operation