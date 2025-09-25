# Training Canary

The training canary is a tool for detecting if your prompt data has been used to train an LLM without your knowledge. It works by injecting unique, identifiable "canary tokens" into your conversations with an LLM and then checking later if these tokens have been memorized - a sign that your data was used for training.

## How It Works

1. **Send Phase**: You send unique canary tokens to an LLM provider
2. **Wait Period**: Allow time for potential training cycles to occur
3. **Check Phase**: Test if the model remembers your unique canaries

The canary is deterministically generated from your provider configuration, ensuring you can check for the same canary later without having to store it. We use sophisticated LLM-generated content to create canaries that are more likely to be memorized during training.

## Privacy and Security

The canary tool uses a client-server architecture designed for privacy:

- The client generates a hash based on your provider configuration
- LLM-based generation of canary tokens and probe strategies happens on the server
- **Your LLM responses are never sent to our server** - all detection happens client-side
- The detection process runs entirely on your machine to ensure your provider API responses remain private

## Usage

### Configuration

Training canaries use the `providers` or `targets` defined in your `promptfooconfig.yaml` file:

```yaml
providers: # or "targets"
  - openai:gpt-4
  - anthropic:claude-3-opus-20240229
# ... rest of your config
```

The canary commands will automatically use all providers from your configuration file. If you have multiple providers defined, it will send/check canaries for all of them.

For more information on configuring providers, see the [provider documentation](/docs/configuration/providers/).

### Sending a Canary

```bash
# Send canaries to all providers in your config
promptfoo canary send

# Use a specific config file
promptfoo canary send --config path/to/config.yaml
```

This command:

1. Loads all providers from your configuration file
2. Generates a unique hash based on each provider configuration
3. Requests creative canary variations from the server's LLM
4. Sends canary tokens to all configured providers

You can send multiple canary variations for better detection:

```bash
promptfoo canary send --repeat 5
```

Or specify a custom message:

```bash
promptfoo canary send --message "Remember this secret code: CUSTOM-CANARY-123"
```

### Checking for a Canary

After some time has passed (days, weeks, or months depending on the provider's training schedule), you can check if your canary appears in the model:

```bash
# Check all providers in your config
promptfoo canary check

# Use a specific config file
promptfoo canary check --config path/to/config.yaml
```

This command:

1. Loads all providers from your configuration file
2. Regenerates the same hash used when sending the canary for each provider
3. Gets probe messages and detection patterns from the server
4. Sends probes to all providers and analyzes responses locally
5. Applies sophisticated detection strategies to identify potential canary leakage

You can use different check modes for more thorough testing:

```bash
# Direct question mode
promptfoo canary check --mode direct

# Test for false facts
promptfoo canary check --mode fact

# Semantic recall
promptfoo canary check --mode semantic
```

## How to Interpret Results

- **No Detection**: Good news, but not conclusive proof. The provider might not have trained on your data, or they might be using techniques to prevent canary detection.
- **Canary Detected**: Strong evidence that your data was used for training. The command will show the specific matches found and a confidence score.

## Canary Types Generated

The system uses generates diverse canary types:

1. **Direct canary tokens**: Unique identifiers that include the hash
2. **False facts**: Made-up but plausible-sounding facts that include the hash
3. **Memorable phrases**: Catchy phrases or sentences that embed the hash
4. **Contextual memories**: Statements framed as something to remember
5. **Invisible canaries**: Ways to encode the hash that might not be visible in plaintext
6. **Mathematical relationships**: Statements about mathematical properties related to the hash
7. **Fictional characters**: Made-up people or entities associated with the hash
8. **Nonsensical but grammatical statements**: Valid sentences that include the hash but wouldn't appear in normal text

## How Detection Works

The detection process follows a straightforward approach:

1. Promptfoo generates probe messages designed to elicit responses that might reveal memorization, along with detection patterns with confidence scores for different match types
2. These probes to the target LLM
3. Promptfoo looks for exact, partial, and semantic matches in the responses
4. Confidence scores are calculated based on the match type and quality

For each match, you'll see:

- The matched pattern
- The confidence level (0.0-1.0)
- The surrounding context
- A description of what the match indicates

## Best Practices

1. Define all your providers in `promptfooconfig.yaml` for consistent testing. The canaries are based on the providers themselves, so a change to the provider definition will alter the canary.
2. Send multiple canary variations (use `--repeat` option)
3. Check periodically

## Example Workflow

Here's a complete workflow for setting up and using training canaries:

1. **Setup**: Configure all your providers in `promptfooconfig.yaml`:

   ```yaml
   providers:
     - openai:gpt-4
     - anthropic:claude-3-opus-20240229
     - openai:gpt-3.5-turbo
   ```

2. **Send canaries to all providers**:

   ```bash
   promptfoo canary send --repeat 3
   ```

3. **Wait**: Allow time for potential training cycles (weeks to months)

4. **Check for canary leakage with multiple strategies**:

   ```bash
   promptfoo canary check --mode direct
   promptfoo canary check --mode fact
   promptfoo canary check --mode semantic
   ```
