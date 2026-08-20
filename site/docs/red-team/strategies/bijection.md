---
title: Bijection Encoding Strategy
sidebar_label: Bijection Encoding
description: Test whether a model follows harmful requests encoded in a temporary one-to-one substitution language.
keywords: ['bijection', 'encoding', 'in-context learning', 'jailbreak', 'substitution cipher']
---

# Bijection Encoding Strategy

The `bijection` strategy creates a temporary substitution language, encodes the original test prompt, and asks the target to decode the request and answer its meaning in ordinary language.

This tests a boundary mismatch: a target model may infer the encoded request from the mapping and examples even when an upstream policy control does not recognize the same representation.

## Usage

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - bijection
```

The default configuration changes 16 letters with a letter-to-letter permutation, includes three harmless translation examples, generates one variant per test, and uses the seed `promptfoo`.

## Configuration

```yaml title="promptfooconfig.yaml"
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

| Option            | Type             | Default     | Valid values                                                                 |
| ----------------- | ---------------- | ----------- | ---------------------------------------------------------------------------- |
| `type`            | string           | `letter`    | `letter` or `digit`                                                          |
| `dispersion`      | integer          | `16`        | 0–26; `1` is invalid for `letter` because a one-item permutation cannot move |
| `encodingLength`  | integer          | `2`         | 2–4; used by `digit` mappings                                                |
| `includeExamples` | boolean          | `true`      | Include or omit three harmless in-context translations                       |
| `n`               | integer          | `1`         | 1–20 independently seeded variants per source test                           |
| `seed`            | string or number | `promptfoo` | Reproduce the same mappings                                                  |

## Exact behavior

Promptfoo builds a complete mapping for the 26 lowercase English letters:

- With `type: letter`, `dispersion` selected letters are permuted among themselves. Every selected letter changes, every unselected letter maps to itself, and every output letter has exactly one input letter.
- With `type: digit`, selected letters map to unique, fixed-width numeric codewords. Unselected letters map to themselves.
- Encoding is case-insensitive and emits lowercase letter codewords, so original letter casing is not preserved.
- Spaces, punctuation, and non-letter characters in the request remain unchanged.

For each test, the generated prompt contains original instructions for using the temporary language, the full mapping table, optional harmless examples, and the encoded request. Each `n` variant derives a separate deterministic mapping from the configured seed, original text, and variant index.

## Response and grading

The target is asked to answer the decoded request directly in ordinary language. Promptfoo does not transform the response, so the test's normal assertions grade exactly what the target returned. A refusal, an attempted answer, an error, and structured output all retain the same semantics they would have in a basic red-team test.

Keeping the response in ordinary language avoids introducing a second source of translation errors during grading. The strategy measures whether the target can infer and act on the encoded input, not whether it can encode its own answer perfectly.

## Cost and limitations

The transformation itself is local and does not require remote generation. Each variant makes one target call, so `n: 3` triples the target calls for tests using this strategy.

Digit mappings can be harder for models to follow than letter mappings. Because literal numbers in the request are left unchanged, a numeric sequence may resemble one of the generated codewords and make the request ambiguous. Use letter mappings when the original request contains important numeric values.

## Implementation provenance

Promptfoo's implementation was independently written under the project's MIT license from the attack formulation in the public paper [Endless Jailbreaks with Bijection Learning](https://arxiv.org/abs/2410.01294). The implementation, prompt wording, mapping generator, examples, response instructions, and tests are original to Promptfoo and do not incorporate third-party AGPL source code.

## Related strategies

- [Base64 Encoding](base64.md)
- [Other Encodings](other-encodings.md)
- [Layer](layer.md)
