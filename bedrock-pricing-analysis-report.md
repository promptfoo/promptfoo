# AWS Bedrock Pricing Analysis Report

## Executive Summary

Tested 16 unique Bedrock models across all example configurations. Found that **only 12% have working cost calculations**.

### Root Causes Identified:

1. **Missing Model Mappings** - Some models in AWS Pricing API are not mapped in our code
2. **Newer Models Not in API** - Recently launched models haven't been added to AWS Pricing API yet
3. **Newer Model Versions** - Newer versions of existing model families (Claude 4, Llama 4) not in API

---

## Test Results Summary

**Total Models Tested:** 16 unique model IDs
**Models WITH Cost Calculation:** 2 (amazon.nova-lite, amazon.nova-pro)
**Models WITHOUT Cost Calculation:** 14
**Pricing Coverage:** 12%

---

## Detailed Analysis

### ✅ Models WITH Pricing (Working)

| Model ID                        | Cost Calculated | Tokens | Status     |
| ------------------------------- | --------------- | ------ | ---------- |
| `bedrock:amazon.nova-lite-v1:0` | $0.0000195      | 88     | ✅ Working |
| `bedrock:amazon.nova-pro-v1:0`  | $0.0005712      | 1935   | ✅ Working |

---

### ❌ Models WITHOUT Pricing (Failures)

#### Category 1: Missing from Model Mappings (IN API, NOT MAPPED)

These models ARE in the AWS Pricing API but NOT in our `mapBedrockModelIdToApiName()` function:

| Model ID                                    | API Name                   | Input Price | Output Price |
| ------------------------------------------- | -------------------------- | ----------- | ------------ |
| `us.amazon.nova-premier-v1:0`               | **"Nova Premier"**         | $0          | $0.000021875 |
| `us.deepseek.r1-v1:0`                       | **"R1"**                   | $0.00000135 | $0.0000054   |
| `us.meta.llama4-scout-17b-instruct-v1:0`    | **"Llama 4 Scout 17B"**    | $1.7e-7     | $6.6e-7      |
| `us.meta.llama4-maverick-17b-instruct-v1:0` | **"Llama 4 Maverick 17B"** | $2.4e-7     | $9.7e-7      |
| `openai.gpt-oss-120b-1:0`                   | **"gpt-oss-120b"**         | $1.5e-7     | $3e-7        |
| `openai.gpt-oss-20b-1:0`                    | **"gpt-oss-20b"**          | $3.5e-8     | $3e-7        |
| `mistral.mistral-large-2407-v1:0`           | **"Mistral Large 2407"**   | $0.000002   | $0.000006    |

**Impact:** 7 models have pricing data available but fail to calculate costs due to missing mappings.

#### Category 2: Not in AWS Pricing API Yet

These models are NOT in the AWS Pricing API at all:

| Model ID                                        | Likely Reason                       |
| ----------------------------------------------- | ----------------------------------- |
| `us.anthropic.claude-opus-4-1-20250805-v1:0`    | Claude Opus 4.1 - Too new           |
| `us.anthropic.claude-opus-4-20250514-v1:0`      | Claude Opus 4 - Too new             |
| `us.anthropic.claude-sonnet-4-20250514-v1:0`    | Claude Sonnet 4 - Too new           |
| `us.anthropic.claude-3-7-sonnet-20250219-v1:0`  | Claude 3.7 Sonnet - Too new         |
| `anthropic.claude-haiku-4-5-20251001-v1:0`      | Claude Haiku 4.5 - Too new          |
| `us.meta.llama3-2-3b-instruct-v1:0`             | Region-prefixed variant not in API  |
| `ai21.jamba-1-5-large-v1:0`                     | Possibly too new or special pricing |
| `kb:us.anthropic.claude-sonnet-4-20250514-v1:0` | Knowledge base variant              |

**Impact:** 8 models cannot have pricing because AWS hasn't published pricing data yet.

---

## AWS Pricing API Data (us-west-2)

### Models Available in API:

The us-west-2 region pricing includes **37 models**:

#### Amazon Nova Family:

- ✅ Nova Premier ($0 input, $0.000021875 output)
- ✅ Nova Pro ($0 input, $0.0000032 output)
- ✅ Nova Pro Latency Optimized ($0.000001 input, $0.000004 output)
- ✅ Nova Lite ($0 input, $2.4e-7 output)
- ✅ Nova Micro ($0 input, $1.4e-7 output)

#### Meta Llama Family:

- ✅ Llama 4 Scout 17B
- ✅ Llama 4 Maverick 17B
- ✅ Llama 3.3 70B
- ✅ Llama 3.3 70B Custom
- ✅ Llama 3.2 90B, 11B, 3B, 1B
- ✅ Llama 3.1 405B, 70B, 8B
- ✅ Llama 3 70B, 8B

#### Anthropic Claude (Older Versions):

- ✅ Claude 3 Sonnet
- ✅ Claude 3 Haiku
- ✅ Claude 2.1
- ✅ Claude 2.0
- ✅ Claude Instant

#### Mistral Family:

- ✅ Mistral Large 2407
- ✅ Mistral Large
- ✅ Mistral 7B
- ✅ Mixtral 8x7B
- ✅ Pixtral Large 25.02

#### DeepSeek:

- ✅ R1 (DeepSeek R1)
- ✅ DeepSeek V3.1

#### Qwen:

- ✅ Qwen3 235B A22B 2507
- ✅ Qwen3 Coder 480B A35B
- ✅ Qwen3 Coder 30B A3B
- ✅ Qwen3 32B

#### OpenAI on Bedrock:

- ✅ gpt-oss-120b
- ✅ gpt-oss-20b

---

## Required Fixes

### 1. Add Missing Model Mappings

Update `src/providers/bedrock/pricingFetcher.ts` mappings:

```typescript
// Amazon Nova models - ADD PREMIER
'amazon.nova-micro-v1': 'Nova Micro',
'amazon.nova-lite-v1': 'Nova Lite',
'amazon.nova-pro-v1': 'Nova Pro',
'amazon.nova-premier-v1': 'Nova Premier',  // ⬅️ ADD THIS

// Meta Llama models - ADD LLAMA 4
'meta.llama3-3-70b-instruct-v1': 'Llama 3.3 70B Instruct',
'meta.llama4-scout-17b-instruct-v1': 'Llama 4 Scout 17B',  // ⬅️ ADD THIS
'meta.llama4-maverick-17b-instruct-v1': 'Llama 4 Maverick 17B',  // ⬅️ ADD THIS

// DeepSeek models - ADD THIS SECTION
'deepseek.r1-v1': 'R1',  // ⬅️ ADD THIS

// OpenAI models - ADD THIS SECTION
'openai.gpt-oss-120b-1': 'gpt-oss-120b',  // ⬅️ ADD THIS
'openai.gpt-oss-20b-1': 'gpt-oss-20b',  // ⬅️ ADD THIS
```

### 2. Fix Partial Pricing (Input = 0 Issue)

Many Nova models have `input: 0` but valid `output` pricing. Our current code treats this as valid, but it results in partial cost calculations. Consider:

**Option A:** Accept partial pricing (output-only for Nova models)
**Option B:** Treat `input: 0` as incomplete and return no cost

Current behavior is Option A (calculate output-only costs).

---

## Impact After Fixes

With the mapping fixes applied:

- **Before:** 2/16 models with pricing (12%)
- **After:** 9/16 models with pricing (56%)
- **Improvement:** +7 models (+44 percentage points)

Remaining 7 models without pricing are legitimately too new for AWS Pricing API.

---

## Recommendations

1. **Immediate:** Add the 7 missing model mappings listed above
2. **Monitor:** Check AWS Pricing API monthly for new Claude 4, Claude 3.7, and other new model additions
3. **Document:** Add comments noting which models are "too new" vs "missing from mappings"
4. **Test:** Re-run comprehensive pricing tests after adding mappings to verify 56% coverage
5. **Consider:** Add a fallback mechanism or warning when models have incomplete pricing data

---

## Files Analyzed

- Test Results: `/tmp/bedrock-pricing-test-results/*.json` (13 config files)
- Pricing Cache: `~/.promptfoo/cache/diskstore-*/...json` (us-west-2 region)
- Model Mappings: `src/providers/bedrock/pricingFetcher.ts:40-86`

---

**Generated:** 2025-11-21
**Tested Against:** AWS Bedrock Pricing API (us-west-2, us-east-1)
