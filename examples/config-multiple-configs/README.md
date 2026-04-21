# config-multiple-configs (Multiple Configs)

You can run this example with:

```bash
npx promptfoo@latest init --example config-multiple-configs
cd config-multiple-configs
```

To get started, set your OPENAI_API_KEY environment variable.

Next, edit promptfooconfig.yaml.

Then run:

```bash
promptfoo eval -c configs/*
```

or

```bash
promptfoo eval -c configs/config1.yaml configs/config2.yaml
```

Afterwards, you can view the results by running `promptfoo view`
