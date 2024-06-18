There are two examples:

- prompt_example.yaml shows how to pull from portkey's prompt management platform. It requires you to set PORTKEY_API_KEY and OPENAI_API_KEY environment variables. Replace the portkey prompt with your own portkey prompt id.
- provider_example.yaml shows how to use portkey's gateway. It requires the PORTKEY_API_KEY environment variable.

Then run:

```
promptfoo eval
```

Afterwards, you can view the results by running `promptfoo view`
