# anthropic-prompt-improver

This example demonstrates automated prompt optimization using Anthropic's Claude to iteratively improve prompt variables.

You can run this example with:

```bash
npx promptfoo@latest init --example anthropic-prompt-improver
```

## Overview

The Anthropic Prompt Improver provider uses Claude to iteratively optimize your prompt template to work well across ALL test cases. It works by:

1. **Evaluating** the current prompt template against all test cases simultaneously
2. **Generating** multiple improved versions of the entire prompt using Claude
3. **Testing** each candidate prompt across all test scenarios 
4. **Iterating** until the prompt satisfies all test cases or no further improvement is found

## Prerequisites

This example requires the following environment variables:

- `ANTHROPIC_API_KEY` - Your Anthropic API key ([get one here](https://console.anthropic.com/))
- `OPENAI_API_KEY` - Your OpenAI API key ([get one here](https://platform.openai.com/api-keys))

## Running the Example

1. **Set your API keys:**
   ```bash
   export ANTHROPIC_API_KEY="your-anthropic-api-key"
   export OPENAI_API_KEY="your-openai-api-key"
   ```

2. **Run the evaluation:**
   ```bash
   npx promptfoo@latest eval
   ```

## Configuration

### Provider Configuration

```yaml
defaultTest:
  provider:
    id: promptfoo:anthropic:prompt-improver
    config:
      maxTurns: 10                     # Max optimization iterations
      numCandidates: 4                 # Candidate prompts per iteration
      stallIterations: 6               # Stop after N non-improving rounds
      useExperimentalApi: false        # Use Anthropic's experimental API
```

### Configuration Options

| Option               | Type    | Default | Description                                      |
| -------------------- | ------- | ------- | ------------------------------------------------ |
| `maxTurns`           | number  | `10`    | Maximum number of optimization iterations        |
| `numCandidates`      | number  | `4`     | Number of candidate prompts per iteration        |
| `stallIterations`    | number  | `6`     | Stop after this many rounds without improvement  |
| `useExperimentalApi` | boolean | `false` | Use Anthropic's experimental prompt improver API |

## Example Scenarios

### 1. Dragon Story (Fairy Tale Structure)
- **Prompt:** "A dragon who has lost their fire"
- **Requirements:** "Make it engaging and creative"
- **Assertions:** Must start with "Once upon a time", contain "dragon", be 200-500 characters, and have clear story structure

### 2. Sci-fi Story (Dialogue & Suspense)
- **Prompt:** "A space station crew discovers something unexpected"
- **Requirements:** "Make it thrilling and mysterious" 
- **Assertions:** Must contain dialogue, mention "space", include discovery elements, and build suspense

### 3. Historical Fiction (Authentic Details)
- **Prompt:** "A young apprentice in medieval times discovers an ancient secret"
- **Requirements:** "Include historical accuracy and vivid descriptions"
- **Assertions:** Must mention "medieval" and "apprentice", be at least 150 words, include authentic details

### 4. Mystery Story (Clues & Red Herrings)
- **Prompt:** "A detective investigating a crime in a small town"
- **Requirements:** "Include compelling mystery elements"
- **Assertions:** Must mention "detective", include clues/evidence, contain red herrings, be at least 300 characters

## How It Works

1. **Global Assessment:** The provider evaluates how well the original prompt template performs across ALL test cases
2. **Feedback Generation:** It creates comprehensive feedback describing which assertions failed across different test scenarios
3. **Candidate Generation:** Claude generates multiple improved versions of the entire prompt template
4. **Multi-Test Evaluation:** Each candidate prompt is tested against ALL test cases and scored globally
5. **Best Selection:** The prompt with the highest overall score across all tests becomes the new template
6. **Iteration:** The process repeats until the prompt satisfies all test cases or improvement stalls
7. **Final Output:** The optimized prompt template works well across all scenarios

## Expected Results

The improver should automatically transform a generic prompt like:

> "Write a creative story based on this prompt: {{story_prompt}}\n\nAdditional requirements: {{requirements}}"

Into an optimized template that works across all test cases, such as:

> "Write a creative story of 200-500 words based on this prompt: {{story_prompt}}. {{requirements}} Make sure to include specific details, vivid descriptions, and satisfy all story requirements. For fairy tales, begin with 'Once upon a time'. For mysteries, include clues or evidence. For historical fiction, mention the time period explicitly."

## API Usage

You can also use the experimental Anthropic Prompt Improver API by setting `useExperimentalApi: true`. This requires access to Anthropic's beta prompt tools API.

## Troubleshooting

- **Missing API keys:** Ensure both `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are set
- **No improvements:** Try increasing `numCandidates` or `maxTurns` for complex scenarios
- **API errors:** Check your Anthropic API access and rate limits
- **LLM rubric failures:** LLM-based assertions are subjective; consider making them more specific

## Extending This Example

You can adapt this pattern for other use cases by optimizing prompt templates across multiple scenarios:

- **SQL Generation:** Optimize query templates to work across different database schemas and query types
- **Code Generation:** Improve prompts to generate correct code for various programming languages and patterns
- **Email Writing:** Refine templates to work across different audiences, tones, and purposes
- **Chatbot Responses:** Optimize role prompts to handle diverse conversation scenarios effectively

The key is to define diverse test cases with clear, testable assertions that represent your quality criteria across different scenarios. 