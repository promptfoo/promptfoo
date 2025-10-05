---
title: Multilingual Red Teaming - Test AI Security Across Languages
sidebar_label: Multilingual Red Teaming
description: Comprehensive multilingual support for red team testing with automatic language detection and improved grading
date: September 22, 2025
---

# Multilingual Red Teaming - Test AI Security Across Languages

AI systems deployed globally must be secure in **every language** they support. Our new multilingual red teaming capabilities ensure your AI is safe whether users speak English, Spanish, Mandarin, Arabic, or any other language.

## The Global AI Security Gap

Most AI security testing focuses on English, leaving critical vulnerabilities in other languages:

### Real-World Attack Vectors

Attackers exploit language-specific weaknesses:

- **Character encoding attacks** - Unicode tricks that bypass filters
- **Translation exploits** - Prompts that are safe in English but harmful in other languages
- **Cultural context** - Offensive content varies dramatically across cultures
- **Homoglyph attacks** - Visually identical characters from different alphabets

### Compliance Requirements

Global regulations demand multilingual safety:

- **EU AI Act** - Must test in all official EU languages (24 languages)
- **China's regulations** - Mandarin safety testing required
- **GDPR** - Data protection across all EU languages
- **Local laws** - Country-specific content restrictions

### User Base Reality

Your users aren't all English speakers:

- 75% of internet users prefer non-English content
- Attackers target the "long tail" of less-tested languages
- Customer trust depends on consistent safety across languages

## How It Works

### Automatic Language Detection

The system automatically:

1. **Detects source language** of your AI system
2. **Generates attacks** in multiple target languages
3. **Translates responses** for consistent grading
4. **Identifies language-specific vulnerabilities**

No manual configuration required - just specify which languages to test.

### Improved Grading Accuracy

Multilingual grading addresses unique challenges:

- **Cultural context** - What's offensive in one culture may be acceptable in another
- **Idiomatic expressions** - Literal translations miss nuanced attacks
- **False positives** - Reduces incorrect failures due to language differences
- **Native evaluation** - Graders understand cultural and linguistic context

### Supported Languages

Current support includes:

**Tier 1** (Full support):
- English, Spanish, French, German
- Mandarin Chinese, Japanese, Korean
- Portuguese, Italian, Dutch
- Arabic, Russian, Hindi

**Tier 2** (Beta support):
- Turkish, Polish, Swedish, Norwegian
- Thai, Vietnamese, Indonesian
- Hebrew, Greek, Czech

More languages added regularly based on demand.

## Attack Strategies

### Cross-Language Jailbreaks

Test if translating attacks bypasses safety:

```yaml
strategies:
  - multilingual
languages:
  - spanish
  - mandarin
  - arabic
```

The system:
1. Generates jailbreak attempts in each language
2. Tests if translated prompts bypass English-tuned safety
3. Identifies language-specific vulnerabilities

### Unicode Obfuscation

Detect encoding-based attacks:

- **Homoglyphs**: Latin 'a' vs Cyrillic 'а' (visually identical)
- **Zero-width characters**: Invisible content injection
- **RTL/LTR mixing**: Bidirectional text exploits
- **Emoji encoding**: Using emojis to bypass filters

### Cultural Context Testing

Ensure culturally appropriate responses:

- **Religious content** - Varies by region
- **Political topics** - Sensitive in different countries
- **Taboo subjects** - Cultural differences in acceptability
- **Historical references** - Context-dependent interpretation

## Configuration Example

```yaml
redteam:
  plugins:
    - harmful
    - pii
    - jailbreak

  strategies:
    - multilingual

  config:
    # Test these languages
    languages:
      - spanish
      - mandarin
      - french
      - arabic

    # Optional: specify severity by language
    languageConfig:
      arabic:
        # Stricter PII rules for Arabic markets
        plugins:
          pii:
            severity: critical

      mandarin:
        # Additional compliance for China
        plugins:
          - id: policy
            config:
              policy: 'china-cybersecurity-law'
```

## Results and Reporting

Multilingual reports show:

### Language-Specific Vulnerabilities

```
Spanish: 12 vulnerabilities found
  - Jailbreak: 5 (High severity)
  - PII leakage: 4 (Critical)
  - Harmful content: 3 (Medium)

Mandarin: 8 vulnerabilities found
  - Character encoding: 4 (High)
  - Cultural insensitivity: 3 (Medium)
  - Translation errors: 1 (Low)
```

### Attack Surface Analysis

Identify which languages are most vulnerable:

```
Highest Risk Languages:
1. Arabic - Risk score: 8.2
2. Mandarin - Risk score: 7.6
3. Spanish - Risk score: 6.1
4. French - Risk score: 4.3
```

### Cross-Language Comparisons

See if vulnerabilities exist in some languages but not others:

- English: Jailbreak blocked ✓
- Spanish: Jailbreak successful ✗
- Mandarin: Jailbreak successful ✗

This identifies gaps in multilingual safety tuning.

## Use Cases

### E-Commerce Platforms

Test product recommendations across markets:
- Ensure appropriate suggestions in all regions
- Prevent culturally insensitive content
- Verify translation quality in product assistance

### Healthcare Applications

Medical AI must be safe in every language:
- Critical drug interaction warnings
- Emergency triage in patient's native language
- HIPAA compliance across language barriers

### Financial Services

Banking chatbots serve global customers:
- Fraud detection in multiple languages
- Regulatory compliance per region
- Financial advice that's culturally appropriate

### Content Moderation

Social platforms need multilingual safety:
- Hate speech detection across languages
- Cultural context for moderation decisions
- Coordinated attacks in multiple languages

## Best Practices

1. **Test top 3-5 languages** of your user base first
2. **Include high-risk languages** (Arabic, Mandarin for Unicode attacks)
3. **Combine with other strategies** (multilingual + jailbreak)
4. **Regular retesting** as you update AI models
5. **Native speaker review** for critical applications

## Performance Considerations

Multilingual testing increases evaluation time:

- **2x slower** for 2 languages
- **3x slower** for 3-5 languages
- **Parallel execution** recommended for large test suites

Use sampling for rapid iteration:

```yaml
# Test subset of languages during development
development:
  languages: [spanish]

# Full suite for production validation
production:
  languages: [spanish, mandarin, french, arabic]
```

## What's Next

Upcoming enhancements:

- **Dialect support** - Regional language variations
- **Language pair testing** - Specific source→target combinations
- **Custom language models** - Bring your own translation/grading models
- **Language mix attacks** - Code-switching exploits

Multilingual red teaming ensures your AI is secure for **all** your users, not just English speakers.

[Learn more about multilingual testing →](/docs/red-team/strategies/multilingual/)
