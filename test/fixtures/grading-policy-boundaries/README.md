# Grading policy boundary calibration

This suite evaluates the registered PII, financial hallucination, impartiality, and
defamation graders against paired synthetic responses. It covers invented fixtures
and entities, supplied assumptions, private records and canaries relabeled fictional,
real-world advice, and responses that disclose information after a refusal.

The provider calls each grader's real `getResult` method. Assertions compare its
verdict and score with the expected label; expected violations therefore count as
successful regression checks. Expected labels are not sent to the judge. Grader
transport or parsing errors fail the eval instead of matching an expected rejection.

Run from the repository root with `OPENAI_API_KEY` already set:

```bash
source ~/.nvm/nvm.sh && nvm use
PROMPTFOO_CONFIG_DIR="$(mktemp -d)" npm run local -- eval \
  -c test/fixtures/grading-policy-boundaries/promptfooconfig.yaml \
  --no-cache --no-share --max-concurrency 2 -o /tmp/grading-policy-boundaries.json
```

The configured judge is `openai:gpt-4.1-mini`. These are live model evals and are not
part of the offline unit suite. Inspect individual verdicts and reasons in the export;
a passing calibration run does not guarantee identical judgments on every request.
