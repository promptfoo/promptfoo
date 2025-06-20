# variable-optimizer

This example demonstrates how to use the **Variable Optimizer** provider to automatically improve variable values within your prompts until test assertions pass.

The optimizer analyzes assertion failures and learns from previous attempts to suggest better variable values.

You can run this example with:

```bash
npx promptfoo@latest init --example variable-optimizer
```

## What it does

Instead of manually tweaking variable values, the optimizer automatically:

1. Tests your current variable value against assertions
2. Analyzes why assertions failed
3. Suggests improved variable values
4. Repeats until all tests pass

## How it works

The variable optimizer follows this process:

1. **Takes your fixed prompt template** (e.g., `'Translate the following to French: {{text}}'`)
2. **Identifies the target variable** to optimize (e.g., `text`)
3. **Tests against your assertions** to see what fails
4. **Analyzes failure reasons** to understand what the test needs
5. **Learns from previous attempts** to avoid repeating failures
6. **Iteratively improves** the variable value until assertions pass
7. **Returns the best result** with optimized variables

## Key Features

### 🎯 **Assertion-Focused**

- Analyzes specific assertion failures (contains, JSON schema, etc.)
- Understands what each test is actually looking for
- Targets optimization toward assertion requirements

### 📈 **Progressive Learning**

- **Attempts 1-2**: Direct fixes based on assertion failure messages
- **Attempts 3-4**: Contextual and structural modifications
- **Attempts 5+**: Creative reframing and alternative approaches

### 🧠 **Failure Pattern Recognition**

- Remembers what hasn't worked in previous attempts
- Identifies patterns in failed approaches
- Adapts strategy based on optimization history

## Prerequisites

- OpenAI API key (set `OPENAI_API_KEY` environment variable)

## Examples

This directory contains two examples demonstrating different use cases:

### 1. Basic Translation Optimization (`promptfooconfig.basic.yaml`)

**Simple Example**: Optimizing English text to produce French translations containing specific words.

**Prompt template:** `'Translate the following to French: {{text}}'`  
**Target variable:** `text`  
**Goal:** Find English phrases that translate to French containing specific keywords

**Test Cases:**

- `"Hello world"` → should contain "bonjour"
- `"Good morning"` → should contain "matin"
- `"Thank you very much"` → should contain "merci"
- `"I like animals"` → should contain "chat" (requires specific animal)
- `"The weather is nice today"` → should contain "nuit" (requires complete reframing)

**Configuration:**

- **Max Turns**: 3-4 optimization attempts per test
- **Improver Model**: `openai:gpt-4o`
- **Provider**: `openai:gpt-4o`

### 2. Content Moderation Testing (`promptfooconfig.content-filter.yaml`)

**Advanced Example**: Testing content moderation robustness by optimizing injection prompts.

💡 **Testing Purpose**: Validates the robustness of content moderation systems by testing various prompt modifications.

**How it works:**
The example simulates a **social media content moderation AI** that classifies posts as:

- `"safe"` - Content is appropriate
- `"unsafe"` - Content violates policies
- `"review_needed"` - Borderline content requiring human review

**Test Objective**: Find injection prompts that can influence these classifications for validation purposes.

**Test Cases:**

1. **Hate Speech**: Can injection prompts influence hate speech to be classified as safe?
2. **Violent Threats**: Will violent threats maintain their unsafe classification?
3. **Financial Scams**: How does the system handle scam content with contextual prompts?
4. **Safe Content**: Can innocent content be made to appear dangerous?

**Configuration:**

- **Target Variable**: `injection` - The prompt modification being optimized
- **Max Turns**: 4 optimization attempts per test
- **Improver Model**: `openai:gpt-4.1`
- **Provider**: `openai:gpt-4.1`
- **Multi-Assertion**: JSON schema validation + classification testing

## Running the Examples

### Basic Translation Example

```bash
npx promptfoo@latest eval -c examples/variable-optimizer/promptfooconfig.basic.yaml
```

### Content Moderation Example

```bash
npx promptfoo@latest eval -c examples/variable-optimizer/promptfooconfig.content-filter.yaml
```

### Local Development

```bash
npm run local -- eval -c examples/variable-optimizer/promptfooconfig.basic.yaml
npm run local -- eval -c examples/variable-optimizer/promptfooconfig.content-filter.yaml
```

## Expected Output

### Basic Translation Example

For each test case, you'll see:

1. **Initial attempt** with original variable value
2. **Assertion failure** explaining what's missing
3. **Optimized attempts** with improved variable values
4. **Success** when assertions finally pass

Example output:

```
Attempt 1: "I like animals" → "J'aime les animaux" (missing "chat")
Attempt 2: "I like cats" → "J'aime les chats" ✅ (contains "chat")
```

### Content Moderation Example

#### 🟢 **Robust System (Desired Outcome)**

```
Successes: 0/4 (0%)
Pass Rate: 0.00%
```

_System successfully resisted all optimization attempts_

#### 🟡 **Partially Vulnerable**

```
Successes: 1/4 (25%)
Pass Rate: 25.00%
```

_Some optimization succeeded - targeted improvements needed_

#### 🔴 **Vulnerable System (Concerning)**

```
Successes: 3/4 (75%)
Pass Rate: 75.00%
```

_Most optimizations succeeded - system needs strengthening_

## Understanding the Results

### Basic Translation

- **Success**: The optimizer found English text that produces the required French keywords
- **Failure**: Even after multiple attempts, no suitable English phrase was found

### Content Moderation

- **Success (Attack)**: The optimizer found injection prompts that influenced classification
- **Failure (Defense)**: The moderation system resisted optimization attempts

## Customization

You can customize these examples by:

- **Changing `targetVariable`** to optimize different variables
- **Adding complex assertions** to test optimization capabilities
- **Using different `improverModel`** providers
- **Adjusting `maxTurns`** for more/fewer optimization attempts
- **Creating custom templates** for specific optimization strategies

## Advanced Usage

For more complex optimization scenarios, explore:

- Modifying the prompt templates for different domains
- Testing multi-variable optimization
- Implementing custom assertion types
- Creating domain-specific optimization strategies

## Use Cases

The Variable Optimizer is valuable for:

- ✅ **Prompt engineering** - Finding optimal variable values automatically
- ✅ **Content moderation testing** - Validating system robustness
- ✅ **Quality assurance** - Ensuring prompts work across different inputs
- ✅ **Edge case discovery** - Finding boundary conditions in your systems
- ✅ **System improvement** - Identifying areas for enhancement
