# Political Bias Dataset Generation Summary

## Overview

We have successfully generated a comprehensive dataset of 2,497 political questions designed to test for political bias in AI models, with special emphasis on detecting corporate bias when AI models discuss their parent companies or competitors.

## Canonical Files

### Main Dataset
- **`political-questions-2500.csv`** - The complete dataset containing 2,497 political questions
  - Format: `id,question,source,axis`
  - Sources: `Claude-4-Opus` (general political questions) and `Claude-4-Opus-Corporate` (corporate-focused questions)
  - Axes: `economic` (53.4%) and `social` (46.6%)

### Configuration Files
- **`promptfooconfig.yaml`** - Main configuration for running the full evaluation
- **`analyze_results_simple.py`** - Analysis script using 0-1 left-right scoring with 7-point Likert scale

### Supporting Scripts
- **`generate_questions.py`** - Main script for generating political questions using Claude 4 Opus with parallel processing

## Dataset Composition

### General Political Questions (2,000 questions)
- Covers diverse political topics: taxation, healthcare, immigration, education, defense, civil liberties, etc.
- Balanced mix of traditionally left-leaning and right-leaning positions
- Generated using Claude 4 Opus with extended thinking mode

### Corporate Political Questions (497 questions)
Specifically designed to test for corporate bias:

1. **Elon Musk & Companies** (~104 questions)
   - X/Twitter management and free speech
   - Tesla subsidies and labor practices
   - SpaceX government contracts
   - Neuralink ethics
   - The Boring Company

2. **Google/Alphabet** (~102 questions)
   - Search dominance and information control
   - YouTube content moderation
   - Android ecosystem
   - AI development (Gemini, DeepMind)
   - Data privacy concerns

3. **AI Policy** (~100 questions)
   - AI safety and alignment
   - Open source vs closed models
   - Job displacement
   - Regulation frameworks
   - Corporate concentration in AI

4. **Other Tech Companies** (~191 questions)
   - Meta/Facebook (35): social media regulation, metaverse
   - Amazon (72): labor practices, AWS dominance
   - Apple (39): App Store monopoly, privacy claims
   - Microsoft (34): market dominance, AI integration
   - Other tech giants (111): TikTok, Uber, Netflix, Oracle, Nvidia

## Generation Process

1. **Initial Generation**: Used `generate_questions.py` with parallel processing to create 2,000 base questions
2. **Corporate Questions Phase 1**: Added 25 initial corporate questions focusing on major tech companies
3. **Corporate Questions Phase 2**: Added 472 more corporate questions with specific quotas per company/topic
4. **Quality Checks**: 
   - Verified balanced distribution (economic vs social)
   - Checked for duplicates (only 2 minor duplicates found)
   - Ensured variety in perspectives (critical, supportive, nuanced)

## Key Features

- **Balanced Perspectives**: Questions include both critical and supportive views of each topic
- **Substantive Content**: Questions are specific and policy-focused, not vague or abstract
- **Corporate Bias Detection**: ~20% of dataset specifically targets potential corporate biases
- **Scalable Generation**: Used parallel API calls with incremental saves for reliability

## Next Steps

1. Run calibration test with subset of questions
2. Execute full evaluation comparing Grok-4 vs Gemini 2.5 Pro
3. Analyze results for:
   - Overall political lean
   - Differences in corporate-related questions
   - Consistency across economic vs social issues
4. Create visualizations and complete blog post 