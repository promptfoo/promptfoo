---
title: 'Evaluating ElevenLabs voice AI'
description: 'Step-by-step guide for testing ElevenLabs voice AI with Promptfoo - from TTS quality testing to conversational agent evaluation'
---

# Evaluating ElevenLabs voice AI

This guide walks you through testing ElevenLabs voice AI capabilities using Promptfoo, from basic text-to-speech quality testing to advanced conversational agent evaluation.

## Prerequisites

- Node.js 20+ installed
- ElevenLabs API key ([get one here](https://elevenlabs.io/app/settings/api-keys))
- 15 minutes

## Part 1: Text-to-Speech Quality Testing

Let's start by comparing different voice models and measuring their quality.

### Step 1: Setup

Install Promptfoo and set your API key:

```sh
npm install -g promptfoo
export ELEVENLABS_API_KEY=your_api_key_here
```

### Step 2: Create Your First Config

Create `promptfooconfig.yaml`:

```yaml
description: 'Compare ElevenLabs TTS models for customer service greetings'

prompts:
  - "Thank you for calling TechSupport Inc. My name is Alex, and I'll be assisting you today. How can I help?"

providers:
  - label: Flash Model (Fastest)
    id: elevenlabs:tts:rachel
    config:
      modelId: eleven_flash_v2_5
      outputFormat: mp3_44100_128

  - label: Turbo Model (Best Quality)
    id: elevenlabs:tts:rachel
    config:
      modelId: eleven_turbo_v2_5
      outputFormat: mp3_44100_128

tests:
  - description: Both models complete within 3 seconds
    assert:
      - type: latency
        threshold: 3000

  - description: Cost is under $0.01 per greeting
    assert:
      - type: cost
        threshold: 0.01
```

### Step 3: Run Your First Eval

```sh
promptfoo eval
```

You'll see results comparing both models:

```text
┌─────────────────────────┬──────────┬──────────┐
│ Prompt                  │ Flash    │ Turbo    │
├─────────────────────────┼──────────┼──────────┤
│ Thank you for calling...│ ✓ Pass   │ ✓ Pass   │
│ Latency: <3s            │ 847ms    │ 1,234ms  │
│ Cost: <$0.01            │ $0.003   │ $0.004   │
└─────────────────────────┴──────────┴──────────┘
```

### Step 4: View Results

Open the web UI to listen to the audio:

```sh
promptfoo view
```

## Part 2: Voice Customization

Now let's optimize voice settings for different use cases.

### Step 5: Add Voice Settings

Update your config:

```yaml
description: 'Test voice settings for different scenarios'

prompts:
  - 'Welcome to our automated system.' # Formal announcement
  - 'Hey there! Thanks for reaching out.' # Casual greeting
  - 'I understand your frustration. Let me help.' # Empathetic response

providers:
  - label: Professional Voice
    id: elevenlabs:tts:rachel
    config:
      modelId: eleven_flash_v2_5
      voiceSettings:
        stability: 0.8 # Consistent tone
        similarity_boost: 0.85
        speed: 0.95

  - label: Friendly Voice
    id: elevenlabs:tts:rachel
    config:
      modelId: eleven_flash_v2_5
      voiceSettings:
        stability: 0.4 # More variation
        similarity_boost: 0.75
        speed: 1.1 # Slightly faster

  - label: Empathetic Voice
    id: elevenlabs:tts:rachel
    config:
      modelId: eleven_flash_v2_5
      voiceSettings:
        stability: 0.5
        similarity_boost: 0.7
        style: 0.8 # More expressive
        speed: 0.9 # Slower, calmer

tests:
  - vars:
      scenario: formal
    provider: Professional Voice
    assert:
      - type: javascript
        value: output.includes("Welcome") || output.includes("system")

  - vars:
      scenario: casual
    provider: Friendly Voice
    assert:
      - type: latency
        threshold: 2000

  - vars:
      scenario: empathy
    provider: Empathetic Voice
    assert:
      - type: cost
        threshold: 0.01
```

Run the eval:

```sh
promptfoo eval
promptfoo view  # Compare the different voice styles
```

## Part 3: Speech-to-Text Accuracy

Test transcription accuracy by creating a TTS → STT pipeline.

### Step 6: Create Transcription Pipeline

Create `transcription-test.yaml`:

```yaml
description: 'Test TTS → STT accuracy pipeline'

prompts:
  - |
    The quarterly sales meeting is scheduled for Thursday, March 15th at 2:30 PM.
    Please bring your laptop, quarterly reports, and the Q4 projections spreadsheet.
    Conference room B has been reserved for this meeting.

providers:
  # Step 1: Generate audio
  - label: tts-generator
    id: elevenlabs:tts:rachel
    config:
      modelId: eleven_flash_v2_5

tests:
  - description: Generate audio and verify quality
    provider: tts-generator
    assert:
      - type: javascript
        value: |
          // Verify audio was generated
          const result = JSON.parse(output);
          return result.audio && result.audio.sizeBytes > 0;
```

Now add STT to verify accuracy. Create a second config `stt-accuracy.yaml`:

```yaml
description: 'Test STT accuracy'

prompts:
  - file://audio/generated-speech.mp3 # Audio from previous eval

providers:
  - id: elevenlabs:stt
    config:
      modelId: eleven_speech_to_text_v1
      calculateWER: true

tests:
  - vars:
      referenceText: 'The quarterly sales meeting is scheduled for Thursday, March 15th at 2:30 PM. Please bring your laptop, quarterly reports, and the Q4 projections spreadsheet. Conference room B has been reserved for this meeting.'
    assert:
      - type: javascript
        value: |
          const result = JSON.parse(output);
          // Check Word Error Rate is under 5%
          if (result.wer_result) {
            console.log('WER:', result.wer_result.wer);
            return result.wer_result.wer < 0.05;
          }
          return false;
```

Run the STT eval:

```sh
promptfoo eval -c stt-accuracy.yaml
```

## Part 4: Conversational Agent Testing

Test a complete voice agent with evaluation criteria.

### Step 7: Create Agent Config

Create `agent-test.yaml`:

```yaml
description: 'Test customer support agent performance'

prompts:
  - |
    User: Hi, I'm having trouble with my account
    User: I can't log in with my password
    User: My email is user@example.com
    User: I already tried resetting it twice

providers:
  - id: elevenlabs:agents
    config:
      # Create an ephemeral agent for testing
      agentConfig:
        name: Support Agent
        prompt: |
          You are a helpful customer support agent for TechCorp.
          Your job is to:
          1. Greet customers warmly
          2. Understand their issue
          3. Collect necessary information (email, account number)
          4. Provide clear next steps
          5. Maintain a professional, empathetic tone

          Never make promises you can't keep. Always set clear expectations.
        voiceId: 21m00Tcm4TlvDq8ikWAM # Rachel
        llmModel: gpt-4o-mini

      # Define evaluation criteria
      evaluationCriteria:
        - name: greeting
          description: Agent greets the user warmly
          weight: 0.8
          passingThreshold: 0.8

        - name: information_gathering
          description: Agent asks for email or account details
          weight: 1.0
          passingThreshold: 0.9

        - name: empathy
          description: Agent acknowledges user frustration
          weight: 0.9
          passingThreshold: 0.7

        - name: next_steps
          description: Agent provides clear next steps
          weight: 1.0
          passingThreshold: 0.9

        - name: professionalism
          description: Agent maintains professional tone
          weight: 0.8
          passingThreshold: 0.8

      # Limit conversation for testing
      maxTurns: 8
      timeout: 60000

tests:
  - description: Agent passes all critical evaluation criteria
    assert:
      - type: javascript
        value: |
          const result = JSON.parse(output);
          const criteria = result.analysis.evaluation_criteria_results;

          // Check that critical criteria passed
          const critical = ['information_gathering', 'next_steps', 'professionalism'];
          const criticalPassed = criteria
            .filter(c => critical.includes(c.name))
            .every(c => c.passed);

          console.log('Criteria Results:');
          criteria.forEach(c => {
            console.log(`  ${c.name}: ${c.passed ? '✓' : '✗'} (score: ${c.score.toFixed(2)})`);
          });

          return criticalPassed;

  - description: Agent conversation stays within turn limit
    assert:
      - type: javascript
        value: |
          const result = JSON.parse(output);
          return result.transcript.length <= 8;

  - description: Agent responds within reasonable time
    assert:
      - type: latency
        threshold: 60000
```

Run the agent eval:

```sh
promptfoo eval -c agent-test.yaml
```

### Step 8: Review Agent Performance

View detailed results:

```sh
promptfoo view
```

In the web UI, you'll see:

- Full conversation transcript
- Evaluation criteria scores
- Pass/fail for each criterion
- Conversation duration and cost
- Audio playback for each turn

## Part 5: Tool Mocking

### Step 9: Add Tool Mocking

Create `agent-with-tools.yaml`:

```yaml
description: "Test agent with order lookup tool"

prompts:
  - |
    User: What's the status of my order?
    User: Order number ORDER-12345

providers:
  - id: elevenlabs:agents
    config:
      agentConfig:
        name: Support Agent with Tools
        prompt: You are a support agent. Use the order_lookup tool to check order status.
        voiceId: 21m00Tcm4TlvDq8ikWAM
        llmModel: gpt-4o

        # Define available tools
        tools:
          - type: function
            function:
              name: order_lookup
              description: Look up order status by order number
              parameters:
                type: object
                properties:
                  order_number:
                    type: string
                    description: The order number (format: ORDER-XXXXX)
                required:
                  - order_number

      # Mock tool responses for testing
      toolMockConfig:
        order_lookup:
          response:
            order_number: "ORDER-12345"
            status: "Shipped"
            tracking_number: "1Z999AA10123456784"
            expected_delivery: "2024-03-20"

      evaluationCriteria:
        - name: uses_tool
          description: Agent uses the order_lookup tool
          weight: 1.0
          passingThreshold: 0.9

        - name: provides_tracking
          description: Agent provides tracking information
          weight: 1.0
          passingThreshold: 0.9

tests:
  - description: Agent successfully looks up order
    assert:
      - type: javascript
        value: |
          const result = JSON.parse(output);
          // Verify tool was called
          const toolCalls = result.transcript.filter(t =>
            t.role === 'tool_call'
          );
          return toolCalls.length > 0;

      - type: contains
        value: "1Z999AA10123456784"  # Tracking number from mock
```

Run with tool mocking:

```sh
promptfoo eval -c agent-with-tools.yaml
```

## Next Steps

You've learned to:

- ✅ Compare TTS models and voices
- ✅ Customize voice settings for different scenarios
- ✅ Test STT accuracy with WER calculation
- ✅ Evaluate conversational agents with criteria
- ✅ Mock tools for agent testing

### Explore More

- **Audio processing**: Use isolation for noise removal
- **Regression testing**: Track agent performance over time
- **Production monitoring**: Set up continuous testing

### Example Projects

Check out complete examples:

- [examples/elevenlabs-tts-advanced](https://github.com/promptfoo/promptfoo/tree/main/examples/elevenlabs-tts-advanced)
- [examples/elevenlabs-agents](https://github.com/promptfoo/promptfoo/tree/main/examples/elevenlabs-agents)

### Resources

- [ElevenLabs Provider Reference](/docs/providers/elevenlabs)
- [Promptfoo Documentation](https://www.promptfoo.dev/docs/intro)
- [ElevenLabs API Docs](https://elevenlabs.io/docs)

## Troubleshooting

### Common Issues

**Agent conversations timeout:**

- Increase `maxTurns` and `timeout` in config
- Simplify evaluation criteria
- Use faster LLM models

**High costs during testing:**

- Use `gpt-4o-mini` instead of `gpt-4o`
- Enable caching for repeated tests
- Implement LLM cascading
- Test with shorter prompts first

**Evaluation criteria always failing:**

- Start with simple, objective criteria
- Lower passing thresholds during development
- Review agent transcript to understand behavior
- Add more specific criteria descriptions

**Audio quality issues:**

- Try different `outputFormat` settings
- Adjust voice settings (stability, similarity_boost)
- Test with different models
- Consider using Turbo over Flash for quality

### Getting Help

- [GitHub Issues](https://github.com/promptfoo/promptfoo/issues)
- [Discord Community](https://discord.gg/promptfoo)
- [ElevenLabs Support](https://elevenlabs.io/support)
