# huggingface/hle (Humanity's Last Exam)

Evaluate LLMs against [Humanity's Last Exam (HLE)](https://arxiv.org/abs/2501.14249), a challenging benchmark created by 1,000+ experts across 500+ institutions. HLE features 3,000+ questions spanning 100+ subjects, designed to push AI capabilities to their limits.

**📖 [Read the complete HLE benchmark guide →](https://www.promptfoo.dev/docs/guides/hle-benchmark/)**

You can run this example with:

```bash
npx promptfoo@latest init --example huggingface/hle
cd huggingface/hle
```

## Prerequisites

- OpenAI API key set as `OPENAI_API_KEY`
- Anthropic API key set as `ANTHROPIC_API_KEY`
- Hugging Face access token (required for dataset access)

## Setup

Set your Hugging Face token:

```bash
export HF_TOKEN=your_token_here
```

Or add it to your `.env` file:

```env
HF_TOKEN=your_token_here
```

Get your token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens).

## Run the Evaluation

Run the evaluation:

```bash
npx promptfoo@latest eval
```

View results:

```bash
npx promptfoo@latest view
```

## What's Tested

This evaluation tests models on:

- Advanced mathematics and sciences
- Humanities and social sciences
- Professional domain knowledge
- Multimodal reasoning
- Interdisciplinary topics

Each question is evaluated for accuracy using an LLM judge that compares the model's response against the verified correct answer.

## Current AI Performance

HLE is designed to be extremely challenging. Recent model performance:

- **OpenAI Deep Research**: 26.6% accuracy
- **o4-mini**: 18.1% accuracy
- **DeepSeek-R1**: 9.4% accuracy

Low scores are expected - this benchmark represents the cutting edge of AI evaluation.

## Customization

### Test More Questions

Increase the sample size:

```yaml
tests:
  - huggingface://datasets/cais/hle?split=test&limit=100
```

### Add More Models

Compare multiple providers:

```yaml
providers:
  - anthropic:claude-sonnet-4-6
  - openai:o4-mini
  - id: deepseek:deepseek-flash
    config:
      max_tokens: 8192
      passthrough:
        thinking:
          type: enabled
```

Set `DEEPSEEK_API_KEY` to use DeepSeek V4.1 Flash. This config enables [thinking mode](https://api-docs.deepseek.com/guides/thinking_mode/) with an [8192-token completion limit](https://api-docs.deepseek.com/api/create-chat-completion/). The historical DeepSeek-R1 score above is for a different model.

### Different Prompting

Try alternative prompting strategies by modifying `prompt.py` or using static prompts:

```yaml
prompts:
  - 'Answer this question step by step: {{question}}'
  - file://prompt.py:create_hle_prompt
```

## Resources

- [HLE Paper](https://arxiv.org/abs/2501.14249)
- [HLE Dataset](https://huggingface.co/datasets/cais/hle)
- [Promptfoo Documentation](https://promptfoo.dev/docs/getting-started)
