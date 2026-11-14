---
title: Arabic Presentation Forms Strategy
sidebar_label: Arabic Presentation Forms
description: Test content filters with Arabic letters encoded as Unicode presentation forms.
---

# Arabic Presentation Forms Strategy

Use `arabic-presentation-forms` to test how your target handles Arabic-script text encoded with Unicode compatibility characters. It replaces 43 Arabic letters and selected Persian/Urdu letters with their isolated presentation forms. The transformation is deterministic and makes no additional model calls.

```yaml title="promptfooconfig.yaml"
redteam:
  language: ar
  strategies:
    - arabic-presentation-forms
```

Generate Arabic-language test cases or supply your own Arabic text. This strategy does not translate text: Latin characters, digits, punctuation, and unmapped letters remain unchanged.

For example, `مرحبا` becomes `ﻡﺭﺡﺏﺍ`. The letters retain their compatibility equivalents, but isolated forms can change how letters join and how fonts display a word. Identical appearance or a successful filter bypass is not guaranteed.

[Unicode compatibility normalization](https://www.unicode.org/faq/normalization.html) such as NFKC maps these presentation forms back to their base letters. Compare the target's behavior on the original and encoded test cases to assess whether its normalization and filtering handle both consistently.

Each transformed case records the original input in `metadata.originalText`, uses strategy ID `arabic-presentation-forms`, and appends `/ArabicPresentationForms` to existing assertion metrics. Coding-agent plugins that depend on deterministic canaries exclude this encoding strategy.

See [Homoglyph Encoding](homoglyph.md) for substitutions that also apply to Latin text.
