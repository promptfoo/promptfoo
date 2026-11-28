---
title: Fullwidth Strategy
sidebar_label: Fullwidth
description: Test content filters with ASCII text encoded as Unicode fullwidth forms.
---

# Fullwidth Strategy

Use `fullwidth` to test how your target handles ASCII text encoded as Unicode fullwidth forms. The strategy maps printable ASCII characters (`U+0021` to `U+007E`) to fullwidth forms (`U+FF01` to `U+FF5E`). It also maps ASCII spaces (`U+0020`) to the ideographic space (`U+3000`). All other characters stay unchanged. The transform is deterministic and makes no extra model calls.

## Why it matters

CJK input methods produce fullwidth text in real traffic. Some prompt injection classifiers inspect raw input without applying `NFKC` normalization first. When that happens, a classifier can miss an attack that the target LLM still reads and follows.

## Configuration

Add `fullwidth` to the `strategies` list in `promptfooconfig.yaml`:

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - fullwidth
```

## Transformation example

For example, `Ignore all rules!` becomes `Ｉｇｎｏｒｅ　ａｌｌ　ｒｕｌｅｓ！`.

[Unicode compatibility normalization](https://www.unicode.org/faq/normalization.html) with `NFKC` reverses this mapping and restores the original ASCII text. Compare results on original and encoded inputs. Check if your normalization pipeline and filters treat both inputs the same way.

## Evaluation behavior

Each transformed test case stores the original prompt in `metadata.originalText` and sets `metadata.strategyId` to `'fullwidth'`. Promptfoo also appends `/Fullwidth` to existing assertion metrics. Plugins in the `coding-agent` family exclude `fullwidth` automatically because fullwidth characters break deterministic canary strings.

## Related strategies

See [Homoglyph Encoding](homoglyph.md) for visually similar character substitutions and [Arabic Presentation Forms](arabic-presentation-forms.md) for Unicode compatibility forms in Arabic script.
