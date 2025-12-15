# elevenlabs-tts-advanced (ElevenLabs Advanced TTS Features)

This example demonstrates advanced TTS capabilities:

- **Pronunciation Dictionaries** - Custom pronunciation for technical terms
- **Voice Design** - Generate voices from text descriptions
- **Voice Remixing** - Modify existing voices (style, pacing, gender, age)
- **Streaming with Advanced Features** - Combine streaming with pronunciation control

## Quick Start

```bash
npx promptfoo@latest init --example elevenlabs-tts-advanced
cd elevenlabs-tts-advanced
export ELEVENLABS_API_KEY=your_api_key_here
npx promptfoo@latest eval
```

## Features Demonstrated

### 1. Pronunciation Dictionaries

Control how technical terms, acronyms, and brand names are pronounced.

**Use Case**: Technical documentation, product demos, brand-specific content

```yaml
providers:
  - id: elevenlabs:tts
    config:
      pronunciationRules:
        # Spell out acronyms
        - word: API
          pronunciation: A-P-I

        # Custom pronunciation
        - word: SQL
          pronunciation: sequel

        # Multi-word terms
        - word: PostgreSQL
          pronunciation: post-gres-Q-L

        # Brand names
        - word: OpenAI
          pronunciation: open-A-I
```

**Common Use Cases**:

1. **Technical Content**

   ```yaml
   pronunciationRules:
     - word: JavaScript
       pronunciation: java-script
     - word: TypeScript
       pronunciation: type-script
     - word: Python
       pronunciation: pie-thon
     - word: Node.js
       pronunciation: node-jay-ess
     - word: GraphQL
       pronunciation: graph-Q-L
   ```

2. **Medical/Scientific Terms**

   ```yaml
   pronunciationRules:
     - word: COVID-19
       pronunciation: covid-nineteen
     - word: mRNA
       pronunciation: messenger-R-N-A
     - word: DNA
       pronunciation: D-N-A
   ```

3. **Brand Names & Products**
   ```yaml
   pronunciationRules:
     - word: Anthropic
       pronunciation: an-throw-pick
     - word: Llama
       pronunciation: lama
     - word: ChatGPT
       pronunciation: chat-G-P-T
   ```

### 2. Voice Design

Generate custom voices from natural language descriptions.

**Use Case**: Create unique voices for specific content types or brand identities

```yaml
providers:
  - id: elevenlabs:tts
    config:
      voiceDesign:
        description: A warm, professional voice with excellent clarity and a slight smile in the tone, perfect for technical documentation
        gender: female
        age: middle_aged
        accent: american
        accentStrength: 0.5 # 0-2, subtle to strong
```

**Voice Design Templates**:

#### Professional Voices

```yaml
# Corporate Presenter
voiceDesign:
  description: A confident, authoritative voice with clear articulation, perfect for business presentations
  gender: male
  age: middle_aged
  accent: american

# Educational Instructor
voiceDesign:
  description: A warm, patient voice with excellent clarity, ideal for educational content
  gender: female
  age: middle_aged
  accent: british
```

#### Friendly & Conversational

```yaml
# Customer Service
voiceDesign:
  description: A friendly, approachable voice with a smile in the tone, great for customer interactions
  gender: female
  age: young
  accent: american

# Podcast Host
voiceDesign:
  description: A casual, engaging voice with natural conversational flow, perfect for podcasts
  gender: male
  age: young
  accent: australian
```

#### Narrative & Storytelling

```yaml
# Audiobook Narrator
voiceDesign:
  description: A deep, resonant voice with storytelling quality and emotional range
  gender: male
  age: middle_aged
  accent: british

# Meditation Guide
voiceDesign:
  description: A soothing, tranquil voice with calming tones and gentle pacing
  gender: female
  age: middle_aged
  accent: american
  accentStrength: 0.3
```

### 3. Voice Remixing

Modify existing voices to change their characteristics.

**Use Case**: Adapt pre-made voices for different contexts or emotions

```yaml
providers:
  # Make a voice more energetic
  - id: elevenlabs:tts:energetic
    config:
      voiceId: 21m00Tcm4TlvDq8ikWAM # Rachel
      voiceRemix:
        style: energetic
        pacing: fast
        promptStrength: medium # low, medium, high, max

  # Make a voice calmer and slower
  - id: elevenlabs:tts:calm
    config:
      voiceId: 21m00Tcm4TlvDq8ikWAM
      voiceRemix:
        style: calm
        pacing: slow
        promptStrength: high
```

**Remix Parameters**:

| Parameter        | Options                                         | Use Case                      |
| ---------------- | ----------------------------------------------- | ----------------------------- |
| `style`          | energetic, calm, professional, casual, dramatic | Match voice to content mood   |
| `pacing`         | slow, normal, fast                              | Adjust speech speed           |
| `gender`         | male, female                                    | Change voice gender           |
| `age`            | young, middle_aged, old                         | Adjust perceived age          |
| `accent`         | american, british, australian, etc.             | Change accent                 |
| `promptStrength` | low, medium, high, max                          | How strongly to apply changes |

**Common Remix Scenarios**:

```yaml
# Sports Commentary (Energetic & Fast)
voiceRemix:
  style: energetic
  pacing: fast
  promptStrength: max

# ASMR Content (Calm & Slow)
voiceRemix:
  style: calm
  pacing: slow
  promptStrength: high

# News Anchor (Professional & Measured)
voiceRemix:
  style: professional
  pacing: normal
  promptStrength: medium

# Storytelling (Dramatic & Expressive)
voiceRemix:
  style: dramatic
  pacing: normal
  promptStrength: high
```

## Advanced Combinations

### Streaming + Pronunciation

Combine real-time streaming with custom pronunciation:

```yaml
providers:
  - id: elevenlabs:tts
    config:
      streaming: true
      pronunciationRules:
        - word: API
          pronunciation: A-P-I
        - word: WebSocket
          pronunciation: web-socket
```

**Benefits**:

- ~75ms first chunk latency
- Custom pronunciation for technical terms
- Ideal for live demos and interactive applications

### Voice Design + Pronunciation

Create a custom voice with domain-specific pronunciation:

```yaml
providers:
  - id: elevenlabs:tts
    config:
      voiceDesign:
        description: A friendly tech educator with clear pronunciation
        gender: female
        age: middle_aged
      pronunciationRules:
        - word: Python
          pronunciation: pie-thon
        - word: JavaScript
          pronunciation: java-script
```

## Cost Optimization

All advanced features use the same character-based pricing as basic TTS:

- ~$0.00002 per character (~$0.02 per 1000 characters)
- Free tier: 10,000 characters/month

**Cost Tracking**:

```yaml
tests:
  - assert:
      - type: cost
        threshold: 0.05 # Max $0.05 per test
```

## Testing Assertions

### Pronunciation Accuracy

```yaml
tests:
  - description: Verify tech terms are included
    vars:
      expectedTerms:
        - API
        - SQL
        - JavaScript
    assert:
      - type: javascript
        value: |
          const terms = context.vars.expectedTerms;
          terms.every(term => output.includes(term))
```

### Voice Quality Comparison

```yaml
tests:
  - description: Compare baseline vs custom pronunciation
    vars:
      baseline: '{{providers[0].output}}'
      custom: '{{providers[1].output}}'
    assert:
      - type: javascript
        value: |
          // Both should succeed
          !context.vars.baseline.includes('error') &&
          !context.vars.custom.includes('error')
```

### Latency with Advanced Features

```yaml
tests:
  - description: Ensure advanced features don't slow generation
    assert:
      - type: latency
        threshold: 8000 # 8 seconds max
```

## Real-World Use Cases

### 1. Technical Documentation

```yaml
config:
  voiceDesign:
    description: Clear, professional voice for technical content
    gender: female
    age: middle_aged
  pronunciationRules:
    - word: API
      pronunciation: A-P-I
    - word: REST
      pronunciation: rest
    - word: GraphQL
      pronunciation: graph-Q-L
    - word: WebSocket
      pronunciation: web-socket
    - word: JSON
      pronunciation: jay-sawn
    - word: YAML
      pronunciation: yam-mel
```

### 2. Brand-Specific Content

```yaml
config:
  voiceId: your-brand-voice-id
  voiceRemix:
    style: professional
    pacing: normal
  pronunciationRules:
    - word: YourProduct
      pronunciation: your-product
    - word: YourCompany
      pronunciation: your-company
```

### 3. Multi-Language Support

```yaml
# English with British accent
providers:
  - id: elevenlabs:tts:en-gb
    config:
      voiceDesign:
        description: British English speaker
        accent: british
        accentStrength: 1.5

  # English with American accent
  - id: elevenlabs:tts:en-us
    config:
      voiceDesign:
        description: American English speaker
        accent: american
        accentStrength: 1.0
```

### 4. Dynamic Content Adaptation

```yaml
# Morning news (Energetic)
providers:
  - id: elevenlabs:tts:morning
    config:
      voiceId: news-anchor-voice
      voiceRemix:
        style: energetic
        pacing: fast

  # Evening news (Calm)
  - id: elevenlabs:tts:evening
    config:
      voiceId: news-anchor-voice
      voiceRemix:
        style: calm
        pacing: normal
```

## Troubleshooting

### Voice Design Not Working

```
Error: Voice design failed
```

**Solutions**:

1. Ensure description is detailed (minimum 10 characters)
2. Specify gender and age for better results
3. Check API quota (voice design uses generation credits)

### Pronunciation Not Applied

```
Warning: Pronunciation dictionary not found
```

**Solutions**:

1. Verify pronunciation rules syntax
2. Ensure words match exactly (case-sensitive)
3. Check that you're not using both `pronunciationDictionaryId` and `pronunciationRules`

### Remix Changes Too Subtle

```
Issue: Voice sounds the same after remix
```

**Solutions**:

1. Increase `promptStrength` from medium to high or max
2. Make more significant parameter changes
3. Some voices have limited remix range - try a different base voice

## API Reference

### Pronunciation Dictionary Options

| Option                      | Type                  | Description                   |
| --------------------------- | --------------------- | ----------------------------- |
| `pronunciationRules`        | `PronunciationRule[]` | Array of pronunciation rules  |
| `pronunciationDictionaryId` | string                | Use existing dictionary by ID |

**PronunciationRule**:

```typescript
{
  word: string;           // Word to customize
  pronunciation: string;  // Phonetic pronunciation
  phoneme?: string;       // IPA/CMU phoneme (advanced)
  alphabet?: 'ipa' | 'cmu';  // Phonetic alphabet
}
```

### Voice Design Options

```typescript
{
  description: string;    // Natural language description
  gender?: 'male' | 'female';
  age?: 'young' | 'middle_aged' | 'old';
  accent?: string;        // e.g., 'british', 'american'
  accentStrength?: number;  // 0-2, default 1.0
  sampleText?: string;    // Optional sample for preview
}
```

### Voice Remix Options

```typescript
{
  style?: string;         // e.g., 'energetic', 'calm'
  pacing?: 'slow' | 'normal' | 'fast';
  gender?: 'male' | 'female';
  age?: 'young' | 'middle_aged' | 'old';
  accent?: string;
  promptStrength?: 'low' | 'medium' | 'high' | 'max';
}
```

## Related Examples

- [Basic TTS](../elevenlabs-tts/) - Voice comparison and basic features
- [STT](../elevenlabs-stt/) - Speech-to-Text transcription
- [Streaming TTS](../elevenlabs-tts/#streaming) - Real-time voice generation

## Resources

- [ElevenLabs Voice Design Docs](https://elevenlabs.io/docs/voice-design)
- [Pronunciation Dictionary Guide](https://elevenlabs.io/docs/pronunciation)
- [Voice Remixing API](https://elevenlabs.io/docs/voice-remix)
- [Supported Accents](https://elevenlabs.io/voice-library)
