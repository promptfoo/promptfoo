---
title: Text Mutation Strategies
sidebar_label: Text Mutations
description: Test normalization and content-filter resilience with deterministic Unicode, whitespace, casing, and homoglyph mutations.
keywords:
  [
    'combining marks',
    'content filter bypass',
    'random case',
    'unicode',
    'whitespace',
    'zalgo',
    'zero width',
  ]
---

# Text Mutation Strategies

Promptfoo offers five repeatable text mutations that test whether safety controls normalize adversarial input consistently:

- `zero-width` inserts invisible Unicode format characters.
- `unicode-noise` adds one combining mark to selected letters and numbers.
- `zalgo` adds multiple combining marks to selected letters and numbers.
- `whitespace-obfuscation` replaces horizontal whitespace with other spacing characters.
- `random-case` changes the case of selected ASCII letters.

The `text-mutations` collection runs all five strategies plus [`homoglyph`](homoglyph.md):

```yaml
redteam:
  strategies:
    - text-mutations
```

This is the same as listing each strategy:

```yaml
redteam:
  strategies:
    - zero-width
    - unicode-noise
    - zalgo
    - whitespace-obfuscation
    - random-case
    - homoglyph
```

## Exact behavior

Each mutation runs locally without calling a generation model. The same strategy, seed, settings, and input always produce the same result.

| Strategy                 | Eligible input                            | Transformation                                                                                         | Default rate |
| ------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------ |
| `zero-width`             | Unicode letters and numbers               | Inserts U+200B, U+200C, U+200D, or U+2060 after selected characters                                    | 0.2          |
| `unicode-noise`          | Unicode letters and numbers               | Appends one combining mark from U+0300 to U+036F whose Unicode category is `Mark`                      | 0.15         |
| `zalgo`                  | Unicode letters and numbers               | Appends `intensity` combining marks selected from the same range                                       | 1.0          |
| `whitespace-obfuscation` | Space, tab, form feed, vertical tab, NBSP | Replaces selected characters with tab, NBSP, thin space, hair space, narrow NBSP, or ideographic space | 0.5          |
| `random-case`            | ASCII letters                             | Chooses upper- or lowercase for each selected letter                                                   | 0.5          |

Newlines stay unchanged. When `rate` is greater than zero and eligible characters exist, Promptfoo changes at least one of them. Set `rate: 0` to leave the input unchanged.

For multi-input targets, each mutation, including `homoglyph`, transforms non-benign text fields while preserving input names, non-text values, and fields marked `config.benign: true`. This also applies when the mutation is layered after `jailbreak:meta`.

## Configuration

Each strategy accepts a `rate` from 0 to 1 and a string or numeric `seed`. Zalgo also accepts an integer `intensity` from 1 to 8.

```yaml
redteam:
  strategies:
    - id: zero-width
      config:
        rate: 0.3
        seed: normalization-suite

    - id: unicode-noise
      config:
        rate: 0.2
        seed: normalization-suite

    - id: zalgo
      config:
        rate: 0.6
        intensity: 4
        seed: normalization-suite

    - id: whitespace-obfuscation
      config:
        rate: 0.75
        seed: normalization-suite

    - id: random-case
      config:
        rate: 0.5
        seed: normalization-suite
```

The default seed is `promptfoo`. Promptfoo combines it with the strategy ID and original input before selecting mutation positions.

To configure one member of `text-mutations`, include both the collection and the configured strategy. The explicit strategy configuration takes precedence.

## What to verify

Compare each transformed result with the `basic` baseline. Check whether filters and the target model normalize the same characters, whether logs expose invisible characters, and whether normalization, whitespace, or casing changes allowlists, blocklists, routing, or other security decisions.

## Implementation provenance

This is an independent, MIT-licensed implementation of public Unicode behavior. It does not include third-party AGPL code or mutation tables. See [Unicode Core Specification, Chapter 3](https://www.unicode.org/versions/Unicode17.0.0/core-spec/chapter-3/), [Unicode Core Specification, Chapter 23](https://www.unicode.org/versions/Unicode17.0.0/core-spec/chapter-23/), and [Unicode Technical Standard #39](https://unicode.org/reports/tr39/).

## Related strategies

- [Homoglyph Encoding](homoglyph.md)
- [Other Encodings](other-encodings.md)
- [Layer](layer.md)
