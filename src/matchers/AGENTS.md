# Assertion Matchers

Helpers and model-graded matcher implementations used by `src/assertions/`, `src/evaluator.ts`, redteam graders, and external matcher ports.

## Module Boundaries

- Keep one matcher family per module (`rag.ts`, `llmGrading.ts`, `similarity.ts`, etc.) instead of rebuilding a monolithic matcher file.
- Do not add a barrel module for `src/matchers/` and do not re-export matcher functions through another aggregator. Import concrete functions directly from their source module.
- Put shared provider resolution and context propagation in `providers.ts`, shared rubric loading/rendering in `rubric.ts`, and generic utility helpers in `shared.ts`.
- Avoid circular dependencies between matcher modules. Shared modules may be imported by matcher implementations, but matcher family modules should not import each other through an intermediate barrel.

## Behavior & Testing

- Preserve existing matcher signatures, result shapes, score/pass semantics, and token accounting unless you intentionally migrate every caller and update tests.
- When adding or changing a matcher, update the matching wrapper in `src/assertions/` if needed and run the corresponding tests in `test/matchers/` and `test/assertions/`.
- For provider resolution and rubric helpers (`providers.ts`, `rubric.ts`), also run `test/matchers/utils.test.ts`.
- For shared utility helpers (`shared.ts`), run `test/matchers/similarity.test.ts` and any external matcher tests that import those helpers.
