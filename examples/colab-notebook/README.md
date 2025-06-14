# Colab Notebook Example

Run this example with:

```bash
npx promptfoo@latest init --example colab-notebook
```

This comprehensive example demonstrates **promptfoo** integration with Python in Google Colab with advanced patterns and latest models.

## What's Included

### 🔧 **Modern Setup**

- **Node.js 22** installation (latest LTS)
- **Latest promptfoo** with improved Python support
- **Modern LangChain** integration (v0.1+ syntax)

### 🤖 **Latest Model Evaluation**

- **o1-mini** - Advanced reasoning capabilities
- **GPT-4.1-mini** - Latest efficient model
- **Claude-3.5-Sonnet** - Advanced language understanding

### 🐍 **Comprehensive Python Integration**

#### **1. Python Providers**

- **LangChain Math Chain** - Structured problem solving vs direct LLM calls
- **Custom Python Functions** - Your own business logic evaluation
- **API Integration** - External data sources vs LLM knowledge

#### **2. Advanced Python Assertions**

- **Inline Python assertions** - Quick validation logic
- **External assertion functions** - Complex multi-criteria scoring
- **Component-based scoring** - Detailed breakdown with named scores
- **Mathematical verification** - Programmatic answer checking

#### **3. Dynamic Test Generation**

- **Python test case generators** - Create tests programmatically
- **Configurable generators** - Customize test parameters
- **Realistic scenarios** - E-commerce, customer service, translations
- **Scalable test suites** - Generate hundreds of tests efficiently

#### **4. Multiple Assertion Types**

```yaml
assert:
  - type: contains # Simple text matching
  - type: python # Custom Python logic
  - type: llm-rubric # AI-powered evaluation
  - type: regex # Pattern matching
```

## Prerequisites

- Google Colab account (free tier sufficient)
- API keys for LLM providers:
  - `OPENAI_API_KEY` - Get from [OpenAI API keys page](https://platform.openai.com/api-keys)
  - `ANTHROPIC_API_KEY` - Get from [Anthropic Console](https://console.anthropic.com/)

## Quick Start

1. **[Open promptfoo_example.ipynb in Google Colab](https://colab.research.google.com/github/promptfoo/promptfoo/blob/main/examples/colab-notebook/promptfoo_example.ipynb)**
2. **Run cells sequentially** - The notebook guides you through each step
3. **Add your API keys** using Colab's secret management
4. **Explore results** in the interactive web viewer

## Key Features Demonstrated

### Basic Configuration

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: 'E-commerce evaluation with latest models'
providers: [openai:o1-mini, openai:gpt-4.1-mini, anthropic:claude-3-5-sonnet-20241022]
tests:
  - vars: { name: 'Bob', question: 'Can you help me find sandals?' }
    assert:
      - type: contains
        value: 'sandals'
      - type: python
        value: "len(output) > 50 and 'helpful' in output.lower()"
      - type: llm-rubric
        value: 'Response is helpful and professional'
```

### Advanced Python Assertions

```python
def evaluate_customer_service(output, context):
    """Multi-criteria evaluation with detailed scoring."""
    scores = {
        'politeness': calculate_politeness(output),
        'helpfulness': calculate_helpfulness(output),
        'specificity': calculate_specificity(output)
    }
    overall_score = sum(scores.values()) / len(scores)

    return {
        'pass': overall_score > 0.6,
        'score': overall_score,
        'namedScores': scores,
        'componentResults': [...]
    }
```

### Dynamic Test Generation

```python
def generate_translation_tests(config=None):
    """Generate test cases programmatically."""
    phrases = config.get("phrases", default_phrases)
    languages = config.get("languages", default_languages)

    test_cases = []
    for phrase in phrases:
        for lang in languages:
            test_cases.append({
                "vars": {"text": phrase, "target_language": lang},
                "assert": [{"type": "python", "value": "file://assertions.py:check_translation"}]
            })
    return test_cases
```

### Multi-Provider Comparisons

```yaml
providers:
  - openai:o1-mini # Latest reasoning model
  - exec:python langchain_math.py # LangChain implementation
  - exec:python custom_solver.py # Your custom logic
```

## Expected Results

The notebook demonstrates:

### **1. Basic E-commerce Evaluation**

- Multi-model comparison across customer service scenarios
- Professional response validation
- Inline Python assertions for response quality

### **2. Advanced Math Problem Solving**

- o1-mini reasoning vs LangChain vs custom Python
- Mathematical verification of answers
- Complex problem-solving evaluation

### **3. Dynamic Test Generation**

- Customer service scenarios generated programmatically
- Translation quality with language-specific validation
- Configurable test parameters

### **4. Comprehensive Python Integration**

- External assertion files with detailed scoring
- Component-based evaluation results
- Named scores for specific criteria

## Use Cases

Perfect for:

- **Data Scientists** - Model comparison in familiar notebook environment
- **ML Engineers** - Evaluating custom Python models vs LLMs
- **QA Engineers** - Automated testing with custom validation logic
- **Researchers** - Systematic evaluation with reproducible metrics
- **Developers** - Testing LLM integrations before production

## Advanced Examples in Notebook

1. **Customer Service Quality Evaluation**

   - Multi-criteria scoring (politeness, helpfulness, specificity)
   - Component-based results with detailed breakdowns
   - Professional tone and response quality validation

2. **Mathematical Problem Solving**

   - o1-mini vs LangChain vs custom Python solvers
   - Programmatic answer verification
   - Complex reasoning capability comparison

3. **Translation Quality Assessment**

   - Language-specific authenticity checking
   - Dynamic test case generation
   - Configurable evaluation parameters

4. **Weather Information Comparison**
   - LLM knowledge vs real-time API data
   - External service integration patterns
   - API response validation

## Next Steps

After running this notebook:

- **Customize assertions** with your own Python evaluation logic
- **Add more providers** (local models, custom APIs, etc.)
- **Scale test generation** for comprehensive evaluation suites
- **Integrate advanced features** like red-team evaluations
- **Deploy to CI/CD** for automated testing pipelines

## Resources

- **[Full Documentation](https://promptfoo.dev/docs/)**
- **[Python Integration Guide](https://promptfoo.dev/docs/integrations/python/)**
- **[Configuration Reference](https://promptfoo.dev/docs/configuration/guide/)**
- **[Python Examples Repository](https://github.com/promptfoo/promptfoo/tree/main/examples)**
- **[Community Discord](https://discord.gg/gHPS9jjfbs)**
