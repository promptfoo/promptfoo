# guide-evals (Video Guide Evaluation Pack)

Evaluation configs for the [Video Generation Guide](/docs/guides/evaluate-video). Uses the Promptfoo red panda mascot to test genuinely hard video generation capabilities.

## What These Evals Test

| Eval | Capability Tested |
|------|-------------------|
| `pr-review-hero.yaml` | Identity consistency, action sequences, text rendering |
| `text-rendering.yaml` | On-screen text legibility, temporal stability, text accuracy |
| `camera-motion.yaml` | Camera control execution (orbit, zoom, dolly) |
| `variance-test.yaml` | Repeatability and score variance across samples |
| `multi-provider.yaml` | Cross-provider comparison on same prompts |
| `negative-test.yaml` | Rubric validation (should fail intentionally) |

## Prerequisites

```bash
# Required for video generation
export OPENAI_API_KEY=...           # Sora
export GOOGLE_PROJECT_ID=...        # Veo (+ gcloud auth)
export AWS_ACCESS_KEY_ID=...        # Nova Reel
export AWS_SECRET_ACCESS_KEY=...
export AWS_REGION=us-east-1
export LUMA_API_KEY=...             # Ray

# Required for judging
export GEMINI_API_KEY=...           # Or use Vertex AI credentials
```

## Usage

Run individual eval packs:

```bash
# Hero example (PR review storyboard)
npx promptfoo@latest eval -c examples/video-rubric/guide-evals/pr-review-hero.yaml

# Text rendering stress test
npx promptfoo@latest eval -c examples/video-rubric/guide-evals/text-rendering.yaml

# Camera motion (requires Nova Reel or Ray)
npx promptfoo@latest eval -c examples/video-rubric/guide-evals/camera-motion.yaml

# Variance test (uses repeat:3)
npx promptfoo@latest eval -c examples/video-rubric/guide-evals/variance-test.yaml

# All providers comparison
npx promptfoo@latest eval -c examples/video-rubric/guide-evals/multi-provider.yaml

# Negative tests (should fail)
npx promptfoo@latest eval -c examples/video-rubric/guide-evals/negative-test.yaml
```

View results:

```bash
npx promptfoo@latest view
```

## Evaluation Dimensions

### Identity Consistency
Video models struggle to maintain character appearance across frames. The red panda should:
- Keep the same colors (red/orange fur, white face markings)
- Maintain consistent proportions
- Not morph into different animals or styles

### Text Rendering
On-screen text is notoriously difficult. Tests include:
- Short text (LGTM - 4 chars)
- Medium text (APPROVED - 8 chars)
- Multi-word (NEEDS TESTS)
- Stability (no flickering or morphing letters)

### Action Sequences
Storyboard prompts test temporal coherence:
- Actions happen in requested order
- No random scene jumps
- Smooth transitions between beats

### Camera Motion
Tests provider-specific camera controls:
- Nova Reel: Explicit presets (orbit_left, zoom_in, dolly_forward)
- Ray: Natural language (orbit left slowly)
- Baseline: Static camera for comparison

## Prompt Design Tips

From these evals:

1. **Keep text short**: 4-10 characters, all caps, high contrast
2. **Request stability**: "hold steady for 2-3 seconds"
3. **Specify style**: "2D cartoon" produces more consistent results
4. **Simple backgrounds**: Reduces rendering complexity
5. **Explicit identity**: "keep appearance consistent throughout"

## Expected Results

- **pr-review-hero**: 60-80% pass rate on simple prompts, lower on storyboards
- **text-rendering**: Highly variable; LGTM easiest, multi-word hardest
- **camera-motion**: Nova Reel most reliable for explicit motion
- **variance-test**: Simple prompts = low variance, complex = high variance
- **negative-test**: All should FAIL (validates rubrics work)
