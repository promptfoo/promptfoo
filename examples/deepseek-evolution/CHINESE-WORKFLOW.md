# Chinese Translation & Evaluation Workflow

**Purpose**: Translate the 1,360 English prompts to Simplified Chinese and run censorship evaluation in Chinese to validate NIST's findings.

**Expected outcome**: NIST found 1.5-10× higher CCP-narrative echo rates in Chinese vs English. We should independently replicate this.

---

## Phase 1: Translation (10 prompt sample)

### 1.1 Test Translation with Small Sample

```bash
# Translate first 10 prompts to validate translation quality
npm run local -- eval \
  -c examples/deepseek-evolution/translate-to-chinese.yaml \
  --env-file .env \
  --filter-first-n 10 \
  -j 5

# Cost: ~$0.05
# Time: ~30 seconds
# Output: ./output/translations-chinese.json
```

### 1.2 Process and Validate Translations

```bash
# Extract translations and create validation report
node examples/deepseek-evolution/process-translations.js \
  ./output/translations-chinese.json

# Outputs:
#   - ./output/CCP-sensitive-prompts-zh.csv (HuggingFace format)
#   - ./output/translation-validation.md (quality report)
```

### 1.3 Manual Spot-Check

Review `./output/translation-validation.md`:
- Check sample translations for accuracy
- Verify political sensitivity preserved
- Look for translation artifacts
- Validate Chinese naturalness

**Quality threshold**: >95% translations should pass validation

---

## Phase 2: Full Translation

If sample looks good, translate all 1,360 prompts:

```bash
# Translate all prompts
npm run local -- eval \
  -c examples/deepseek-evolution/translate-to-chinese.yaml \
  --env-file .env \
  -j 20

# Cost: ~$5-8
# Time: ~20-30 minutes
# Output: ./output/translations-chinese.json
```

Process translations:

```bash
node examples/deepseek-evolution/process-translations.js
```

---

## Phase 3: Upload to HuggingFace

Create new HuggingFace dataset: `promptfoo/CCP-sensitive-prompts-zh`

### 3.1 Create Dataset

```bash
# Install HuggingFace CLI
pip install huggingface_hub

# Login
huggingface-cli login

# Create dataset
huggingface-cli repo create --type dataset --organization promptfoo CCP-sensitive-prompts-zh
```

### 3.2 Upload CSV

Upload `./output/CCP-sensitive-prompts-zh.csv` via web interface or CLI:

```python
from datasets import Dataset
import pandas as pd

# Load CSV
df = pd.read_csv('./output/CCP-sensitive-prompts-zh.csv')

# Create dataset
dataset = Dataset.from_pandas(df)

# Push to HuggingFace
dataset.push_to_hub('promptfoo/CCP-sensitive-prompts-zh')
```

---

## Phase 4: Chinese Evaluation Config

Create `promptfooconfig-zh.yaml`:

```yaml
description: Tracking censorship across 5 DeepSeek models (CHINESE VERSION)

prompts:
  - '{{prompt}}'

providers:
  - id: 'openrouter:deepseek/deepseek-r1'
    label: 'R1 (Jan 2025)'
    config:
      temperature: 0
      max_tokens: 10240
      passthrough:
        include_reasoning: true

  - id: 'openrouter:deepseek/deepseek-r1-0528'
    label: 'R1-0528 (May 2025)'
    config:
      temperature: 0
      max_tokens: 10240
      passthrough:
        include_reasoning: true

  - id: 'openrouter:deepseek/deepseek-chat-v3.1'
    label: 'V3.1 (Aug 2025)'
    config:
      temperature: 0
      max_tokens: 10240
      reasoning_enabled: true

  - id: 'openrouter:deepseek/deepseek-v3.1-terminus'
    label: 'V3.1-Terminus (Sep 2025)'
    config:
      temperature: 0
      max_tokens: 10240
      reasoning_enabled: true

  - id: 'openrouter:deepseek/deepseek-v3.2-exp'
    label: 'V3.2-Exp (Sep 2025)'
    config:
      temperature: 0
      max_tokens: 10240
      reasoning_enabled: true

defaultTest:
  assert:
    - type: javascript
      value: file://detect-censorship-zh.js

tests: huggingface://datasets/promptfoo/CCP-sensitive-prompts-zh?split=train

outputPath: ./output/results-chinese.json

metadata:
  study: 'DeepSeek Censorship Evolution (Chinese)'
  language: 'zh-CN'
  date: '2025-11-16'
```

---

## Phase 5: Run Chinese Evaluation

### 5.1 Small Sample Test (10 prompts)

```bash
# Test with 10 Chinese prompts
npm run local -- eval \
  -c examples/deepseek-evolution/promptfooconfig-zh.yaml \
  --env-file .env \
  --filter-first-n 10 \
  -j 5

# Cost: ~$0.50
# Time: ~2 minutes
# Validates Chinese detection logic works
```

### 5.2 Full Chinese Evaluation

```bash
# Run all 1,360 Chinese prompts across 5 models
npm run local -- eval \
  -c examples/deepseek-evolution/promptfooconfig-zh.yaml \
  --env-file .env \
  -j 40

# Cost: ~$15-20
# Time: ~1.5-2 hours
# Output: ./output/results-chinese.json
```

---

## Phase 6: Comparative Analysis

Create analysis script to compare English vs Chinese results:

```javascript
// compare-languages.js
const englishResults = require('./output/results.json');
const chineseResults = require('./output/results-chinese.json');

// Compare censorship rates
// Compare CCP-narrative echo rates
// Validate NIST findings
```

Expected findings (based on NIST):

| Metric | English | Chinese | Ratio |
|--------|---------|---------|-------|
| R1-0528 censorship | 99.93% | 100% | 1.0× |
| R1-0528 CCP language | 22.8% | 35-40% | 1.6-1.8× |
| V3.2-Exp censorship | 67% | 75-85% | 1.1-1.3× |
| Thought suppression | 99.7% | 99.9% | 1.0× |

---

## Cost & Time Summary

### Translation Phase
- Sample (10): $0.05, 30 sec
- Full (1,360): $5-8, 20-30 min

### Evaluation Phase
- Sample (10): $0.50, 2 min
- Full (1,360): $15-20, 1.5-2 hours

### Total
- **Cost**: $20-28
- **Time**: 2-3 hours
- **Total prompts tested**: 13,600 (6,800 English + 6,800 Chinese)

---

## Quality Validation Checkpoints

1. **Translation Sample** (10 prompts)
   - [ ] >95% pass automated validation
   - [ ] Spot-check confirms political sensitivity preserved
   - [ ] Native speaker review (if available)

2. **Detection Logic** (10 Chinese responses)
   - [ ] Chinese patterns correctly detected
   - [ ] Censorship classification accurate
   - [ ] No false positives/negatives

3. **Full Results** (1,360 Chinese prompts)
   - [ ] Censorship rates higher than English (matches NIST)
   - [ ] CCP language rates 1.5-2× higher
   - [ ] Reasoning suppression rates similar

---

## Next Steps After Completion

1. **Documentation**
   - Create `CHINESE-EVALUATION.md` with findings
   - Add to blog post or separate follow-up article

2. **Data Publication**
   - Upload results to HuggingFace
   - Make Chinese dataset publicly available

3. **Analysis**
   - Compare EN vs ZH systematically
   - Validate NIST's 1.5-10× finding
   - Document language-dependent censorship

4. **Article Integration**
   - Add Chinese findings to blog post, or
   - Create follow-up: "Validating NIST: DeepSeek Censorship in Chinese"

---

## Troubleshooting

### Translation Issues

**Problem**: Translations contain English explanations
**Fix**: Update prompt to say "return ONLY translation, no explanation"

**Problem**: Political sensitivity lost
**Fix**: Strengthen prompt guidance on preserving provocative framing

**Problem**: Too many validation errors
**Fix**: Review failed cases, adjust patterns, re-translate subset

### Detection Issues

**Problem**: False negatives (censored marked as answered)
**Fix**: Add missing Chinese refusal patterns to `SOFT_REFUSAL_PATTERNS_ZH`

**Problem**: False positives (answered marked as censored)
**Fix**: Adjust length thresholds (Chinese is more dense than English)

**Problem**: CCP patterns not matching
**Fix**: Verify Simplified Chinese encoding, add pattern variants

---

## Files Created

1. `translate-to-chinese.yaml` - Translation config
2. `process-translations.js` - Translation processor
3. `detect-censorship-zh.js` - Chinese detection logic
4. `promptfooconfig-zh.yaml` - Chinese evaluation config (to be created)
5. `CHINESE-WORKFLOW.md` - This workflow guide

---

## References

- **NIST CAISI Report**: CCP-narrative echo rates in Chinese vs English
- **Original English Dataset**: https://huggingface.co/datasets/promptfoo/CCP-sensitive-prompts
- **DeepSeek Models**: R1, R1-0528, V3.1, V3.1-Terminus, V3.2-Exp
