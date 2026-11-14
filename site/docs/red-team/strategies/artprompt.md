---
title: ArtPrompt ASCII Art Strategy
sidebar_label: ArtPrompt (ASCII Art)
description: Use the ArtPrompt testing strategy to assess whether a model applies its input policy consistently when a word is represented as ASCII art in an eval.
keywords:
  [
    'artprompt',
    'ascii art',
    'filter bypass',
    'jailbreak',
    'llm security',
    'red teaming',
    'safety bypass',
    'word masking',
  ]
---

# ArtPrompt ASCII Art Strategy

The ArtPrompt strategy replaces a single sensitive word in a request with an ASCII art rendering of that word. The generated prompt asks the target to decode the banner and answer the reconstructed request. Use it to measure how the target handles this representation; success depends on the target and the selected word.

This implementation is inspired by [Jiang et al., "ArtPrompt: ASCII Art-based Jailbreak Attacks against Aligned LLMs"](https://arxiv.org/abs/2402.11753) (ACL 2024).

## Why It Works

The paper argues the attack works because:

- Safety alignment is trained on the semantics of tokenized words, not on the visual shapes ASCII art forms.
- Masking the most safety-triggering word removes the tokens that content classifiers key on.
- Instruction-following models can often recover the word from the art, so the harmful intent may survive even though the literal word does not.

According to the authors, ArtPrompt is able to induce unsafe behavior from all five models they evaluated (GPT-3.5, GPT-4, Gemini, Claude, and Llama2), and they report that it compares favorably against the other jailbreaks in their study. Effectiveness in practice varies by model and prompt, so treat these as reported results rather than guarantees; measure the actual attack success rate for your target with Promptfoo's graders.

## Implementation

Use it in your `promptfooconfig.yaml`:

```yaml
redteam:
  strategies:
    - artprompt
```

By default the strategy selects an ASCII word using a length heuristic; it does not determine which word is most sensitive. It picks the longest word after skipping common instruction scaffolding like `how`, `make`, or `steps`, and on a length tie it prefers the last word. To force a specific word, pass `word`:

```yaml
redteam:
  strategies:
    - id: artprompt
      config:
        word: orchid
```

## How It Works

The strategy transforms each test case by:

1. Selecting the word to mask (`config.word`, otherwise the longest content word, skipping instruction scaffolding such as `how`, `make`, and `steps`).
2. Replacing that word in the request with `[MASK]`.
3. Rendering the word as an ASCII art banner (each capital letter drawn as a 5-row block of `#`).
4. Appending instructions that tell the model to silently decode the art and answer as if `[MASK]` were the decoded word.

The built-in font supports ASCII letters A-Z. `word` must contain only those letters. If the configured word is absent, the strategy uses the automatic heuristic. Inputs without any ASCII word are skipped with a warning and do not count as ArtPrompt probes. Original baseline cases remain available. ArtPrompt requires a single text input and skips the reserved multi-input variable. Coding-agent plugins exclude ArtPrompt to preserve exact canary and receipt matches.

Masking replaces matching words and regular inflections; unrelated compounds may retain the same letters. This does not guarantee that a content filter will miss the request or that a target will decode the banner.

## Example

The [ArtPrompt example](https://github.com/promptfoo/promptfoo/tree/main/examples/redteam-artprompt) uses fictional topics. Compare the baseline and transformed requests against a test target with a policy for those topics to check that its decisions are consistent.

## Related Concepts

- [Leetspeak](leetspeak.md) - Character substitution obfuscation
- [Homoglyph Encoding](homoglyph.md) - Visually similar Unicode characters
- [Base64 Encoding](base64.md) - Alternative encoding strategy
- [Red Team Strategies](/docs/red-team/strategies/) - Full strategy catalog
