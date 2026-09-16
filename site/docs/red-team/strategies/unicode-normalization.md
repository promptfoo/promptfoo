---
sidebar_label: Unicode Normalization
title: Unicode Normalization Strategy
description: Test whether AI systems and their input controls treat canonically or compatibility-equivalent Unicode sequences consistently
---

# Unicode Normalization Strategy

Unicode can represent visually identical or closely related text with different code-point sequences. A filter and a model may interpret those sequences differently if they normalize input at different stages or use different normalization forms.

The Unicode Normalization strategy rewrites generated test cases using one of the four forms defined by [Unicode Standard Annex #15](https://unicode.org/reports/tr15/):

- **NFC**: canonical decomposition followed by composition
- **NFD**: canonical decomposition
- **NFKC**: compatibility decomposition followed by composition
- **NFKD**: compatibility decomposition

The default is **NFKD**, which produces the broadest decomposition and is useful for exposing character-level assumptions. Set the form explicitly when reproducibility across configurations matters.

## Configuration

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - id: unicode-normalization
      config:
        form: NFKD
```

`form` is case-sensitive and must be one of `NFC`, `NFD`, `NFKC`, or `NFKD`.

## What Changes

Normalization does not translate or remove Unicode characters. It changes their representation when an equivalent canonical or compatibility form exists.

| Input representation            | Form | Output representation           |
| ------------------------------- | ---- | ------------------------------- |
| `Cafe` + combining acute accent | NFC  | precomposed `Café`              |
| precomposed `Café`              | NFD  | `Cafe` + combining acute accent |
| fullwidth `ＡＢＣ`              | NFKC | `ABC`                           |
| circled digit `①`               | NFKD | `1`                             |

ASCII-only prompts are never changed: all four forms are the identity transform on ASCII input. Promptfoo skips those no-op results so the strategy does not duplicate a baseline probe or issue an unnecessary provider call. A test set whose payloads are entirely ASCII therefore yields no probes at all, and Promptfoo logs a warning saying so.

## Normalization vs. Homoglyphs

Normalization and homoglyph substitution test different behaviors:

- **Unicode normalization** changes a string to an equivalent Unicode normalization form.
- **Homoglyph substitution** replaces characters with visually similar characters from other scripts.

Promptfoo already provides a separate [Homoglyph strategy](homoglyph.md). To test both behaviors, compose the existing strategies with [Layer](layer.md) instead of maintaining a second confusable-character table:

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - id: layer
      config:
        steps:
          - id: unicode-normalization
            config:
              form: NFKD
          - homoglyph
```

Ordering matters. Applying `NFKD` after homoglyph substitution can fold some compatibility characters back to simpler forms, while applying homoglyph substitution last preserves those substitutions in the final probe.

Inside a Layer pipeline, an unchanged normalization step passes its input to later steps. During test generation, Promptfoo omits the final probe only when the complete pipeline leaves the input unchanged. For per-turn layers on an agentic strategy, the unchanged prompt is sent through so the conversation can continue.

## When to Use It

Use this strategy when the target or a control in front of it performs character-level matching, tokenization, script detection, or Unicode canonicalization. It is particularly relevant for multilingual input and text containing combining marks, fullwidth characters, ligatures, or other compatibility characters.

Because generated attack payloads are English ASCII unless you direct otherwise, pair this strategy with a source of non-ASCII text so it has something to normalize — compose it with the `multilingual` strategy or [Homoglyph](homoglyph.md) via [Layer](layer.md), or point it at plugins and custom policies whose payloads already carry such characters.

## Related Strategies

- [Homoglyph](homoglyph.md)
- [Layer](layer.md)
- [Leetspeak](leetspeak.md)
