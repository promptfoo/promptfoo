---
sidebar_position: 102
---

# Other Encodings

The other encodings strategies provide additional text transformation methods to test model resilience against evasion techniques that use alternative text representations.

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

Add the Morse code strategy to your red team configuration:

```yaml
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

Add the Pig Latin strategy to your red team configuration:

```yaml
strategies:
  - piglatin # Apply Pig Latin transformation
```

## Example

Here's a complete example that applies these encoding transformations to test cases:

```yaml
# promptfooconfig.yaml
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
    - morse # Apply Morse code transformation
    - piglatin # Apply Pig Latin transformation
```

## Technical Details

These encoding transformations are static, deterministic processes that don't require additional API calls to implement. They provide a way to test how models handle content that has been transformed in ways that might bypass text-based content filters while remaining human-interpretable.

## Security Considerations

Alternative text encodings can be used to bypass content filters that rely on exact string matching. By replacing standard text with these encoded versions, attackers might be able to evade detection of prohibited content. These strategies help evaluate how well models handle these types of evasion techniques.
