---
title: Bijection Encoding Strategy
sidebar_label: Bijection Encoding
description: Test whether a model follows harmful requests encoded in a temporary one-to-one substitution language.
keywords: ['bijection', 'encoding', 'in-context learning', 'jailbreak', 'substitution cipher']
---

# Bijection Encoding Strategy

The `bijection` strategy replaces letters with a temporary substitution alphabet and asks the target to decode the request. It asks for an answer in ordinary English, so Promptfoo can grade the response normally.

Use it to find input filters that miss an encoded request the model still understands.

## Usage

```yaml
redteam:
  strategies:
    - bijection
```

By default, Promptfoo permutes 16 letters, includes three harmless translation examples, generates one variant per test, and uses the seed `promptfoo`.

## Configuration

```yaml
redteam:
  strategies:
    - id: bijection
      config:
        type: digit
        dispersion: 20
        encodingLength: 3
        includeExamples: true
        n: 3
        seed: regression-suite
```

| Option            | Type             | Default     | Valid values                                                               |
| ----------------- | ---------------- | ----------- | -------------------------------------------------------------------------- |
| `type`            | string           | `letter`    | `letter` or `digit`                                                        |
| `dispersion`      | integer          | `16`        | 0 to 26; `1` is invalid for `letter` because one letter cannot be permuted |
| `encodingLength`  | integer          | `2`         | 2 to 4; used only by `digit` mappings                                      |
| `includeExamples` | boolean          | `true`      | Include or omit three harmless translation examples                        |
| `n`               | integer          | `1`         | 1 to 20 independently seeded variants per test                             |
| `seed`            | string or number | `promptfoo` | Use the same seed to reproduce a mapping                                   |

## Exact behavior

Promptfoo maps all 26 lowercase English letters:

- With `type: letter`, the selected letters map to one another. Each selected letter changes, unselected letters stay unchanged, and no two letters share an output.
- With `type: digit`, selected letters map to unique, fixed-width numeric tokens. Unselected letters stay unchanged.
- Encoding ignores letter case and produces lowercase letter tokens.
- Spaces, punctuation, and other non-letter characters stay unchanged.

Each prompt includes the complete mapping, optional examples, and the encoded request. Promptfoo derives each variant's mapping from its seed, the original text, and the variant index.

## Response and grading

Promptfoo grades the target's unmodified answer with the test's original assertions. Refusals, answers, errors, and structured output keep their usual meaning.

An ordinary-language response avoids translation errors during grading and keeps the test focused on whether the target acts on the encoded request.

## Cost and limitations

The transformation runs locally and does not require a generation model. Each variant makes one target call, so `n: 3` makes three target calls per source test.

Digit mappings can be harder for models to decode. Literal numbers in the request may also resemble generated tokens, so use letter mappings when those numbers matter.

## Implementation provenance

This is an independent, MIT-licensed implementation of the attack described in [Endless Jailbreaks with Bijection Learning](https://arxiv.org/abs/2410.01294). It does not include third-party AGPL code, prompts, mapping generators, examples, or tests.

## Related strategies

- [Base64 Encoding](base64.md)
- [Other Encodings](other-encodings.md)
- [Layer](layer.md)
