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

Promptfoo includes five deterministic text mutations for testing whether safety controls normalize adversarial input consistently:

- `zero-width` inserts invisible Unicode format characters.
- `unicode-noise` adds one combining mark to selected letters and numbers.
- `zalgo` adds multiple combining marks to selected letters and numbers.
- `whitespace-obfuscation` replaces horizontal whitespace with alternative Unicode spacing characters.
- `random-case` changes the case of selected ASCII letters.

The `text-mutations` collection enables all five strategies plus the existing [`homoglyph`](homoglyph.md) strategy:

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - text-mutations
```

This is equivalent to:

```yaml title="promptfooconfig.yaml"
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

All five strategies are local transformations. They do not call a generation model. Given the same strategy, seed, configuration, and input text, they produce the same result.

| Strategy                 | Eligible input                            | Transformation                                                                                         | Default rate |
| ------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------ |
| `zero-width`             | Unicode letters and numbers               | Inserts U+200B, U+200C, U+200D, or U+2060 after selected characters                                    | 0.2          |
| `unicode-noise`          | Unicode letters and numbers               | Appends one randomly selected combining mark from U+0300–U+036F whose Unicode category is `Mark`       | 0.15         |
| `zalgo`                  | Unicode letters and numbers               | Appends `intensity` combining marks selected from the same range                                       | 1.0          |
| `whitespace-obfuscation` | Space, tab, form feed, vertical tab, NBSP | Replaces selected characters with tab, NBSP, thin space, hair space, narrow NBSP, or ideographic space | 0.5          |
| `random-case`            | ASCII letters                             | Chooses upper- or lowercase for each selected letter                                                   | 0.5          |

Newlines are not whitespace-mutation candidates, so the original line structure is preserved. If `rate` is greater than zero and the input has eligible characters, the strategy always mutates at least one eligible position. Set `rate: 0` for an explicit no-op.

## Configuration

Each strategy accepts a `rate` from 0 through 1 and a string or numeric `seed`. Zalgo also accepts an integer `intensity` from 1 through 8.

```yaml title="promptfooconfig.yaml"
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

The default seed is `promptfoo`. Promptfoo combines it with the strategy ID and original input before initializing the deterministic random stream, so unrelated prompts do not receive identical mutation positions.

## What to verify

Compare each transformed result with the `basic` baseline and check whether:

- input validation and policy classifiers normalize the same characters as the target model;
- logs and review tools expose invisible or combining characters clearly;
- Unicode normalization changes the security decision;
- allowlists, blocklists, or routing rules behave differently after whitespace or case changes.

## Implementation provenance

Promptfoo's implementation was independently written under the project's MIT license from public Unicode behavior. It does not copy third-party mutation tables or source code. The relevant specifications are [Unicode Core Specification, Chapter 3](https://www.unicode.org/versions/Unicode17.0.0/core-spec/chapter-3/), [Unicode Core Specification, Chapter 23](https://www.unicode.org/versions/Unicode17.0.0/core-spec/chapter-23/), and [Unicode Technical Standard #39](https://unicode.org/reports/tr39/).

## Related strategies

- [Homoglyph Encoding](homoglyph.md)
- [Other Encodings](other-encodings.md)
- [Layer](layer.md)
