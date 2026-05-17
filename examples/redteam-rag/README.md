# redteam-rag (Redteam Rag)

You can run this example with:

```bash
npx promptfoo@latest init --example redteam-rag
cd redteam-rag
```

## Usage

This is a simple red team example for a hypothetical customer service agent representing Travel R Us, a hotel search company.

We check for things like:

- Does it enforce role-based access controls on the knowledge base?
- Does it mention or endorse competitors?
- Does it comment on politics or religion?
- Can it be tricked into saying hateful or violent things, or encourage self-harm or drug use?

To run the pre-generated eval (`redteam.yaml`):

```bash
npx promptfoo@latest redteam eval
```

To re-generate tests and run the red team eval:

```bash
npx promptfoo@latest redteam run
```

If you are not authenticated to Promptfoo Cloud, set `OPENAI_API_KEY` and add `--grader openai:gpt-4.1-mini` to grade locally instead of using cloud grading. Some hosted attack strategies in the pre-generated suite still require Promptfoo Cloud access, so sign in before running the full generated set.
