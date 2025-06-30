---
sidebar_position: 102
description: Learn how to test LLM resilience using camelCase, Morse code, Pig Latin, and emoji-based text transformations to bypass content filters and evaluate model security.
---

# Other Encodings

The other-encodings strategy collection provides multiple text transformation methods to test model resilience against evasion techniques that use alternative text representations. This collection automatically includes camelCase, Morse code, Pig Latin, and emoji-based encodings.

## Strategy Collection

You can use the `other-encodings` collection in your configuration to automatically include all encoding strategies in this collection:

```yaml title="promptfooconfig.yaml"
strategies:
  - other-encodings # Includes camelCase, Morse code, Pig Latin, and emoji encoding
```

This is equivalent to specifying each strategy individually:

```yaml title="promptfooconfig.yaml"
strategies:
  - camelcase
  - morse
  - piglatin
```

## camelCase

The camelCase strategy converts text to camelCase by removing spaces and capitalizing the first letter of each subsequent word.

### How It Works

The transformation follows these rules:

- The first word starts with a lowercase letter
- Each subsequent word has its first letter capitalized
- Spaces between words are removed
- Punctuation and numbers remain unchanged

For example, "Hello World" becomes:

```
helloWorld
```

### Configuration

Add the camelCase strategy individually to your red team configuration:

```yaml title="promptfooconfig.yaml"
strategies:
  - camelcase # Apply camelCase transformation
```

## Morse Code

The Morse code strategy converts all characters in the test payload to dots and dashes, the universal encoding system developed for telegraph communications.

### How It Works

Standard ASCII characters are converted to their Morse code equivalents:

- Letters are converted to sequences of dots (.) and dashes (-)
- Spaces between words are replaced with forward slashes (/)
- Characters without a Morse code equivalent remain unchanged

For example, "Hello World" becomes:

```
.... . .-.. .-.. --- / .-- --- .-. .-.. -..
```

### Configuration

Add the Morse code strategy individually to your red team configuration:

```yaml title="promptfooconfig.yaml"
strategies:
  - morse # Apply Morse code transformation
```

## Pig Latin

The Pig Latin strategy transforms text according to the playful language game rules of Pig Latin, which is a simple form of language encoding.

### How It Works

The transformation follows these rules:

- For words beginning with consonants, the initial consonant cluster is moved to the end and "ay" is added
- For words beginning with vowels, "way" is added to the end
- Punctuation and numbers remain unchanged

For example, "Hello World" becomes:

```
elloHay orldWay
```

### Configuration

Add the Pig Latin strategy individually to your red team configuration:

```yaml title="promptfooconfig.yaml"
strategies:
  - piglatin # Apply Pig Latin transformation
```

## Emoji Encoding

The Emoji encoding strategy hides a UTF-8 payload inside invisible Unicode variation selectors appended to an emoji. This allows short strings to contain arbitrary data while remaining mostly unreadable.

### How It Works

- Each byte of the UTF-8 text is mapped to one of 256 variation selectors.
- The selector sequence is appended to a base emoji (😊 by default).
- Decoding reverses the mapping to recover the original text.

### Configuration

Add the emoji strategy individually to your red team configuration:

```yaml title="promptfooconfig.yaml"
strategies:
  - emoji # Hide text inside an emoji
```

## Example

Here's a complete example that applies the encoding collection to test cases:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - 'Answer this question: {{prompt}}'

providers:
  - openai:gpt-4.1

# Red team config
redteam:
  plugins:
    - owasp:llm
  strategies:
    - basic # Include original prompts
    - other-encodings # Includes camelCase, Morse code, Pig Latin, and emoji encoding
```

## Technical Details

These encoding transformations are static, deterministic processes that don't require additional API calls to implement. They provide a way to test how models handle content that has been transformed in ways that might bypass text-based content filters while remaining human-interpretable.

## Security Considerations

Alternative text encodings can be used to bypass content filters that rely on exact string matching. By replacing standard text with these encoded versions, attackers might be able to evade detection of prohibited content. These strategies help evaluate how well models handle these types of evasion techniques.

Some specific security benefits of testing with these encodings:

- Identifies weaknesses in content moderation systems that rely on keyword matching
- Tests model comprehension of obfuscated harmful content
- Evaluates guardrail effectiveness against simple transformation techniques
- Helps develop more robust safety mechanisms for public-facing AI applications

## Related Concepts

- [ROT13 Encoding](rot13.md) - Another simple character substitution encoding
- [Base64 Encoding](base64.md) - Binary-to-text encoding strategy
- [Leetspeak Encoding](leetspeak.md) - Character substitution with numbers and symbols
- [Homoglyph Encoding](homoglyph.md) - Visual character substitution technique
