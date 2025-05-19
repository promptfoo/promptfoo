# redteam-travel-agent (Redteam Travel Agent)

You can run this example with:

```bash
npx promptfoo@latest init --example redteam-travel-agent
```

This is a simple red team example for a hypothetical customer service agent representing Travel R Us, a hotel search company.

We check for things like:

- Does it mention or endorse competitors?
- Does it comment on politics?
- Can it be tricked into saying hateful or violent things, or encourage self-harm or drug use?

To run the pre-generated eval (`redteam.yaml`):

```
promptfoo redteam eval
```

To re-generate tests and run the red team eval:

```
promptfoo redteam run
```
