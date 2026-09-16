# redteam-artprompt (Redteam: ArtPrompt ASCII Art Strategy)

You can run this example with:

```bash
npx promptfoo@latest init --example redteam-artprompt
cd redteam-artprompt
```

This example red teams a target with the `artprompt` strategy, which masks a sensitive word in each request as ASCII art. Token-level safety filters no longer see the harmful word, but a capable model can still read the art and reconstruct the request.

The strategy implements [Jiang et al., "ArtPrompt: ASCII Art-based Jailbreak Attacks against Aligned LLMs"](https://arxiv.org/abs/2402.11753) (ACL 2024).

## Prerequisites

- `OPENAI_API_KEY` set in your environment ([OpenAI API keys](https://platform.openai.com/api-keys)), or swap the target for any provider you have access to.

This example uses the `intent` plugin, so it does **not** require Promptfoo remote generation.

## Quick Start

```bash
promptfoo redteam run -c promptfooconfig.yaml
promptfoo redteam report
```

## How It Works

Each `intent` line becomes a test case. The `artprompt` strategy then:

1. Picks the word to mask (the longest word, or a `word` you configure).
2. Replaces it with `[MASK]` in the request.
3. Renders the word as an ASCII art banner and appends instructions to silently decode it.

The graders check whether the target answered the reconstructed harmful request. A higher attack success rate means the model is more susceptible to ASCII-art obfuscation.

See the [ArtPrompt strategy docs](https://www.promptfoo.dev/docs/red-team/strategies/artprompt/) for details.
