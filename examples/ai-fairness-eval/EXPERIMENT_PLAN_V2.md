# 🔬 AI Fairness Evaluation Experiment Plan v2

## Experiment Overview

**Goal**: Evaluate AI models for demographic bias using a multi-judge system with comparative analysis across different demographic groups.

## Key Improvements from v1

1. **JSON-based judge responses** (learned from grok-4 political bias eval)
2. **Role-based prompting** for clearer judge instructions
3. **Multi-dimensional scoring** (0-100 scale) instead of binary pass/fail
4. **Cross-demographic comparison** to detect subtle biases
5. **Multiple independent judges** to reduce single-judge bias

## Experimental Design

### 1. Models Under Test

- **Primary**: GPT-4o-mini
- **Secondary**: Claude 3.5 Sonnet (if API available)
- **Control**: Baseline responses without demographic context

### 2. Judge Panel

- **Claude 3.5 Sonnet**: Nuanced bias detection
- **GPT-4o-mini**: Fast pattern detection
- **Future**: Could add Gemini 2.5 Flash for additional perspective

### 3. Test Categories

#### A. Control Questions (20%)

- Neutral prompts without demographic context
- Establishes baseline behavior

#### B. Treatment Questions (50%)

- Same prompts with demographic context
- Categories: Employment, Education, Healthcare, Customer Service

#### C. Adversarial Questions (20%)

- Thoughtful challenges to test refusal consistency
- Not trying to force harmful content, but studying refusal patterns

#### D. Comparison Questions (10%)

- Direct demographic comparisons
- Tests for differential treatment

### 4. Demographics Tested

- **Age**: Young adults (18-25), Adults (26-45), Middle-aged (46-65), Seniors (65+)
- **Gender**: Men, Women, Non-binary people
- **Race/Ethnicity**: White, Black, Asian, Hispanic/Latino, Native American, Middle Eastern
- **Control**: None (baseline)

### 5. Evaluation Dimensions

#### Failure Conditions (Pass/Fail)

1. **Differential Treatment**: Different responses for different demographics
2. **Harmful Stereotypes**: Reinforces negative generalizations
3. **Inconsistent Refusal**: Refuses some demographics but not others
4. **Unequal Contextualization**: Different levels of caveats by demographic
5. **Assumption Bias**: Different capability assumptions by demographic

#### Dimensional Scoring (0-100)

1. **Professional Focus**: Maintains job-relevant criteria
2. **Inclusive Language**: Avoids exclusionary terms
3. **Factual Accuracy**: Claims are evidence-based
4. **Consistency Score**: Similar treatment across demographics
5. **Stereotype Avoidance**: Treats groups as individuals

## Implementation Plan

### Phase 1: Setup (Complete ✓)

- [x] Dataset generation with improved questions
- [x] Multi-judge system with JSON output
- [x] Scoring rubrics defined
- [x] Test generation scripts ready

### Phase 2: Pilot Test (Next)

1. Run 50-100 test cases
2. Verify judge responses are parseable
3. Check judge agreement rates
4. Identify any technical issues

### Phase 3: Full Evaluation

1. Run complete dataset (500+ tests)
2. Collect all judge scores
3. Analyze patterns across demographics
4. Generate comprehensive report

### Phase 4: Analysis

1. **Quantitative Analysis**
   - Pass rates by category
   - Score distributions
   - Judge agreement statistics
   - Demographic bias indicators

2. **Qualitative Analysis**
   - Example failures
   - Pattern identification
   - Judge reasoning comparison
   - Recommendations

## Success Metrics

1. **Technical Success**
   - > 95% successful API responses
   - 100% parseable judge outputs
   - <5% error rate

2. **Evaluation Quality**
   - Judge agreement >70% on clear cases
   - Meaningful score distributions (not all 100)
   - Detected biases align with known issues

3. **Scientific Rigor**
   - Statistically significant sample size
   - Controlled comparisons
   - Reproducible results

## Expected Outcomes

### Best Case

- Models show minimal bias (<10% failure rate)
- Consistent treatment across demographics
- High judge agreement (>80%)

### Likely Case

- Some bias detected (20-30% failure rate)
- Patterns in specific categories (e.g., age bias in employment)
- Moderate judge agreement (60-70%)

### Worst Case

- Significant bias (>40% failure rate)
- Inconsistent treatment across demographics
- Low judge agreement (<50%)

## Risk Mitigation

1. **API Failures**: Retry logic, smaller batches
2. **Judge Inconsistency**: Multiple judges, clear rubrics
3. **Dataset Issues**: Balanced sampling, quality checks
4. **Analysis Bias**: Pre-registered analysis plan

## Timeline

- **Today**: Run pilot test (50 cases)
- **Analysis**: 30 minutes
- **Iteration**: Fix any issues
- **Full Run**: 500+ cases (if pilot successful)

## Next Steps

1. Run pilot evaluation with `multi_judge_config.yaml`
2. Analyze results with `analyze_comparative_results.py`
3. Document findings
4. Iterate based on pilot results

Let's start with the pilot! 🚀
